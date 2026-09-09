"""
MongoDB Persistence & Retrieval for Simulation Logs & Sessions.
Persists streaming logs to the `simulation_logs` and `simulation_sessions` collections in MongoDB.
"""

from datetime import datetime, timezone
from typing import Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.logging import get_logger

router = APIRouter(prefix="/api/v1/risk/simulation", tags=["simulation_logs"])
logger = get_logger()


class LogEntryIn(BaseModel):
    id: str
    sessionId: str
    timestamp: str
    stage: str
    stageName: str
    level: str
    message: str
    payload: Optional[dict] = None
    durationMs: Optional[float] = None


class BatchLogsIn(BaseModel):
    sessionId: str
    logs: List[LogEntryIn]


class SessionIn(BaseModel):
    sessionId: str
    companyName: str
    industry: str
    currency: str = "INR"
    budget: float = 1000000
    status: str = "active"


@router.post("/logs")
async def append_simulation_logs(payload: BatchLogsIn):
    try:
        db = get_db()
        docs = [log.model_dump() for log in payload.logs]
        if docs:
            await db.simulation_logs.insert_many(docs, ordered=False)
            await db.simulation_sessions.update_one(
                {"sessionId": payload.sessionId},
                {
                    "$inc": {"totalLogsCount": len(docs)},
                    "$set": {"updatedAt": datetime.now(timezone.utc).isoformat()}
                },
                upsert=True
            )
        return {"success": True, "count": len(docs)}
    except Exception as exc:
        logger.warning("simulation_logs_insert_failed", error=str(exc))
        return {"success": False, "error": str(exc)}


@router.post("/session")
async def create_or_update_session(payload: SessionIn):
    try:
        db = get_db()
        doc = payload.model_dump()
        doc["createdAt"] = datetime.now(timezone.utc).isoformat()
        doc["updatedAt"] = doc["createdAt"]
        doc["totalLogsCount"] = 0
        doc["llmCallsCount"] = 0
        await db.simulation_sessions.update_one(
            {"sessionId": payload.sessionId},
            {"$set": doc},
            upsert=True
        )
        return doc
    except Exception as exc:
        logger.warning("simulation_session_upsert_failed", error=str(exc))
        return {"sessionId": payload.sessionId, "status": "active"}


@router.get("/session/{session_id}/logs")
async def get_session_logs(session_id: str):
    try:
        db = get_db()
        cursor = db.simulation_logs.find({"sessionId": session_id}, {"_id": 0}).sort("timestamp", 1)
        logs = await cursor.to_list(length=2000)
        return {"sessionId": session_id, "count": len(logs), "logs": logs}
    except Exception as exc:
        logger.warning("simulation_logs_fetch_failed", error=str(exc))
        return {"sessionId": session_id, "count": 0, "logs": []}


@router.get("/sessions")
async def list_simulation_sessions():
    try:
        db = get_db()
        cursor = db.simulation_sessions.find({}, {"_id": 0}).sort("updatedAt", -1).limit(50)
        sessions = await cursor.to_list(length=50)
        return {"sessions": sessions}
    except Exception as exc:
        logger.warning("simulation_sessions_list_failed", error=str(exc))
        return {"sessions": []}
