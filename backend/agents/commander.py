"""Commander agent — generates voice-ready briefings for the user."""

import json
import time

import google.generativeai as genai

from core.config import settings
from core.prompts import RESPONDER_TO_COMMANDER_PROMPT

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)


async def run_commander(state: dict) -> dict:
    incident = state.get("incident") or {}
    mitre = incident.get("mitre")

    prompt = RESPONDER_TO_COMMANDER_PROMPT.format(
        incident_json=json.dumps(incident, indent=2),
        fix_json=json.dumps(state.get("fix_proposal"), indent=2),
        blast_radius_json=json.dumps(state.get("blast_radius"), indent=2),
        threat_context_json=json.dumps(state.get("threat_context"), indent=2),
        mitre_json=json.dumps(mitre, indent=2) if mitre else "None",
    )
    response = _model.generate_content(prompt)
    brief = response.text.strip()
    state["commander_brief"] = brief

    state["ledger"].append({
        "agent": "commander",
        "timestamp": time.time(),
        "brief_preview": brief[:80],
    })

    return state
