"""NovaSec LangGraph state definition."""

from typing import TypedDict


class NovaSecGraphState(TypedDict):
    raw_event: dict
    incident: dict | None
    fix_proposal: dict | None
    commander_brief: str | None
    user_intent: str | None
    fix_result: dict | None
    resolved: bool
    error: str | None
    ledger: list[dict]
    started_at: float
    thread_id: str
    threat_context: dict | None
    blast_radius: dict | None
