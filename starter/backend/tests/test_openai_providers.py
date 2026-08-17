"""Contract tests for the direct OpenAI image and video adapters."""

from __future__ import annotations

import base64
import io
import json

import httpx
import pytest
from PIL import Image

from app.core.config import settings
from app.providers.images import (
    ASPECT_RATIOS,
    ImageGenerationRequest,
    OpenAIImageGenerationProvider,
)
from app.providers.video import (
    OpenAIVideoGenerationProvider,
    VideoGenerationRequest,
)

OPENAI_KEY = "sk-test-key-never-real"


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (12, 12), (20, 120, 80)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_openai_image_provider_sends_images_api_payload_and_decodes_base64(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generated = _png()
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"data": [{"b64_json": base64.b64encode(generated).decode("ascii")}]},
        )

    monkeypatch.setattr(settings, "image_generation_max_bytes", 8_000_000)
    width, height = ASPECT_RATIOS["4:5"]
    provider = OpenAIImageGenerationProvider(
        base_url="https://api.openai.com/v1",
        api_key=OPENAI_KEY,
        model_name="gpt-image-2",
        timeout_seconds=5,
        transport=httpx.MockTransport(handler),
    )

    result = await provider.generate(
        request=ImageGenerationRequest(
            prompt="Producto artesanal en una cafetería luminosa",
            aspect_ratio="4:5",
            width=width,
            height=height,
            negative_prompt="texto ilegible",
        )
    )

    assert result.content == generated
    assert result.mime_type == "image/png"
    assert result.provider_name == "openai"
    assert captured["authorization"] == f"Bearer {OPENAI_KEY}"
    payload = captured["body"]
    assert isinstance(payload, dict)
    assert payload["model"] == "gpt-image-2"
    assert payload["size"] == "1024x1280"
    assert "Evita en la imagen: texto ilegible" in payload["prompt"]


@pytest.mark.asyncio
async def test_openai_video_provider_submits_polls_downloads_and_deletes() -> None:
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        if request.method == "POST":
            assert request.url.path == "/v1/videos"
            body = request.content.decode("utf-8")
            assert "sora-2" in body
            assert "720x1280" in body
            assert "16" in body
            return httpx.Response(200, json={"id": "video_test_123", "status": "queued"})
        if request.method == "GET" and request.url.path.endswith("/content"):
            return httpx.Response(200, content=b"mp4-bytes")
        if request.method == "GET":
            return httpx.Response(200, json={"id": "video_test_123", "status": "completed"})
        return httpx.Response(204)

    provider = OpenAIVideoGenerationProvider(
        base_url="https://api.openai.com/v1",
        api_key=OPENAI_KEY,
        model_name="sora-2",
        timeout_seconds=5,
        transport=httpx.MockTransport(handler),
    )
    request = VideoGenerationRequest(
        prompt="Un producto artesanal en una mesa de madera",
        negative_prompt="sin texto ilegible",
        storyboard={
            "shots": [
                {
                    "order": 1,
                    "visual": "El producto en primer plano",
                    "camera": "Acercamiento suave",
                    "voiceover": "Conoce nuestra propuesta",
                }
            ]
        },
        aspect_ratio="9:16",
        duration_seconds=16,
        model="sora-2",
        source_image=None,
        source_image_mime=None,
    )

    submission = await provider.submit(request)
    state = await provider.check(submission.provider_job_id)
    artifact = await provider.download(submission.provider_job_id, duration_seconds=16)
    deleted = await provider.cancel(submission.provider_job_id)

    assert submission.provider_job_id == "video_test_123"
    assert submission.provider_status == "queued"
    assert state.ready is True
    assert state.failed is False
    assert state.cost_units == 1
    assert artifact.content == b"mp4-bytes"
    assert artifact.mime_type == "video/mp4"
    assert deleted is True
    assert calls == [
        "POST /v1/videos",
        "GET /v1/videos/video_test_123",
        "GET /v1/videos/video_test_123/content",
        "DELETE /v1/videos/video_test_123",
    ]
