import asyncio, sys, os
sys.path.insert(0, "/home/hrk/Projects/Invento/backend")

settings_code = open("/home/hrk/Projects/Invento/backend/app/core/config.py").read()
# Extract mongo_uri and mongo_db defaults
import re
mongo_uri_match = re.search(r'mongo_uri:\s*str\s*=\s*"([^"]*)"', settings_code)
mongo_db_match = re.search(r'mongo_db:\s*str\s*=\s*"([^"]*)"', settings_code)

MONGO_URI = mongo_uri_match.group(1) if mongo_uri_match else "mongodb://127.0.0.1:27017/?replicaSet=rs0"
MONGO_DB = mongo_db_match.group(1) if mongo_db_match else "invento"

# Override from env if present (production deployment)
MONGO_URI = os.environ.get("MONGO_URI", MONGO_URI)
MONGO_DB = os.environ.get("MONGO_DB", MONGO_DB)

print(f"MONGO_URI={MONGO_URI}")
print(f"MONGO_DB={MONGO_DB}")

from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    cols = await db.list_collection_names()
    print("DB:", MONGO_DB)
    print("COLLECTIONS:", sorted(cols))
    print()
    for c in sorted(cols):
        cnt = await db[c].count_documents({})
        print(f"  {c}: {cnt} docs")
        if cnt and cnt <= 15:
            docs = await db[c].find().limit(cnt).to_list(cnt)
            for d in docs:
                safe = {k:(str(v) if k in ("_id","bu_id") else v) for k,v in d.items()}
                print("     ", safe)
        print()
    await client.close()

asyncio.run(main())
