import asyncio
import httpx
import json
import uuid

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Create conversation to get a conversation_id
        res_conv = await client.post(
            "http://localhost:8001/api/v1/conversations",
            json={"business_id": "b1", "title": "Test Chat"},
            headers={"Authorization": "Bearer demo-token"} # if needed
        )
        print("Conv:", res_conv.status_code, res_conv.text)
        
        if res_conv.status_code == 201:
            conv_id = res_conv.json()["id"]
            
            # 2. Send message
            res_msg = await client.post(
                f"http://localhost:8001/api/v1/conversations/{conv_id}/messages",
                json={
                    "text": "Haz una prueba",
                    "ui_intent": "create_social_post",
                    "platform": "instagram",
                    "tone": "professional",
                    "objective": "reach",
                    "quality_level": "fast",
                    "locale": "es"
                },
                headers={
                    "Idempotency-Key": uuid.uuid4().hex
                },
                timeout=60.0
            )
            print("Msg:", res_msg.status_code, res_msg.text)

if __name__ == "__main__":
    asyncio.run(main())
