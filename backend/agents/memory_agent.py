"""Memory agent — detects patterns across past sessions for the same user/resource."""

import time

from utils.ledger_store import get_history_for_user, get_history_for_resource


async def run_memory_agent(state: dict) -> dict:
    detail = state["raw_event"].get("detail", state["raw_event"])

    try:
        username = detail["userIdentity"]["userName"]
    except KeyError:
        username = "unknown"

    params = detail.get("requestParameters", {})
    resource = params.get("bucketName") or params.get("userName") or params.get("groupId") or "unknown"

    user_history = await get_history_for_user(username)
    resource_history = await get_history_for_resource(resource)

    past_severities = [e["severity"] for e in user_history if e.get("severity")]
    last_seen = max((e["timestamp"] for e in user_history if e.get("timestamp")), default=None)
    if last_seen:
        import datetime
        last_seen = datetime.datetime.utcfromtimestamp(last_seen).isoformat() + "Z"

    user_incident_count = len([e for e in user_history if e.get("agent") == "analyst" and e.get("is_threat")])
    resource_incident_count = len([e for e in resource_history if e.get("agent") == "analyst" and e.get("is_threat")])

    pattern_detected = user_incident_count >= 2
    pattern_summary = ""

    if user_incident_count >= 2:
        pattern_summary = (
            f"{username} has triggered {user_incident_count} security incidents. "
            f"Previous severities: {past_severities}. "
            f"Last seen: {last_seen}. "
            f"This may indicate compromised credentials or malicious insider activity."
        )

    if user_incident_count >= 3:
        pattern_summary += " ESCALATED BY MEMORY AGENT"

    threat_context = {
        "username": username,
        "resource": resource,
        "user_incident_count": user_incident_count,
        "resource_incident_count": resource_incident_count,
        "past_severities": past_severities,
        "last_seen": last_seen,
        "pattern_detected": pattern_detected,
        "pattern_summary": pattern_summary,
    }

    state["threat_context"] = threat_context

    state["ledger"].append({
        "agent": "memory",
        "timestamp": time.time(),
        "username": username,
        "pattern_detected": pattern_detected,
        "user_incident_count": user_incident_count,
    })

    return state
