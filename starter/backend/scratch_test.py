import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.base import Base
from app.conversations.repository import SqlBusinessContextRepository, SqlArtifactRepository
from app.providers.factory import get_content_provider
from app.core.capabilities import QualityLevel
from app.services.generate_social_post import GenerateSocialPostService
from app.domain.models import GenerateSocialPostCommand

async def main():
    engine = create_async_engine("sqlite+aiosqlite:///./hitrendy.db")
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as db:
        # Create a test business first to satisfy FKs if needed
        from app.db.models import Workspace, User, WorkspaceMember, BusinessProfile
        
        # We need a workspace and a business. Let's assume the DB has them, or we query the first one.
        from sqlalchemy import select
        biz = (await db.execute(select(BusinessProfile).limit(1))).scalar_one_or_none()
        if not biz:
            print("No business found.")
            return

        biz_repo = SqlBusinessContextRepository(db)
        art_repo = SqlArtifactRepository(db)
        provider = get_content_provider(quality_level=QualityLevel.FAST)
        service = GenerateSocialPostService(biz_repo, art_repo, provider)

        command = GenerateSocialPostCommand(
            workspace_id=biz.workspace_id,
            business_id=biz.id,
            conversation_id="f04aeaa5f2a44160b900688c76550857", # Just a string
            text="Haz una prueba",
            platform="instagram",
            objective="reach",
            tone="professional",
            locale="es"
        )
        
        print("Executing service...")
        try:
            artifact = await service.execute(command)
            await db.commit()
            print("Success!", artifact)
        except Exception as e:
            await db.rollback()
            print("Error!", repr(e))
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
