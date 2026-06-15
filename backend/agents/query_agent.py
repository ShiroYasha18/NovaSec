"""Query agent — answers natural language questions about past incidents."""

import json

import google.generativeai as genai

from core.config import settings
from utils.ledger_store import get_recent_sessions

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)

_QUERY_PROMPT = """You are Commander, NovaSec's security intelligence interface.
You have access to this security incident history:
{ledger_json}

Answer this question from a security engineer:
{question}

Rules:
- Answer in 2-4 sentences maximum
- Be specific — use real resource names, usernames, timestamps from the data
- If the data doesn't contain the answer say so directly
- Sound like a calm senior security engineer
- No bullet points, no markdown, plain text only
- If asked about risk, give a concrete assessment not a generic answer"""


async def answer_query(question: str) -> str:
    history = await get_recent_sessions(limit=20)
    prompt = _QUERY_PROMPT.format(
        ledger_json=json.dumps(history, indent=2),
        question=question,
    )
    response = _model.generate_content(prompt)
    return response.text.strip()
