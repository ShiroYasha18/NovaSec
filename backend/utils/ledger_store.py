"""Persistent ledger storage for cross-session threat memory."""

import json
import os

STORE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ledger_store.json")


def _read() -> list:
    try:
        with open(STORE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write(data: list) -> None:
    os.makedirs(os.path.dirname(STORE_PATH), exist_ok=True)
    with open(STORE_PATH, "w") as f:
        json.dump(data, f, indent=2)


async def append_session(ledger: list[dict]) -> None:
    existing = _read()
    existing.extend(ledger)
    _write(existing)


async def get_history_for_user(username: str) -> list[dict]:
    return [e for e in _read() if e.get("username") == username or e.get("user") == username]


async def get_history_for_resource(resource: str) -> list[dict]:
    return [e for e in _read() if e.get("affected_resource") == resource or e.get("resource") == resource]


async def get_recent_sessions(limit: int = 20) -> list[dict]:
    return _read()[-limit:]
