"""NovaSec LangGraph state machine."""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from core.state import NovaSecGraphState
from agents.sentinel import run_sentinel
from agents.memory_agent import run_memory_agent
from agents.analyst import run_analyst
from agents.forensics_agent import run_forensics_agent
from agents.responder import run_responder
from agents.commander import run_commander
from agents.intent_parser import parse_user_intent
from agents.executor import execute_fix
from agents.post_fix_confirmation import confirm_fix

THREAD_STORE: dict = {}


def _sentinel_router(state: dict) -> str:
    return END if state.get("resolved") else "memory"


def _analyst_router(state: dict) -> str:
    return END if state.get("resolved") else "forensics"


def _intent_router(state: dict) -> str:
    intent = state.get("user_intent", "MORE_INFO")
    if intent == "APPROVE":
        return "executor"
    if intent == "DENY":
        return END
    return "commander"


builder = StateGraph(NovaSecGraphState)

builder.add_node("sentinel", run_sentinel)
builder.add_node("memory", run_memory_agent)
builder.add_node("analyst", run_analyst)
builder.add_node("forensics", run_forensics_agent)
builder.add_node("responder", run_responder)
builder.add_node("commander", run_commander)
builder.add_node("intent_parser", parse_user_intent)
builder.add_node("executor", execute_fix)
builder.add_node("confirm_fix", confirm_fix)

builder.add_edge(START, "sentinel")
builder.add_conditional_edges("sentinel", _sentinel_router, {"memory": "memory", END: END})
builder.add_edge("memory", "analyst")
builder.add_conditional_edges("analyst", _analyst_router, {"forensics": "forensics", END: END})
builder.add_edge("forensics", "responder")
builder.add_edge("responder", "commander")
builder.add_edge("commander", "intent_parser")
builder.add_conditional_edges(
    "intent_parser",
    _intent_router,
    {"executor": "executor", END: END, "commander": "commander"},
)
builder.add_edge("executor", "confirm_fix")
builder.add_edge("confirm_fix", END)

novasec_graph = builder.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["intent_parser"],
)
