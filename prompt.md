Let's go. I'll give you the prompts in the exact order you run them in Claude Code — each one builds on the last.

---

**PROMPT 1 — Project scaffold**

```
Create the NovaSec project structure at /novasec.

Scaffold exactly this:

/novasec
  docker-compose.yml
  .env.example
  /backend
    main.py
    requirements.txt
    /core
      __init__.py
      config.py
      state.py
      prompts.py
      graph.py
    /agents
      __init__.py
      sentinel.py
      analyst.py
      responder.py
      commander.py
      intent_parser.py
      executor.py
      post_fix_confirmation.py
    /api
      __init__.py
      events.py
      websocket.py
    /utils
      __init__.py
      localstack_setup.py
      simulate_event.py

requirements.txt must include:
  fastapi
  uvicorn
  langgraph
  langchain-core
  boto3
  google-generativeai
  python-dotenv
  websockets
  httpx

Create every file as an empty stub with just a module docstring.
Do not write any logic yet.
Print the full tree when done.
```

---

**PROMPT 2 — Docker + LocalStack**

```
Fill in /novasec/docker-compose.yml and /novasec/.env.example.

docker-compose.yml must run two services:

Service 1: localstack
  image: localstack/localstack:latest
  container_name: novasec-localstack
  ports: 4566:4566
  environment:
    SERVICES: s3,iam,events,cloudtrail,logs
    DEFAULT_REGION: us-east-1
    DEBUG: 1
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock

Service 2: backend
  build: ./backend
  container_name: novasec-backend
  ports: 8000:8000
  env_file: .env
  depends_on: localstack
  volumes:
    - ./backend:/app
  command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Also create /novasec/backend/Dockerfile:
  FROM python:3.11-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY . .
  CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

.env.example:
  GOOGLE_API_KEY=your-gemini-key-here
  USE_LOCALSTACK=true
  AWS_DEFAULT_REGION=us-east-1
  AWS_ACCESS_KEY_ID=test
  AWS_SECRET_ACCESS_KEY=test
```

---

**PROMPT 3 — Config + State**

```
Fill in /novasec/backend/core/config.py and /novasec/backend/core/state.py.

config.py:
- Read USE_LOCALSTACK from env (default true)
- Read GOOGLE_API_KEY from env
- Read AWS_DEFAULT_REGION (default us-east-1)
- Export get_boto3_client(service_name: str) that returns a boto3 client
  - If USE_LOCALSTACK=true: endpoint_url=http://localstack:4566,
    region=us-east-1, aws_access_key_id=test, aws_secret_access_key=test
  - If USE_LOCALSTACK=false: standard boto3 client, no endpoint override
- Export settings object with all env vars

state.py:
- TypedDict: NovaSec GraphState with fields:
  raw_event: dict
  incident: dict | None
  fix_proposal: dict | None
  commander_brief: str | None
  user_intent: str | None
  fix_result: dict | None
  resolved: bool
  error: str | None
  ledger: list[dict]
  started_at: float
  thread_id: str
```

---

**PROMPT 4 — LocalStack seed script**

```
Fill in /novasec/backend/utils/localstack_setup.py.

Write an async function seed_localstack() that:

1. Creates S3 bucket: novasec-demo-bucket
   - Use get_boto3_client("s3")
   - Skip if already exists

2. Creates IAM user: dev-temp
   - Use get_boto3_client("iam")
   - Creates an access key for dev-temp
   - Skip if already exists

3. Creates EventBridge rule: novasec-catch-all
   - Use get_boto3_client("events")
   - Event pattern matching sources:
     aws.s3, aws.iam, aws.ec2, aws.cloudtrail
   - State: ENABLED

4. Adds target to the rule:
   - Id: novasec-backend
   - Arn: arn:aws:events:us-east-1:000000000000:event-bus/default
   - HttpParameters with endpoint:
     http://backend:8000/api/events/ingest

5. Creates CloudTrail trail: novasec-trail
   - S3BucketName: novasec-demo-bucket
   - Use get_boto3_client("cloudtrail")
   - Starts logging
   - Skip if already exists

Each step must:
- Be wrapped in try/except
- Print "✓ created X" on success
- Print "→ X already exists, skipping" if exists
- Print "✗ failed X: error" on other errors

Export seed_localstack as the main function.
Also add if __name__ == "__main__": asyncio.run(seed_localstack())
```

---

**PROMPT 5 — All prompts**

```
Fill in /novasec/backend/core/prompts.py.

Define these five strings exactly — no changes to wording:

SENTINEL_TO_ANALYST_PROMPT:
"You are Analyst, a cloud security intelligence agent.
You have received a suspicious AWS event detected by Sentinel.
Event details: {event_json}
Your job:
1. Determine if this is a genuine security threat or benign activity
2. If genuine threat, classify severity: CRITICAL, HIGH, MEDIUM, or LOW
3. Generate a concise incident report
Respond ONLY in this exact JSON format, no preamble:
{
  "is_threat": true,
  "severity": "CRITICAL",
  "title": "S3 Bucket Publicly Exposed",
  "summary": "A production S3 bucket was made publicly accessible by dev-temp at 14:32 UTC.",
  "risk": "All objects in the bucket are now readable by anyone on the internet.",
  "affected_resource": "novasec-demo-bucket",
  "resource_type": "S3 Bucket",
  "recommended_fix": "Revert bucket ACL to private immediately."
}
Rules:
- Be direct and specific, no corporate speak
- Risk must explain real-world impact in one sentence
- recommended_fix must be actionable and specific
- If not a genuine threat, set is_threat to false and omit other fields"

ANALYST_TO_RESPONDER_PROMPT:
"You are Responder, a cloud security remediation agent.
You have received a classified incident from Analyst.
Incident: {incident_json}
Your job:
1. Determine if an automated fix is available
2. Only propose fixes from this whitelist:
   - S3: revert public ACL to private → put_bucket_acl
   - IAM: deactivate access key → update_access_key
   - EC2: revoke security group ingress → revoke_security_group_ingress
   - CloudTrail: re-enable logging → start_logging
Respond ONLY in this exact JSON format:
{
  "fix_available": true,
  "action": "Revert S3 bucket ACL to private",
  "target": "novasec-demo-bucket",
  "description": "Set bucket ACL back to private.",
  "reversible": true,
  "risk_level": "NONE",
  "boto3_service": "s3",
  "boto3_action": "put_bucket_acl",
  "boto3_params": {
    "Bucket": "novasec-demo-bucket",
    "ACL": "private"
  }
}
Rules:
- NEVER propose destructive actions
- If no safe fix exists set fix_available to false
- risk_level must be NONE or LOW only
- boto3_params must be exact and executable"

RESPONDER_TO_COMMANDER_PROMPT:
"You are Commander, the voice interface of NovaSec.
Be concise, calm, authoritative. Maximum 3 sentences. No bullet points. No markdown.
You are speaking out loud via text-to-speech.
Incident: {incident_json}
Fix available: {fix_json}
Brief the user: what happened, what is at risk, what you can do, ask for approval.
Always end with a clear yes/no question.
Never use technical jargon. Sound like a calm senior engineer.
Keep it under 40 words."

INTENT_PARSER_PROMPT:
"You are parsing a voice command from a security engineer.
Their response: {voice_transcript}
Classify as exactly one of: APPROVE, DENY, MORE_INFO
Respond ONLY in this JSON format:
{"intent": "APPROVE", "confidence": 0.97}
APPROVE: yes, do it, fix it, apply, go ahead, yeah
DENY: no, ignore, skip, dont, leave it, cancel
MORE_INFO: explain, tell me more, how bad, wait
If confidence below 0.8 default to MORE_INFO."

POST_FIX_CONFIRMATION_PROMPT:
"You are Commander confirming completed remediation.
Past tense. Maximum 2 sentences. Text-to-speech.
Incident: {incident_json}
Action taken: {fix_json}
Time to resolve: {seconds} seconds
Always state what was fixed, the resource name, and time to resolve.
Sound satisfied but not dramatic."
```

---

**PROMPT 6 — All five agents**

```
Fill in all agent files in /novasec/backend/agents/.
All functions are async. All LLM calls use google-generativeai 
with model gemini-2.0-flash. Import prompts from core.prompts.
Import get_boto3_client from core.config.

sentinel.py — async def run_sentinel(state: dict) -> dict:
- Check state["raw_event"] for eventSource and eventName
- Allowed eventSources: aws.s3, aws.iam, aws.ec2, aws.cloudtrail
- Allowed eventNames: PutBucketAcl, CreateAccessKey,
  AuthorizeSecurityGroupIngress, StopLogging
- If not allowed: set state["resolved"]=True, append to ledger
  {"agent": "sentinel", "action": "filtered", "reason": "irrelevant event"}
- If allowed: append to ledger {"agent": "sentinel", "action": "passed"}
- Return state

analyst.py — async def run_analyst(state: dict) -> dict:
- Format SENTINEL_TO_ANALYST_PROMPT with json.dumps(state["raw_event"])
- Call Gemini, parse JSON response
- Set state["incident"] = parsed result
- If is_threat is false: set state["resolved"]=True
- Append to ledger: {agent, timestamp, is_threat, severity if threat}
- Wrap in try/except, on error set state["error"] and state["resolved"]=True
- Return state

responder.py — async def run_responder(state: dict) -> dict:
- Format ANALYST_TO_RESPONDER_PROMPT with json.dumps(state["incident"])
- Call Gemini, parse JSON response
- Set state["fix_proposal"] = parsed result
- Append to ledger: {agent, timestamp, fix_available, action}
- Wrap in try/except
- Return state

commander.py — async def run_commander(state: dict) -> dict:
- Format RESPONDER_TO_COMMANDER_PROMPT with incident and fix_proposal
- Call Gemini, get plain text response
- Set state["commander_brief"] = response text
- Append to ledger: {agent, timestamp, brief_preview: first 80 chars}
- Return state

intent_parser.py — async def parse_user_intent(state: dict) -> dict:
- Format INTENT_PARSER_PROMPT with state["user_intent"] as voice_transcript
- Call Gemini, parse JSON response
- Set state["user_intent"] = classified intent string (APPROVE/DENY/MORE_INFO)
- Append to ledger: {agent, timestamp, intent}
- Return state

executor.py — async def execute_fix(state: dict) -> dict:
- Read fix_proposal["boto3_service"], ["boto3_action"], ["boto3_params"]
- Get client: get_boto3_client(boto3_service)
- Call getattr(client, boto3_action)(**boto3_params)
- Set state["fix_result"] = {"success": True, "response": str(response)}
- Set state["resolved"] = True
- Append to ledger: {agent, timestamp, action, target, success}
- Wrap in try/except, on error set fix_result["success"]=False and log error
- Return state

post_fix_confirmation.py — async def confirm_fix(state: dict) -> dict:
- Calculate elapsed = time.time() - state["started_at"]
- Format POST_FIX_CONFIRMATION_PROMPT
- Call Gemini, get plain text
- Set state["commander_brief"] = confirmation text
- Append to ledger: {agent, timestamp, resolved, elapsed_seconds}
- Return state
```

---

**PROMPT 7 — Graph**

```
Fill in /novasec/backend/core/graph.py.

Build a LangGraph StateGraph using NovaSec GraphState from core.state.

Import all agent functions from agents/.

Add nodes:
  "sentinel" → run_sentinel
  "analyst" → run_analyst
  "responder" → run_responder
  "commander" → run_commander
  "intent_parser" → parse_user_intent
  "executor" → execute_fix
  "confirm_fix" → confirm_fix

Edges:
  START → sentinel

  sentinel → conditional:
    if state["resolved"] == True → END
    else → analyst

  analyst → conditional:
    if state["resolved"] == True → END
    else → responder

  responder → commander

  commander → intent_parser
  Use interrupt_before=["intent_parser"]

  intent_parser → conditional:
    if state["user_intent"] == "APPROVE" → executor
    if state["user_intent"] == "DENY" → END
    if state["user_intent"] == "MORE_INFO" → commander

  executor → confirm_fix
  confirm_fix → END

Compile with checkpointer=MemorySaver().
Export compiled graph as novasec_graph.
Export a dict THREAD_STORE = {} for storing active thread IDs.
```

---

**PROMPT 8 — API routes**

```
Fill in /novasec/backend/api/events.py and /novasec/backend/api/websocket.py.

websocket.py:
- Module-level variable: active_ws = None
- async def broadcast(message: str): sends message to active_ws if connected
- APIRouter with:
  GET /ws/live — WebSocket endpoint
  Accepts connection, sets active_ws = websocket
  Keeps alive until disconnect
  On disconnect sets active_ws = None

events.py:
- APIRouter
- Import novasec_graph and THREAD_STORE from core.graph
- Import broadcast from api.websocket

POST /api/events/ingest
  Body: dict (raw AWS event JSON)
  - Generate thread_id = str(uuid4())
  - Build initial NovaSec GraphState with:
    raw_event = body
    started_at = time.time()
    thread_id = thread_id
    resolved = False
    ledger = []
    incident = None
    fix_proposal = None
    commander_brief = None
    user_intent = None
    fix_result = None
    error = None
  - Store in THREAD_STORE["active"] = thread_id
  - Run graph: novasec_graph.invoke(state, 
      config={"configurable": {"thread_id": thread_id}})
  - After interrupt: get current state from graph
  - await broadcast(state["commander_brief"])
  - Return {thread_id, commander_brief, incident}

POST /api/events/respond
  Body: {voice_transcript: str}
  - Get thread_id from THREAD_STORE["active"]
  - Update graph state: user_intent = body.voice_transcript
  - Resume: novasec_graph.invoke(None,
      config={"configurable": {"thread_id": thread_id}})
  - Get final state
  - await broadcast(state["commander_brief"])
  - Return {resolved, fix_result, ledger}

GET /api/ledger
  - Get thread_id from THREAD_STORE["active"]
  - Get state from graph checkpointer
  - Return state["ledger"]
```

---

**PROMPT 9 — Main + simulate**

```
Fill in /novasec/backend/main.py and 
/novasec/backend/utils/simulate_event.py.

main.py:
- FastAPI app with lifespan
- On startup: call seed_localstack() from utils.localstack_setup
- Include routers from api.events and api.websocket
- Add CORS middleware allowing all origins (it's a hackathon)
- Health check: GET / returns {"status": "NovaSec online"}

simulate_event.py:
- Standalone script, run with: python simulate_event.py [scenario]
- Three scenarios selectable by command line arg:

scenario "s3" (default):
{
  "source": "aws.s3",
  "detail-type": "AWS API Call via CloudTrail",
  "detail": {
    "eventSource": "aws.s3",
    "eventName": "PutBucketAcl",
    "requestParameters": {
      "bucketName": "novasec-demo-bucket",
      "AccessControlPolicy": {"CannedACL": "public-read"}
    },
    "userIdentity": {"userName": "dev-temp"},
    "eventTime": "2026-06-15T14:32:00Z"
  }
}

scenario "iam":
{
  "source": "aws.iam",
  "detail-type": "AWS API Call via CloudTrail",
  "detail": {
    "eventSource": "aws.iam",
    "eventName": "CreateAccessKey",
    "requestParameters": {"userName": "dev-temp"},
    "userIdentity": {"userName": "admin-user"},
    "eventTime": "2026-06-15T14:33:00Z"
  }
}

scenario "cloudtrail":
{
  "source": "aws.cloudtrail",
  "detail-type": "AWS API Call via CloudTrail",
  "detail": {
    "eventSource": "aws.cloudtrail",
    "eventName": "StopLogging",
    "requestParameters": {"name": "novasec-trail"},
    "userIdentity": {"userName": "unknown-user"},
    "eventTime": "2026-06-15T14:34:00Z"
  }
}

POST the selected scenario to http://localhost:8000/api/events/ingest
Print the response.
Then prompt: "Enter your response (or press enter to approve): "
POST the input to http://localhost:8000/api/events/respond
Print the final response.
```

---

Run them in order, one at a time. After each prompt verify Claude Code created the files before moving to the next. The last thing you run is:

```bash
cp .env.example .env
# add your GOOGLE_API_KEY
docker compose up
python backend/utils/simulate_event.py s3
```

And the full pipeline fires. What's your frontend stack so I can write those prompts next?