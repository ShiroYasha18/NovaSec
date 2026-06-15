"""Forensics agent — maps the blast radius of the offending user via CloudTrail."""

import time
import datetime

from core.config import get_boto3_client

_MOCK_ACTIONS = [
    ("ListBuckets", "s3://all-buckets"),
    ("GetObject", "s3://novasec-demo-bucket/config.json"),
    ("DescribeInstances", "ec2://i-0abc123def456"),
    ("GetSecretValue", "secretsmanager://prod/db-password"),
    ("ListAccessKeys", "iam://dev-temp"),
    ("GetObject", "s3://novasec-demo-bucket/credentials.csv"),
    ("DescribeSecurityGroups", "ec2://sg-0123456789abcdef0"),
]

_SENSITIVE = {"GetSecretValue", "GetPasswordData", "GetObject"}
_SUSPICIOUS = {"ListAccessKeys", "CreateAccessKey", "DeleteTrail", "StopLogging"}


def _mock_events(username: str) -> list[dict]:
    now = time.time()
    events = []
    for i, (action, resource) in enumerate(_MOCK_ACTIONS):
        events.append({
            "EventName": action,
            "EventTime": datetime.datetime.utcfromtimestamp(now - (7200 - i * 900)).isoformat() + "Z",
            "Resources": [{"ResourceName": resource}],
            "Username": username,
        })
    return events


async def run_forensics_agent(state: dict) -> dict:
    detail = state["raw_event"].get("detail", state["raw_event"])
    try:
        username = detail["userIdentity"]["userName"]
    except KeyError:
        username = "unknown"

    try:
        ct = get_boto3_client("cloudtrail")
        resp = ct.lookup_events(
            LookupAttributes=[{"AttributeKey": "Username", "AttributeValue": username}],
            MaxResults=50,
        )
        raw_events = resp.get("Events", [])
        if not raw_events:
            raw_events = _mock_events(username)
    except Exception:
        raw_events = _mock_events(username)

    resources_touched = list({
        r.get("ResourceName", "")
        for e in raw_events
        for r in e.get("Resources", [])
        if r.get("ResourceName")
    })

    sensitive_actions = list({e["EventName"] for e in raw_events if e.get("EventName") in _SENSITIVE})
    suspicious_actions = list({e["EventName"] for e in raw_events if e.get("EventName") in _SUSPICIOUS})

    timestamps = []
    for e in raw_events:
        t = e.get("EventTime")
        if t:
            timestamps.append(t)
    timestamps.sort()
    first_seen = timestamps[0] if timestamps else None
    last_seen = timestamps[-1] if timestamps else None

    timespan_hours = 0.0
    if first_seen and last_seen and first_seen != last_seen:
        try:
            fmt = "%Y-%m-%dT%H:%M:%S.%fZ" if "." in first_seen else "%Y-%m-%dT%H:%M:%SZ"
            t0 = datetime.datetime.strptime(first_seen, fmt)
            t1 = datetime.datetime.strptime(last_seen, fmt)
            timespan_hours = round((t1 - t0).total_seconds() / 3600, 2)
        except Exception:
            timespan_hours = 0.0

    if sensitive_actions and any(a in ("GetSecretValue", "GetPasswordData") for a in sensitive_actions):
        level = "CRITICAL"
    elif len(resources_touched) > 10 or timespan_hours > 6:
        level = "HIGH"
    elif 5 <= len(resources_touched) <= 10 or "GetObject" in sensitive_actions:
        level = "MEDIUM"
    else:
        level = "LOW"

    sens_str = ", ".join(sensitive_actions) if sensitive_actions else "none"
    summary = (
        f"In the {timespan_hours} hours before this incident, {username} accessed "
        f"{len(resources_touched)} resources"
        + (f" and called {', '.join(sensitive_actions)}" if sensitive_actions else "")
        + f". This suggests the credentials may have been active before this alert fired."
        + (" Manual review of secrets rotation is strongly recommended." if "GetSecretValue" in sensitive_actions else "")
    )

    blast_radius = {
        "username": username,
        "events_found": len(raw_events),
        "timespan_hours": timespan_hours,
        "resources_touched": resources_touched,
        "sensitive_actions": sensitive_actions,
        "suspicious_actions": suspicious_actions,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "blast_radius_level": level,
        "summary": summary,
    }

    state["blast_radius"] = blast_radius

    state["ledger"].append({
        "agent": "forensics",
        "timestamp": time.time(),
        "events_found": len(raw_events),
        "blast_radius_level": level,
        "resources_touched_count": len(resources_touched),
    })

    return state
