"""Post-fix confirmation agent — generates a voice-ready remediation summary."""

import json
import time

import google.generativeai as genai

from core.config import settings
from core.prompts import POST_FIX_CONFIRMATION_PROMPT

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)


async def confirm_fix(state: dict) -> dict:
    elapsed = round(time.time() - state["started_at"], 1)
    prompt = POST_FIX_CONFIRMATION_PROMPT.format(
        incident_json=json.dumps(state["incident"], indent=2),
        fix_json=json.dumps(state["fix_proposal"], indent=2),
        seconds=elapsed,
    )
    response = _model.generate_content(prompt)
    state["commander_brief"] = response.text.strip()

    state["ledger"].append({
        "agent": "confirm_fix",
        "timestamp": time.time(),
        "resolved": state.get("resolved"),
        "elapsed_seconds": elapsed,
    })

    return state
