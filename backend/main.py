"""NovaSec FastAPI application entry point."""

import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.localstack_setup import seed_localstack
from api.events import router as events_router
from api.websocket import router as ws_router
from api.query import router as query_router

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LEDGER_PATH = os.path.join(DATA_DIR, "ledger_store.json")


def _init_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(LEDGER_PATH):
        with open(LEDGER_PATH, "w") as f:
            json.dump([], f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_data_dir()
    await seed_localstack()
    yield


app = FastAPI(title="NovaSec", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events_router)
app.include_router(ws_router)
app.include_router(query_router)


@app.get("/")
async def health():
    return {"status": "NovaSec online"}
