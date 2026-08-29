import asyncio
import httpx
from app.providers.factory import get_image_generation_provider
from app.providers.images import ImageGenerationRequest

async def main():
    provider = get_image_generation_provider()
    request = ImageGenerationRequest(
        prompt="A cute cat drinking coffee",
        aspect_ratio="1:1",
        width=1024,
        height=1024
    )
    print("Testing image generation...")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{provider._base_url}/chat/completions",
                headers=provider._headers(),
                json=provider._payload(request),
            )
            print("Status:", response.status_code)
            print("Response:", response.text)
    except Exception as e:
        print("Error!", repr(e))

if __name__ == "__main__":
    asyncio.run(main())
