"""Seed the local database. Normally the API seeds an empty database on startup."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.getenv("DB_NAME", "leadflow")]
    if await db.leads.count_documents({}) == 0:
        print("The API seeds six example leads on startup. Start the API with SEED_ON_START=true.")
    else:
        print(f"Database already contains {await db.leads.count_documents({})} leads; leaving data unchanged.")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
