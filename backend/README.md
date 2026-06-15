# NovaSec — Backend

FastAPI application that runs the 9-agent LangGraph security pipeline, exposes a REST API and WebSocket endpoint, and integrates with LocalStack-mocked AWS services.

> For the full project overview see the [root README](../README.md).

---

## What it does

Every CloudTrail-style event POSTed to `/api/events/ingest` is routed through a deterministic chain of AI agents. Each agent specialises in one concern — triage, memory recall, threat analysis, forensics, remediation planning, and so on — and writes its output to a shared `NovaSecState` object that flows through the graph. The pipeline pauses at `IntentParser` waiting for the operator's approve/deny decision, then resumes to execute the chosen remediation action and write an audit entry to the ledger.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Agent orchestration | LangGraph (`StateGraph`, `MemorySaver`) |
| AI model | Google Gemini 2.5 Flash (`google-generativeai`) |
| Mock AWS | LocalStack via `boto3` |
| Real-time | WebSockets (FastAPI native) |
| Storage | JSON ledger (`data/ledger_store.json`) |
| Config | `pydantic-settings` + `.env` |

---

## Installation

### Prerequisites

- Python 3.11+
- Docker (for LocalStack)
- A Google Gemini API key — get one at [aistudio.google.com](https://aistudio.google.com)

### Steps

```bash
# from repo root
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Environment variables

Create a `.env` file in the **repo root** (not inside `backend/`):

```env
GOOGLE_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
USE_LOCALSTACK=true
AWS_DEFAULT_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

### Start LocalStack

```bash
docker run --rm -d -p 4566:4566 localstack/localstack
```

### Run the server

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The `--reload` flag is important during development — it picks up code changes automatically. Run from `backend/`, not from the repo root, because agent imports use relative paths.

---

## Agent pipeline

```
POST /api/events/ingest
        │
        ▼
  ┌─────────────┐
  │  Sentinel   │  Classifies severity (CRITICAL/HIGH/MEDIUM/LOW) and
  │             │  determines whether the event is a genuine threat.
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │MemoryAgent  │  Loads the user's incident history from the ledger so
  │             │  downstream agents have full context.
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  Analyst    │  Produces the threat analysis and maps to MITRE ATT&CK
  │             │  (technique ID, tactic, description).
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  Forensics  │  Calculates blast radius, detects behavioural patterns,
  │             │  and flags defense evasion attempts.
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  Responder  │  Generates a concrete remediation plan (revoke key,
  │             │  restrict policy, isolate instance, etc.).
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  Commander  │  Writes a plain-English brief and broadcasts it to all
  │             │  connected WebSocket clients.
  └──────┬──────┘
         │  ← graph pauses here (interrupt_before="intent_parser")
         │    waiting for POST /api/events/respond
         │
  ┌──────▼──────┐
  │IntentParser │  Parses the operator's natural language decision
  │             │  ("approve", "deny", "approve but notify team", …).
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  Executor   │  Runs the approved action against LocalStack AWS APIs
  │             │  (S3, IAM, EC2, CloudTrail).
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  PostFix    │  Writes the full audit entry to the JSON ledger and
  │             │  broadcasts the final confirmation brief.
  └─────────────┘
```

### Human-in-the-loop

The graph is compiled with `interrupt_before=["intent_parser"]`. When the graph reaches that node it suspends and saves state via `MemorySaver`. The frontend polls `/api/events/pending` to discover unresolved threads and POSTs to `/api/events/respond` with the operator's decision. The backend resumes the graph from the saved checkpoint.

### Auto-approve

Each thread is registered in `THREAD_STORE` with a `started_at` timestamp. The frontend schedules a 5-minute timer per incident and automatically POSTs `{ voice_transcript: "approve" }` if the operator doesn't act.

---

## API reference

### Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/events/ingest` | Submit a CloudTrail-style event; returns `thread_id`, incident data, Commander brief |
| `POST` | `/api/events/respond` | Send operator decision (`{ voice_transcript, thread_id }`); resumes the paused graph |
| `GET` | `/api/events/pending` | List all unresolved thread IDs |

### Query & analysis

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/query` | Natural language question answered by the Query agent over the ledger |
| `POST` | `/api/whatif` | Blast radius simulation for a given IAM username |

### WebSocket

| Path | Description |
|---|---|
| `ws://host:8001/ws/live` | Subscribe to real-time Commander briefs; messages are plain strings |

### Health

```
GET / → { "status": "NovaSec online" }
```

---

## Project structure

```
backend/
├── main.py                  # FastAPI app, lifespan, CORS, router registration
├── requirements.txt
├── Dockerfile
├── agents/
│   ├── sentinel.py          # Severity classification
│   ├── memory_agent.py      # Ledger history retrieval
│   ├── analyst.py           # Threat analysis + MITRE mapping
│   ├── forensics_agent.py   # Blast radius + pattern detection
│   ├── responder.py         # Remediation plan
│   ├── commander.py         # Human brief + WebSocket broadcast
│   ├── intent_parser.py     # Operator decision parsing
│   ├── executor.py          # AWS action execution
│   ├── post_fix_confirmation.py  # Ledger write + confirmation
│   ├── query_agent.py       # NL query over ledger
│   └── whatif_agent.py      # IAM blast radius simulation
├── api/
│   ├── events.py            # /ingest, /respond, /pending
│   ├── query.py             # /query, /whatif
│   └── websocket.py         # /ws/live
├── core/
│   ├── graph.py             # LangGraph StateGraph + THREAD_STORE
│   ├── state.py             # NovaSecState TypedDict
│   ├── config.py            # Settings (Pydantic), boto3 client factory
│   └── prompts.py           # Shared prompt templates
├── data/
│   └── ledger_store.json    # Append-only audit ledger (gitignored)
└── utils/
    ├── ledger_store.py      # Read/write helpers for the ledger
    ├── localstack_setup.py  # Seeds S3, IAM, EC2, CloudTrail in LocalStack
    ├── mitre_mapper.py      # MITRE ATT&CK technique lookup
    ├── chaos_sim.py         # Programmatic chaos event generator
    └── chaos_test.py        # End-to-end test suite
```

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'agents'`**
Run uvicorn from inside `backend/`, not from the repo root.

**LocalStack connection errors on startup**
Make sure `docker run -p 4566:4566 localstack/localstack` is running before starting uvicorn. The seed failures are non-fatal — the pipeline still works with mock data.

**`FutureWarning: google.generativeai`**
Cosmetic warning from the SDK — does not affect functionality. Will be resolved when the codebase migrates to `google.genai`.
