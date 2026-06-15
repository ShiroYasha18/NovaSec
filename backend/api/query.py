"""Natural language query and what-if analysis endpoints."""

import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from agents.query_agent import answer_query
from agents.whatif_agent import run_whatif

router = APIRouter()


class QueryBody(BaseModel):
    question: str


class WhatIfBody(BaseModel):
    username: str


@router.post("/api/query")
async def query_ledger(body: QueryBody):
    answer = await answer_query(body.question)
    return {
        "answer": answer,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }


@router.post("/api/whatif")
async def whatif(body: WhatIfBody):
    return await run_whatif(body.username)
