import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
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
        image = await provider.generate(request=request)
        print("Success! Downloaded", len(image.content), "bytes.")
        print("MIME type:", image.mime_type)
        with open("test_image.jpg", "wb") as f:
            f.write(image.content)
        print("Saved to test_image.jpg")
    except Exception as e:
        print("Error!", repr(e))
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
