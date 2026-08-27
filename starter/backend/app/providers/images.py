"""Image generation provider interface and adapters.

The provider boundary receives a bounded, database-free request: a composed
prompt, one of three approved aspect ratios and, optionally, raw reference
bytes the workspace already owns. It never receives workspace identifiers,
emails, asset IDs, storage keys or any other tenant metadata.

Nothing here logs or returns a raw provider response: an upstream body may echo
prompts, account balances or authentication material, so failures are mapped to
short, user-safe Spanish messages before they leave this module.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
from PIL import Image, ImageDraw

from app.core.config import settings
from app.core.errors import AppError

# Exactly three formats are supported, and the pixel sizes are server-owned so
# a client can never ask a provider for an arbitrary resolution.
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "4:5": (1024, 1280),
    "9:16": (1024, 1792),
}

_RETRY_AFTER_MIN = 1
_RETRY_AFTER_MAX = 86_400


@dataclass(frozen=True)
class ImageGenerationRequest:
    """A bounded, tenant-free image request."""

    prompt: str
    aspect_ratio: str
    width: int
    height: int
    negative_prompt: str | None = None
    reference_image: bytes | None = None
    reference_mime_type: str | None = None


@dataclass(frozen=True)
class GeneratedImage:
    """Untrusted provider bytes plus the metadata the application may persist."""

    content: bytes
    mime_type: str
    provider_name: str
    model: str
    usage_metadata: dict[str, Any] = field(default_factory=dict)


class ImageGenerationProvider(Protocol):
    provider_name: str
    model_name: str

    async def generate(self, *, request: ImageGenerationRequest) -> GeneratedImage:
        """Return untrusted bytes the application validates before storing."""
        ...


def _bounded_retry_after(value: str | None) -> int | None:
    if not value:
        return None
    try:
        seconds = int(value.strip())
    except (AttributeError, ValueError):
        return None
    if seconds < _RETRY_AFTER_MIN or seconds > _RETRY_AFTER_MAX:
        return None
    return seconds


class DemoImageGenerationProvider:
    """Offline renderer used in development and tests: no network, no cost.

    The output is deterministic for a given prompt and ratio so tests can assert
    on it, and it is visibly a placeholder so it can never be mistaken for a
    real generated image.
    """

    provider_name = "demo"
    model_name = "demo-image-v1"

    async def generate(self, *, request: ImageGenerationRequest) -> GeneratedImage:
        digest = hashlib.sha256(f"{request.prompt}|{request.aspect_ratio}".encode()).digest()
        background = (digest[0] // 2 + 60, digest[1] // 2 + 60, digest[2] // 2 + 60)
        image = Image.new("RGB", (request.width, request.height), background)
        draw = ImageDraw.Draw(image)
        margin = max(request.width // 20, 8)
        draw.rectangle(
            (margin, margin, request.width - margin, request.height - margin),
            outline=(255, 255, 255),
            width=max(request.width // 160, 2),
        )
        draw.text(
            (margin * 2, margin * 2),
            f"HiTrendy\nvista previa local\n{request.aspect_ratio}",
            fill=(255, 255, 255),
        )
        buffer = _encode_png(image)
        return GeneratedImage(
            content=buffer,
            mime_type="image/png",
            provider_name=self.provider_name,
            model=self.model_name,
            usage_metadata={"provider": self.provider_name, "model": self.model_name},
        )


def _encode_png(image: Image.Image) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class OpenAIImageGenerationProvider:
    """Direct adapter for OpenAI's Images API.

    The adapter deliberately uses the Images API instead of an OpenAI SDK so
    the provider boundary stays small and the existing HTTP transport can be
    replaced in tests. GPT Image models return base64 image bytes, which are
    decoded locally before the application validates and stores them.
    """

    provider_name = "openai"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model_name: str,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model_name = model_name
        self._timeout_seconds = timeout_seconds
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    @staticmethod
    def _size(request: ImageGenerationRequest) -> str:
        return f"{request.width}x{request.height}"

    @staticmethod
    def _prompt(request: ImageGenerationRequest) -> str:
        prompt = request.prompt.strip()
        if request.negative_prompt:
            prompt = f"{prompt}\n\nEvita en la imagen: {request.negative_prompt.strip()}"
        return prompt

    async def generate(self, *, request: ImageGenerationRequest) -> GeneratedImage:
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds, transport=self._transport
            ) as client:
                if request.reference_image and request.reference_mime_type:
                    response = await client.post(
                        f"{self._base_url}/images/edits",
                        headers=self._headers(),
                        data={
                            "model": self.model_name,
                            "prompt": self._prompt(request),
                            "n": "1",
                            "size": self._size(request),
                            "output_format": "png",
                        },
                        files={
                            "image": (
                                "reference-image",
                                request.reference_image,
                                request.reference_mime_type,
                            )
                        },
                    )
                else:
                    response = await client.post(
                        f"{self._base_url}/images/generations",
                        headers={**self._headers(), "Content-Type": "application/json"},
                        json={
                            "model": self.model_name,
                            "prompt": self._prompt(request),
                            "n": 1,
                            "size": self._size(request),
                            "quality": "auto",
                            "output_format": "png",
                        },
                    )
        except httpx.TimeoutException as exc:
            raise AppError(
                "IMAGE_PROVIDER_TIMEOUT",
                "La generación de imágenes tardó demasiado. Inténtalo nuevamente.",
                status_code=504,
                retryable=True,
            ) from exc
        except httpx.RequestError as exc:
            raise AppError(
                "IMAGE_PROVIDER_UNAVAILABLE",
                "La generación de imágenes no está disponible en este momento.",
                status_code=503,
                retryable=True,
            ) from exc

        if response.status_code >= 400:
            raise _map_status_error(response)
        return self._decode(response)

    def _decode(self, response: httpx.Response) -> GeneratedImage:
        try:
            body = response.json()
            image = body["data"][0]
            encoded = image["b64_json"]
            if not isinstance(encoded, str) or not encoded:
                raise ValueError("missing image")
            content = base64.b64decode(encoded, validate=True)
        except (ValueError, KeyError, IndexError, TypeError, binascii.Error) as exc:
            raise _invalid_response() from exc

        if not content or len(content) > settings.image_generation_max_bytes:
            raise _invalid_response()
        usage = body.get("usage") if isinstance(body, dict) else None
        metadata: dict[str, Any] = {
            "provider": self.provider_name,
            "model": self.model_name,
        }
        if isinstance(usage, dict):
            for key in ("input_tokens", "output_tokens", "total_tokens"):
                value = usage.get(key)
                if isinstance(value, int):
                    metadata[key] = value
        return GeneratedImage(
            content=content,
            mime_type="image/png",
            provider_name=self.provider_name,
            model=self.model_name,
            usage_metadata=metadata,
        )


class OpenRouterImageGenerationProvider:
    """OpenRouter adapter for a server-selected image model.

    The model identifier comes from configuration, never from a request, and the
    authorization header is built per call so it is never stored on the instance
    in a shape that a repr or a log formatter could surface.
    """

    provider_name = "openrouter"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model_name: str,
        timeout_seconds: float,
        max_retries: int = 0,
        retry_base_seconds: float = 0.5,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model_name = model_name
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._retry_base_seconds = retry_base_seconds
        # Injected only by tests. The factory never passes one, so production
        # always goes through the real network stack.
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if settings.ai_http_referer:
            headers["HTTP-Referer"] = settings.ai_http_referer
        if settings.ai_app_title:
            headers["X-Title"] = settings.ai_app_title
        return headers

    def _payload(self, request: ImageGenerationRequest) -> dict[str, Any]:
        content: list[dict[str, Any]] = [{"type": "text", "text": request.prompt}]
        if request.negative_prompt:
            # What the user asked to avoid is part of what they approved, so it
            # travels with the request. It is a second text part rather than a
            # top-level key because the payload shape is fixed: only ``model``,
            # ``modalities``, ``messages`` and ``extra_body`` ever leave here.
            content.append(
                {"type": "text", "text": f"Evita en la imagen: {request.negative_prompt}"}
            )
        if request.reference_image and request.reference_mime_type:
            encoded = base64.b64encode(request.reference_image).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{request.reference_mime_type};base64,{encoded}"},
                }
            )
        return {
            "model": self.model_name,
            "modalities": ["image", "text"],
            "messages": [{"role": "user", "content": content}],
            "extra_body": {
                "image_config": {
                    "aspect_ratio": request.aspect_ratio,
                    "width": request.width,
                    "height": request.height,
                }
            },
        }

    async def generate(self, *, request: ImageGenerationRequest) -> GeneratedImage:
        last_error: AppError | None = None
        for attempt in range(self._max_retries + 1):
            try:
                return await self._attempt(request)
            except AppError as error:
                if not error.retryable or attempt == self._max_retries:
                    raise
                last_error = error
                await asyncio.sleep(self._retry_base_seconds * 2**attempt)
        assert last_error is not None
        raise last_error

    async def _attempt(self, request: ImageGenerationRequest) -> GeneratedImage:
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds, transport=self._transport
            ) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=self._payload(request),
                )
        except httpx.TimeoutException as exc:
            raise AppError(
                "IMAGE_PROVIDER_TIMEOUT",
                "La generación de imágenes tardó demasiado. Inténtalo nuevamente.",
                status_code=504,
                retryable=True,
            ) from exc
        except httpx.RequestError as exc:
            raise AppError(
                "IMAGE_PROVIDER_UNAVAILABLE",
                "La generación de imágenes no está disponible en este momento.",
                status_code=503,
                retryable=True,
            ) from exc

        if response.status_code >= 400:
            raise _map_status_error(response)
        return self._decode(response)

    def _decode(self, response: httpx.Response) -> GeneratedImage:
        try:
            body = response.json()
            message = body["choices"][0]["message"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise _invalid_response() from exc

        content, mime_type = _extract_image(message)
        usage = body.get("usage") if isinstance(body, dict) else None
        metadata: dict[str, Any] = {
            "provider": self.provider_name,
            "model": self.model_name,
        }
        if isinstance(usage, dict):
            # Only counters are kept: the raw body may carry balances and echoes
            # of the prompt that must never reach storage or logs.
            for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                value = usage.get(key)
                if isinstance(value, int):
                    metadata[key] = value
        return GeneratedImage(
            content=content,
            mime_type=mime_type,
            provider_name=self.provider_name,
            model=self.model_name,
            usage_metadata=metadata,
        )


def _extract_image(message: Any) -> tuple[bytes, str]:
    if not isinstance(message, dict):
        raise _invalid_response()
    candidates: list[Any] = []
    images = message.get("images")
    if isinstance(images, list):
        candidates.extend(images)
    content = message.get("content")
    if isinstance(content, list):
        candidates.extend(content)
    for candidate in candidates:
        url = _candidate_url(candidate)
        if url:
            return _decode_data_url(url)
    raise _invalid_response()


def _candidate_url(candidate: Any) -> str | None:
    if not isinstance(candidate, dict):
        return None
    image_url = candidate.get("image_url")
    if isinstance(image_url, dict):
        url = image_url.get("url")
        if isinstance(url, str):
            return url
    url = candidate.get("url")
    return url if isinstance(url, str) else None


def _decode_data_url(url: str) -> tuple[bytes, str]:
    """Accept only inline data URLs: a remote URL would be an unvalidated fetch."""

    prefix = "data:"
    marker = ";base64,"
    if not url.startswith(prefix) or marker not in url:
        raise _invalid_response()
    header, _, encoded = url.partition(marker)
    mime_type = header[len(prefix) :].strip().lower()
    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise _invalid_response()
    if len(encoded) > settings.image_generation_max_bytes * 2:
        raise _invalid_response()
    try:
        return base64.b64decode(encoded, validate=True), mime_type
    except (binascii.Error, ValueError) as exc:
        raise _invalid_response() from exc


def _invalid_response() -> AppError:
    return AppError(
        "IMAGE_PROVIDER_INVALID_RESPONSE",
        "No recibimos una imagen válida. Inténtalo nuevamente.",
        status_code=502,
        retryable=True,
    )


def _map_status_error(response: httpx.Response) -> AppError:
    status = response.status_code
    if status == 402:
        return AppError(
            "PAYMENT_REQUIRED",
            "Esta generación de imágenes requiere presupuesto habilitado.",
            status_code=402,
        )
    if status == 429:
        retry_after = _bounded_retry_after(response.headers.get("Retry-After"))
        if retry_after is None:
            return AppError(
                "IMAGE_PROVIDER_QUOTA_EXHAUSTED",
                "Se agotó la cuota de generación de imágenes.",
                status_code=429,
            )
        return AppError(
            "IMAGE_PROVIDER_RATE_LIMITED",
            "Demasiadas solicitudes de imagen. Inténtalo nuevamente en unos minutos.",
            status_code=429,
            retryable=True,
            retry_after=retry_after,
        )
    if status >= 500:
        return AppError(
            "IMAGE_PROVIDER_UNAVAILABLE",
            "La generación de imágenes no está disponible en este momento.",
            status_code=503,
            retryable=True,
        )
    return AppError(
        "IMAGE_PROVIDER_REJECTED",
        "El proveedor rechazó la solicitud de imagen.",
        status_code=502,
    )
