"""What-if agent — blast radius assessment for a given IAM user."""

import json

import google.generativeai as genai

from core.config import settings, get_boto3_client
from utils.ledger_store import get_history_for_user

genai.configure(api_key=settings.GOOGLE_API_KEY)
_model = genai.GenerativeModel(settings.GEMINI_MODEL)

_MOCK_PERMISSIONS = [
    "AllowS3ReadWrite on *",
    "AllowEC2Describe",
    "AllowIAMListUsers",
    "AllowSecretsManagerGetValue",
]

_WHATIF_PROMPT = """You are a cloud security analyst performing a blast radius assessment.

IAM User: {username}
Current permissions: {permissions_json}
Known past incidents involving this user: {past_incidents_json}

Answer these questions:
1. If {username}'s credentials were compromised right now, what is the worst thing an attacker could do?
2. Which specific resources are at risk?
3. What is the estimated blast radius: LOW / MEDIUM / HIGH / CRITICAL?
4. What is your top recommendation to reduce this risk?

Respond ONLY in this exact JSON format:
{{
  "worst_case": "string — one sentence worst case scenario",
  "at_risk_resources": ["list", "of", "resource", "types"],
  "blast_radius": "HIGH",
  "top_recommendation": "string — one actionable recommendation",
  "summary": "string — 2-3 sentence plain English summary"
}}"""


async def run_whatif(username: str) -> dict:
    iam = get_boto3_client("iam")
    permissions = []

    try:
        attached = iam.list_attached_user_policies(UserName=username)
        permissions += [p["PolicyName"] for p in attached.get("AttachedPolicies", [])]
    except Exception:
        pass

    try:
        inline = iam.list_user_policies(UserName=username)
        permissions += inline.get("PolicyNames", [])
    except Exception:
        pass

    try:
        groups = iam.list_groups_for_user(UserName=username)
        permissions += [f"Group:{g['GroupName']}" for g in groups.get("Groups", [])]
    except Exception:
        pass

    if not permissions:
        permissions = _MOCK_PERMISSIONS

    past = await get_history_for_user(username)
    past_incidents = [e for e in past if e.get("agent") == "analyst" and e.get("is_threat")]

    prompt = _WHATIF_PROMPT.format(
        username=username,
        permissions_json=json.dumps(permissions, indent=2),
        past_incidents_json=json.dumps(past_incidents, indent=2),
    )

    response = _model.generate_content(prompt)
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    return json.loads(text)
