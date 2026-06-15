"""Intent parser agent — classifies user voice response into APPROVE/DENY/MORE_INFO."""

import json
import time

import google.generativeai as genai

from core.config import settings
from core.prompts import INTENT_PARSER_PROMPT

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)


async def parse_user_intent(state: dict) -> dict:
    prompt = INTENT_PARSER_PROMPT.format(voice_transcript=state["user_intent"])
    response = _model.generate_content(prompt)
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    parsed = json.loads(text)
    intent = parsed.get("intent", "MORE_INFO")
    state["user_intent"] = intent

    state["ledger"].append({
        "agent": "intent_parser",
        "timestamp": time.time(),
        "intent": intent,
    })

    return state
