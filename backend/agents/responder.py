"""Responder agent — proposes safe automated remediation actions."""

import json
import time

import google.generativeai as genai

from core.config import settings
from core.prompts import ANALYST_TO_RESPONDER_PROMPT

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)


async def run_responder(state: dict) -> dict:
    try:
        prompt = ANALYST_TO_RESPONDER_PROMPT.format(
            incident_json=json.dumps(state["incident"], indent=2)
        )
        response = _model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text)
        state["fix_proposal"] = parsed

        state["ledger"].append({
            "agent": "responder",
            "timestamp": time.time(),
            "fix_available": parsed.get("fix_available"),
            "action": parsed.get("action"),
        })
    except Exception as e:
        state["error"] = str(e)
        state["ledger"].append({
            "agent": "responder",
            "timestamp": time.time(),
            "error": str(e),
        })

    return state
