"""Executor agent — applies the approved boto3 fix against AWS/LocalStack."""

import time

from core.config import get_boto3_client


async def execute_fix(state: dict) -> dict:
    fix = state.get("fix_proposal") or {}

    if not fix.get("fix_available", False):
        state["fix_result"] = {"success": False, "error": "No automated fix available for this incident type"}
        state["resolved"] = True
        state["ledger"].append({
            "agent": "executor",
            "timestamp": time.time(),
            "action": "none",
            "success": False,
            "note": "fix_available=false — flagged for manual remediation",
        })
        return state

    service = fix.get("boto3_service")
    action  = fix.get("boto3_action")
    params  = fix.get("boto3_params", {})

    try:
        client = get_boto3_client(service)
        response = getattr(client, action)(**params)
        state["fix_result"] = {"success": True, "response": str(response)}
        state["resolved"] = True
        state["ledger"].append({
            "agent": "executor",
            "timestamp": time.time(),
            "action": action,
            "target": fix.get("target"),
            "success": True,
        })
    except Exception as e:
        state["fix_result"] = {"success": False, "error": str(e)}
        state["resolved"] = True
        state["ledger"].append({
            "agent": "executor",
            "timestamp": time.time(),
            "action": action,
            "target": fix.get("target"),
            "success": False,
            "error": str(e),
        })

    return state
