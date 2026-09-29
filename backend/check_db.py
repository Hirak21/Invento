import asyncio, motor.motor_asyncio

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://127.0.0.1:27017/?replicaSet=rs0")
    db = client["invento"]
    cols = await db.list_collection_names()
    print("COLLECTIONS:", sorted(cols))
    print()
    for c in sorted(cols):
        cnt = await db[c].count_documents({})
        print(f"  {c}: {cnt} docs")
        if cnt and cnt <= 12:
            docs = await db[c].find().limit(cnt).to_list(cnt)
            for d in docs:
                safe = {k:(str(v) if k in ("_id","bu_id") else v) for k,v in d.items()}
                print("     ", safe)
        print()
    await client.close()

asyncio.run(main())
