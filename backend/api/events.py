"""Event ingestion and response API routes."""

import time
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

from core.graph import novasec_graph, THREAD_STORE
from api.websocket import broadcast
from utils.ledger_store import append_session

router = APIRouter()


class RespondBody(BaseModel):
    voice_transcript: str


@router.post("/api/events/ingest")
async def ingest_event(body: dict):
    thread_id = str(uuid4())
    state = {
        "raw_event": body,
        "started_at": time.time(),
        "thread_id": thread_id,
        "resolved": False,
        "ledger": [],
        "incident": None,
        "fix_proposal": None,
        "commander_brief": None,
        "user_intent": None,
        "fix_result": None,
        "error": None,
        "threat_context": None,
        "blast_radius": None,
    }
    THREAD_STORE["active"] = thread_id
    config = {"configurable": {"thread_id": thread_id}}

    await novasec_graph.ainvoke(state, config=config)

    current = await novasec_graph.aget_state(config)
    current_state = current.values

    await broadcast(current_state.get("commander_brief") or "")

    return {
        "thread_id": thread_id,
        "commander_brief": current_state.get("commander_brief"),
        "incident": current_state.get("incident"),
        "threat_context": current_state.get("threat_context"),
        "blast_radius": current_state.get("blast_radius"),
        "resolved": current_state.get("resolved"),
    }


@router.post("/api/events/respond")
async def respond_to_event(body: RespondBody):
    thread_id = THREAD_STORE.get("active")
    config = {"configurable": {"thread_id": thread_id}}

    await novasec_graph.aupdate_state(config, {"user_intent": body.voice_transcript})
    await novasec_graph.ainvoke(None, config=config)

    final = await novasec_graph.aget_state(config)
    final_state = final.values

    await broadcast(final_state.get("commander_brief") or "")

    ledger = final_state.get("ledger", [])
    await append_session(ledger)

    return {
        "resolved": final_state.get("resolved"),
        "fix_result": final_state.get("fix_result"),
        "commander_brief": final_state.get("commander_brief"),
        "ledger": ledger,
    }


@router.get("/api/ledger")
async def get_ledger():
    thread_id = THREAD_STORE.get("active")
    if not thread_id:
        return []
    config = {"configurable": {"thread_id": thread_id}}
    state = await novasec_graph.aget_state(config)
    return state.values.get("ledger", [])
