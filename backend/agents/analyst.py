"""Analyst agent — classifies AWS events as threats and generates incident reports."""

import json
import time

import google.generativeai as genai

from core.config import settings
from core.prompts import SENTINEL_TO_ANALYST_PROMPT
from utils.mitre_mapper import get_mitre_context

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)


def _extract_event_name(state: dict) -> str:
    detail = state["raw_event"].get("detail", state["raw_event"])
    return detail.get("eventName", "")


async def run_analyst(state: dict) -> dict:
    try:
        blast_radius = state.get("blast_radius")
        blast_json = json.dumps(blast_radius, indent=2) if blast_radius else "No forensics data available."

        prompt = SENTINEL_TO_ANALYST_PROMPT.format(
            event_json=json.dumps(state["raw_event"], indent=2),
            blast_radius_json=blast_json,
        )
        response = _model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text)

        event_name = _extract_event_name(state)
        mitre = get_mitre_context(event_name)
        if mitre:
            parsed["mitre"] = mitre
            if mitre.get("tactic") == "Defense Evasion":
                parsed["defense_evasion_detected"] = True

        # Memory agent may escalate severity
        threat_context = state.get("threat_context", {})
        if threat_context.get("user_incident_count", 0) >= 3 and parsed.get("is_threat"):
            parsed["severity"] = "CRITICAL"

        state["incident"] = parsed

        if not parsed.get("is_threat", False):
            state["resolved"] = True

        state["ledger"].append({
            "agent": "analyst",
            "timestamp": time.time(),
            "is_threat": parsed.get("is_threat"),
            "username": threat_context.get("username"),
            "affected_resource": parsed.get("affected_resource"),
            **({"severity": parsed["severity"]} if parsed.get("is_threat") else {}),
        })
    except Exception as e:
        state["error"] = str(e)
        state["resolved"] = True
        state["ledger"].append({
            "agent": "analyst",
            "timestamp": time.time(),
            "error": str(e),
        })

    return state
