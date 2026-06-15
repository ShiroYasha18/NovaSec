"""Sentinel agent — filters irrelevant AWS events before analysis."""

import time

ALLOWED_SOURCES = {"aws.s3", "aws.iam", "aws.ec2", "aws.cloudtrail"}
ALLOWED_EVENTS = {"PutBucketAcl", "CreateAccessKey", "AuthorizeSecurityGroupIngress", "StopLogging"}


async def run_sentinel(state: dict) -> dict:
    event = state["raw_event"]
    detail = event.get("detail", event)
    source = detail.get("eventSource", event.get("source", ""))
    name = detail.get("eventName", "")

    if source not in ALLOWED_SOURCES or name not in ALLOWED_EVENTS:
        state["resolved"] = True
        state["ledger"].append({
            "agent": "sentinel",
            "timestamp": time.time(),
            "action": "filtered",
            "reason": "irrelevant event",
        })
    else:
        state["ledger"].append({
            "agent": "sentinel",
            "timestamp": time.time(),
            "action": "passed",
        })

    return state
