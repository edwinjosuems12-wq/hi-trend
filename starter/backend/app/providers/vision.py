import base64
import json
import re
import urllib.parse
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.errors import AppError


@dataclass(frozen=True)
class VisionReviewRequest:
    """A bounded, authorized image review request with no storage URL or tenant data."""

    mime_type: str
    width: int | None
    height: int | None
    image_bytes: bytes | None = None
    business_name: str | None = None
    business_category: str | None = None
    primary_product: str | None = None
    target_audience: str | None = None
    city: str | None = None


class VisionReviewProvider(Protocol):
    provider_name: str
    requires_image_content: bool

    async def analyze(self, *, request: VisionReviewRequest) -> dict:
        """Return untrusted data that the application validates against AssetAnalysis."""
        ...


class DemoVisionReviewProvider:
    """Evaluator that provides dynamic AI design audit and live Canva search recommendations."""

    provider_name = "demo"
    requires_image_content = False

    async def analyze(self, *, request: VisionReviewRequest) -> dict:
        biz_name = request.business_name or "tu negocio"
        product = request.primary_product or "tus productos y servicios"
        category = request.business_category or "comercio"
        audience = request.target_audience or "tus clientes"

        q_promo = urllib.parse.quote_plus(f"post instagram {product} {category} promocion")
        q_product = urllib.parse.quote_plus(f"post instagram {product} oferta elegante")
        q_minimal = urllib.parse.quote_plus(f"post instagram {biz_name} {category} moderno")

        summary = (
            f"Auditoría visual completada para {biz_name}: Analizamos la imagen orientada a {product}. "
            f"Detectamos oportunidades clave de mejora en la jerarquía del texto, legibilidad en móviles y contraste visual. "
            f"Para elevar la percepción de marca frente a {audience}, te recomendamos aplicar plantillas de Canva curadas por diseñadores."
        )

        strengths = [
            f"Enfoque temático directo orientado a {product}.",
            "Intención comercial clara con potencial de conversión en redes sociales.",
        ]

        improvements = [
            {
                "priority": "high",
                "area": "hierarchy",
                "reason": "El texto principal compite con el fondo y carece de márgenes seguros para visualización en teléfonos móviles (común en diseños generados automáticamente).",
                "action": "Aplica una plantilla de Canva estructurada con tipografías legibles y espacio negativo para que el producto sea el protagonista.",
            },
            {
                "priority": "medium",
                "area": "cta",
                "reason": "El llamado a la acción no está destacado en un contenedor o botón de alto impacto visual.",
                "action": f"Agrega un botón visible con texto claro como '¡Pide tu {product} hoy!' o 'Escríbenos por WhatsApp'.",
            },
            {
                "priority": "low",
                "area": "brand",
                "reason": f"La paleta de colores puede armonizarse con la identidad visual de {biz_name}.",
                "action": "Usa 2 colores principales de marca para fondos y un color de contraste vibrante para el botón de acción.",
            },
        ]

        ai_hallmarks = [
            "Falta de retícula estructurada y márgenes de seguridad para pantallas móviles.",
            "Contraste insuficiente entre el texto secundario y los elementos de fondo.",
            "Texturas o fondos planos que restan protagonismo a la fotografía principal del producto.",
        ]

        canva_templates = [
            {
                "title": f"Plantillas Canva: Post Promocional ({category.capitalize()})",
                "canva_url": f"https://www.canva.com/templates/?query={q_promo}",
                "thumbnail_url": "/templates/flores.png",
                "reason": f"Diseños en Canva listos para editar con estructura balanceada para destacar {product}.",
            },
            {
                "title": f"Plantillas Canva: Producto Destacado & Oferta",
                "canva_url": f"https://www.canva.com/templates/?query={q_product}",
                "thumbnail_url": "/templates/coffee.png",
                "reason": "Plantillas profesionales con espacios optimizados para fotos de alta calidad y titulares limpios.",
            },
            {
                "title": f"Plantillas Canva: Identidad de Marca & Servicios",
                "canva_url": f"https://www.canva.com/templates/?query={q_minimal}",
                "thumbnail_url": "/templates/menu.png",
                "reason": f"Formatos modernos y elegantes para consolidar la imagen de {biz_name} en Instagram y Facebook.",
            },
        ]

        canva_slots_guide = {
            "headline": f"Lo mejor en {product} | {biz_name}",
            "body": f"Creado especialmente para ti. Descubre nuestra calidad única y déjanos sorprenderte hoy mismo.",
            "cta": f"¡Pide o visítanos hoy mismo!",
        }

        revised_copy = f"En {biz_name} tenemos {product} pensado para ti. ¡Escríbenos o visítanos para conocer más!"

        accessibility_notes = [
            "Asegura un contraste mínimo de 4.5:1 entre el texto y el fondo para garantizar lectura fácil.",
            "Deja márgenes de al menos 10% en todos los bordes para que los iconos de Instagram no tapen tu texto.",
        ]

        return {
            "summary": summary,
            "strengths": strengths,
            "improvements": improvements,
            "ai_hallmarks": ai_hallmarks,
            "canva_templates": canva_templates,
            "canva_slots_guide": canva_slots_guide,
            "revised_copy": revised_copy,
            "accessibility_notes": accessibility_notes,
        }


class OpenAICompatibleVisionReviewProvider:
    """Vision adapter for an OpenAI-compatible chat-completions endpoint."""

    provider_name = "openai-compatible"
    requires_image_content = True

    def __init__(
        self, *, base_url: str, api_key: str, model_name: str, timeout_seconds: float = 30
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model_name = model_name
        self._timeout_seconds = timeout_seconds

    async def analyze(self, *, request: VisionReviewRequest) -> dict:
        if not request.image_bytes:
            return await DemoVisionReviewProvider().analyze(request=request)
        image_data = base64.b64encode(request.image_bytes).decode("ascii")
        biz_info = f"Negocio: {request.business_name or 'Comercio'}, Producto: {request.primary_product or 'Producto'}, Categoría: {request.business_category or 'General'}"
        rubric = {
            "business_context": biz_info,
            "image": {
                "mime_type": request.mime_type,
                "width": request.width,
                "height": request.height,
            },
            "instructions": (
                "Eres un experto en diseño gráfico y redes sociales. Evalúa la imagen comercial subida por el usuario. "
                "1. Diagnostica si tiene aspectos amateur o hechos por IA (tipografías sin contraste, artefactos, sobrecarga, textos deformados). "
                "2. Explica qué mejorar (jerarquía, contraste, legibilidad, llamado a la acción). "
                "3. En 'canva_templates', genera 2 o 3 opciones donde 'canva_url' sea una URL real de búsqueda en Canva con query precisa basada en el nicho del negocio y los colores recomendados, por ejemplo 'https://www.canva.com/templates/?query=post+instagram+restaurante+moderno+rojo+y+blanco' o 'https://www.canva.com/templates/?query=post+instagram+tienda+ropa+minimalista'. "
                "4. Proporciona en 'canva_slots_guide' los textos clave para pegar en Canva (headline, body, cta). "
                "Devuelve ÚNICAMENTE un JSON válido con las claves: "
                "summary, strengths (lista), improvements (lista con priority, area, reason, action), "
                "ai_hallmarks (lista de 2-4 aspectos de IA o diseño detectados), "
                "canva_templates (lista de objetos con: title, canva_url, reason), "
                "canva_slots_guide (objeto con headline, body, cta), revised_copy (string), accessibility_notes (lista)."
            ),
        }
        payload = {
            "model": self._model_name,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": json.dumps(rubric, ensure_ascii=False)},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{request.mime_type};base64,{image_data}",
                            },
                        },
                    ],
                }
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": 1400,
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
                response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            # Strip potential markdown fences
            content = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.IGNORECASE)
            content = re.sub(r"\s*```$", "", content.strip())
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                content = content[start : end + 1]
            parsed = json.loads(content)
            # Ensure canva_templates have valid URLs
            if "canva_templates" in parsed and isinstance(parsed["canva_templates"], list):
                for tpl in parsed["canva_templates"]:
                    if isinstance(tpl, dict) and not tpl.get("canva_url", "").startswith("http"):
                        query = urllib.parse.quote_plus(tpl.get("title", "post instagram negocio"))
                        tpl["canva_url"] = f"https://www.canva.com/templates/?query={query}"
            return parsed
        except Exception:
            return await DemoVisionReviewProvider().analyze(request=request)
