import os
from dotenv import load_dotenv

load_dotenv()
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "leadflow")
STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"]
client: Optional[AsyncIOMotorClient] = None
db = None


def now_utc():
    return datetime.now(timezone.utc)


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return value


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    status: str = "New"


class LeadUpdate(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    company: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)


class DiscussionCreate(BaseModel):
    note: str = Field(min_length=1, max_length=4000)
    follow_up_at: Optional[datetime] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=4000)
    db = client[DB_NAME]
    try:
        await client.admin.command("ping")
        if os.getenv("SEED_ON_START", "true").lower() == "true":
            await seed_if_empty()
    except Exception as exc:
        print(f"MongoDB not ready at startup: {exc}")
    yield
    if client:
        client.close()


app = FastAPI(title="LeadFlow API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def serialize_lead(doc):
    return {"id": doc["id"], "name": doc["name"], "company": doc.get("company", ""), "phone": doc.get("phone", ""), "status": doc["status"], "follow_up_at": iso(doc.get("follow_up_at")), "created_at": iso(doc.get("created_at")), "updated_at": iso(doc.get("updated_at")), "last_discussion": doc.get("last_discussion")}


def serialize_discussion(doc):
    return {"id": doc["id"], "lead_id": doc["lead_id"], "note": doc["note"], "created_at": iso(doc["created_at"]), "follow_up_at": iso(doc.get("follow_up_at"))}


async def seed_if_empty():
    if await db.leads.count_documents({}) > 0:
        return
    now = now_utc()
    samples = [
        ("Sarah Connor", "Skynet Financial", "+1 555 0101", "Qualified", now + timedelta(hours=3), "Interested in retirement planning; requested a follow-up."),
        ("Michael Chen", "Northstar Wealth", "+1 555 0102", "Proposal Sent", now - timedelta(days=1), "Sent the investment proposal and fee breakdown."),
        ("Priya Sharma", "Independent Advisor", "+91 98765 43210", "Contacted", now + timedelta(days=1), "Had an introductory call about long-term goals."),
        ("Jordan Lee", "BrightPath Partners", "+1 555 0104", "New", None, "Added from the website enquiry form."),
        ("Ava Patel", "Cedar Grove Capital", "+1 555 0105", "Won", None, "Client accepted the annual advisory plan."),
        ("Noah Williams", "Harbor Financial", "+1 555 0106", "Lost", None, "Decided to pause the search until next quarter."),
    ]
    for name, company, phone, lead_status, followup, note in samples:
        lead_id = str(uuid4())
        created = now - timedelta(days=3)
        await db.leads.insert_one({"id": lead_id, "name": name, "company": company, "phone": phone, "status": lead_status, "follow_up_at": followup, "created_at": created, "updated_at": now, "last_discussion": {"note": note, "created_at": iso(created)}})
        await db.discussions.insert_one({"id": str(uuid4()), "lead_id": lead_id, "note": note, "created_at": created, "follow_up_at": followup})


@app.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.get("/api/leads")
async def list_leads(status_filter: Optional[str] = Query(default=None, alias="status"), search: Optional[str] = None):
    if status_filter and status_filter not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lead status")
    query = {}
    if status_filter:
        query["status"] = status_filter
    if search and search.strip():
        import re
        pattern = re.escape(search.strip())
        query["$or"] = [{"name": {"$regex": pattern, "$options": "i"}}, {"company": {"$regex": pattern, "$options": "i"}}]
    docs = await db.leads.find(query, {"_id": 0}).to_list(length=1000)
    return [serialize_lead(d) for d in docs]


@app.post("/api/leads", status_code=status.HTTP_201_CREATED)
async def create_lead(payload: LeadCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    if payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lead status")
    stamp = now_utc()
    doc = {"id": str(uuid4()), "name": name, "company": payload.company.strip(), "phone": payload.phone.strip(), "status": payload.status, "follow_up_at": None, "created_at": stamp, "updated_at": stamp, "last_discussion": None}
    await db.leads.insert_one(doc)
    return serialize_lead(doc)


@app.get("/api/leads/{lead_id}")
async def get_lead(lead_id: str):
    doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Lead not found")
    return serialize_lead(doc)




@app.patch("/api/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "status" in changes and changes["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid lead status")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Name is required")
    changes["updated_at"] = now_utc()
    result = await db.leads.update_one({"id": lead_id}, {"$set": changes})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return await get_lead(lead_id)


@app.get("/api/leads/{lead_id}/discussions")
async def list_discussions(lead_id: str):
    if not await db.leads.find_one({"id": lead_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Lead not found")
    docs = await db.discussions.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    return [serialize_discussion(d) for d in docs]


@app.post("/api/leads/{lead_id}/discussions", status_code=status.HTTP_201_CREATED)
async def create_discussion(lead_id: str, payload: DiscussionCreate):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=422, detail="Discussion note is required")
    stamp = now_utc()
    followup = payload.follow_up_at
    if followup and followup.tzinfo is None:
        followup = followup.replace(tzinfo=timezone.utc)
    doc = {"id": str(uuid4()), "lead_id": lead_id, "note": note, "created_at": stamp, "follow_up_at": followup}
    await db.discussions.insert_one(doc)
    changes = {"last_discussion": {"note": note, "created_at": iso(stamp)}, "updated_at": stamp}
    if followup is not None:
        changes["follow_up_at"] = followup
    await db.leads.update_one({"id": lead_id}, {"$set": changes})
    return serialize_discussion(doc)
