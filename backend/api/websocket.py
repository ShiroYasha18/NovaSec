"""WebSocket endpoint for real-time Commander briefings."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

active_ws: WebSocket | None = None


async def broadcast(message: str):
    if active_ws is not None:
        try:
            await active_ws.send_text(message)
        except Exception:
            pass


@router.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    global active_ws
    await websocket.accept()
    active_ws = websocket
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_ws = None
