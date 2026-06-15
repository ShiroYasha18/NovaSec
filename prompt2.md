Let's go. In order of impact for the hackathon.

---

**PROMPT 10 — Pattern Recognition / Threat Memory Agent**

```
Create /novasec/backend/agents/memory_agent.py

This agent runs BEFORE Analyst. It reads the Ledger 
from previous sessions stored in a JSON file and looks 
for patterns involving the same user or resource.

Storage:
- Persist ledger entries to /novasec/backend/data/ledger_store.json
- Create the file if it doesn't exist (empty list)
- Append every new session's ledger to this file on graph completion

Create /novasec/backend/utils/ledger_store.py:
- async def append_session(ledger: list[dict]) -> None
  Reads ledger_store.json, appends new entries, writes back
- async def get_history_for_user(username: str) -> list[dict]
  Returns all past ledger entries where username matches
- async def get_history_for_resource(resource: str) -> list[dict]
  Returns all past ledger entries where affected_resource matches
- async def get_recent_sessions(limit: int = 20) -> list[dict]
  Returns last N sessions

memory_agent.py — async def run_memory_agent(state: dict) -> dict:

1. Extract username from state["raw_event"]["detail"]["userIdentity"]["userName"]
   Handle KeyError gracefully, default to "unknown"

2. Extract resource from state["raw_event"]["detail"]["requestParameters"]
   Try bucketName, userName, groupId — whichever exists

3. Call get_history_for_user(username) and get_history_for_resource(resource)

4. Build a threat_context dict:
{
  "username": username,
  "resource": resource,
  "user_incident_count": int,        # how many past incidents for this user
  "resource_incident_count": int,    # how many past incidents for this resource
  "past_severities": list[str],      # list of past severity levels
  "last_seen": str | None,           # timestamp of last incident
  "pattern_detected": bool,          # true if user_incident_count > 1
  "pattern_summary": str             # plain English summary of pattern
}

5. If user_incident_count >= 2:
   Set pattern_detected = True
   Set pattern_summary = f"{username} has triggered {user_incident_count} 
   security incidents. Previous severities: {past_severities}. 
   Last seen: {last_seen}. This may indicate compromised credentials 
   or malicious insider activity."

6. If user_incident_count >= 3:
   Upgrade state severity hint to CRITICAL regardless of what Analyst thinks
   Add "ESCALATED BY MEMORY AGENT" to pattern_summary

7. Store threat_context in state["threat_context"]
8. Append to ledger: {agent: "memory", timestamp, pattern_detected, 
   user_incident_count}
9. Return state

Update /novasec/backend/core/state.py:
Add field: threat_context: dict | None

Update /novasec/backend/core/graph.py:
Add "memory" node → run_memory_agent
Change edge: sentinel → memory → analyst
```

---

**PROMPT 11 — Blast Radius Agent**

```
Create /novasec/backend/agents/forensics_agent.py

This agent runs AFTER Analyst classifies a real threat.
It pulls CloudTrail history for the offending user 
and maps everything they touched.

forensics_agent.py — async def run_forensics_agent(state: dict) -> dict:

1. Extract username from state["raw_event"]["detail"]["userIdentity"]["userName"]

2. Use get_boto3_client("cloudtrail") to call:
   client.lookup_events(
     LookupAttributes=[{
       "AttributeKey": "Username",
       "AttributeValue": username
     }],
     MaxResults=50
   )
   
   Wrap in try/except — if LocalStack doesn't return events, 
   generate realistic mock data for demo purposes:
   Mock 5-8 events for the same username touching different resources
   Mix of: ListBuckets, GetObject, DescribeInstances, 
   GetSecretValue, ListAccessKeys

3. Parse the events into a blast_radius dict:
{
  "username": username,
  "events_found": int,
  "timespan_hours": float,           # hours between first and last event
  "resources_touched": list[str],    # unique resources accessed
  "sensitive_actions": list[str],    # GetSecretValue, GetObject etc
  "suspicious_actions": list[str],   # anything outside normal CRUD
  "first_seen": str,                 # timestamp
  "last_seen": str,                  # timestamp
  "blast_radius_level": str,         # LOW / MEDIUM / HIGH / CRITICAL
  "summary": str                     # plain English paragraph
}

4. Determine blast_radius_level:
   - CRITICAL: GetSecretValue or GetPasswordData found
   - HIGH: >10 resources touched or >6 hours of activity
   - MEDIUM: 5-10 resources or sensitive S3 GetObject
   - LOW: fewer than 5 resources, no sensitive actions

5. Build summary as a 2-3 sentence plain English paragraph:
   "In the 4 hours before this incident, dev-temp accessed 
   12 resources including 3 S3 buckets and called 
   GetSecretValue twice. This suggests the credentials 
   may have been compromised before this alert fired. 
   Manual review of secrets rotation is strongly recommended."

6. Store in state["blast_radius"]
7. Append to ledger: {agent: "forensics", events_found, 
   blast_radius_level, resources_touched_count}
8. Return state

Update /novasec/backend/core/state.py:
Add field: blast_radius: dict | None

Update SENTINEL_TO_ANALYST_PROMPT in prompts.py:
Add blast_radius context to the prompt:
"Additional forensics context: {blast_radius_json}
Factor this into your severity assessment."

Update /novasec/backend/core/graph.py:
Add "forensics" node → run_forensics_agent
Change edge: analyst → forensics → responder
```

---

**PROMPT 12 — MITRE ATT&CK Mapping**

```
Create /novasec/backend/utils/mitre_mapper.py

No LLM needed for this — pure lookup table.

MITRE_MAP = {
  "PutBucketAcl": {
    "technique_id": "T1530",
    "technique_name": "Data from Cloud Storage",
    "tactic": "Collection",
    "description": "Adversaries access data in cloud storage. Making a bucket 
    public is a known pre-exfiltration step.",
    "recommendation": "Check S3 server access logs for GetObject calls 
    in the last 24 hours even after reverting ACL."
  },
  "CreateAccessKey": {
    "technique_id": "T1098.001",
    "technique_name": "Account Manipulation: Additional Cloud Credentials",
    "tactic": "Persistence",
    "description": "Adversaries add credentials to maintain persistent 
    access even if the original vector is closed.",
    "recommendation": "Audit all active access keys. Check for new IAM 
    users or role assignments created in the same session."
  },
  "AuthorizeSecurityGroupIngress": {
    "technique_id": "T1562.007",
    "technique_name": "Impair Defenses: Disable or Modify Cloud Firewall",
    "tactic": "Defense Evasion",
    "description": "Adversaries modify cloud firewalls to enable access 
    to compromised resources or exfiltrate data.",
    "recommendation": "Review all inbound rules on this security group. 
    Check for unusual outbound connections from affected EC2 instances."
  },
  "StopLogging": {
    "technique_id": "T1562.001",
    "technique_name": "Impair Defenses: Disable or Modify Tools",
    "tactic": "Defense Evasion",
    "description": "Disabling CloudTrail is a known pre-exfiltration 
    technique. Attackers blind your audit trail before moving data.",
    "recommendation": "Assume activity occurred during the logging gap. 
    Check S3 server access logs and VPC flow logs for the blackout period."
  }
}

def get_mitre_context(event_name: str) -> dict | None:
  Return the matching entry or None if not found.

Update /novasec/backend/agents/analyst.py:
- Import get_mitre_context
- After parsing incident JSON, call get_mitre_context(eventName)
- Add result to state["incident"]["mitre"] = mitre_context
- If mitre tactic is "Defense Evasion": 
  add a warning flag to incident: "defense_evasion_detected": True

Update /novasec/backend/core/state.py:
No new fields needed — mitre lives inside incident dict.

Update RESPONDER_TO_COMMANDER_PROMPT in prompts.py:
Add to prompt:
"MITRE ATT&CK context: {mitre_json}
Reference the attack technique name naturally in your brief.
Example: This matches a known persistence technique where 
attackers create backup credentials."
```

---

**PROMPT 13 — Natural Language Query Interface**

```
Create /novasec/backend/agents/query_agent.py
and /novasec/backend/api/query.py

This lets engineers ask Commander questions in plain English
about past incidents via a separate endpoint.

query_agent.py — async def answer_query(question: str) -> str:

1. Load full ledger history from ledger_store.json
2. Load recent sessions summary (last 20 entries)

3. Build this prompt and call Gemini gemini-2.0-flash:

"You are Commander, NovaSec's security intelligence interface.
You have access to this security incident history:
{ledger_json}

Answer this question from a security engineer:
{question}

Rules:
- Answer in 2-4 sentences maximum
- Be specific — use real resource names, usernames, timestamps from the data
- If the data doesn't contain the answer say so directly
- Sound like a calm senior security engineer
- No bullet points, no markdown, plain text only
- If asked about risk, give a concrete assessment not a generic answer"

4. Return the plain text response

query.py APIRouter:

POST /api/query
  Body: {question: str}
  - Call answer_query(question)
  - Return {answer: str, timestamp: str}

Example questions this must handle:
  "What did dev-temp do last session?"
  "Have we had any CRITICAL incidents?"
  "What's the most common attack type we've seen?"
  "Which resource has been targeted the most?"
  "Should I be worried about dev-temp?"
  "What happened between the last two incidents?"

Update main.py:
Include query router.

Also create /novasec/backend/utils/simulate_query.py:
Standalone script that POSTs a question to /api/query
and prints the answer. Hardcode question:
"Should I be worried about dev-temp based on recent activity?"
```

---

**PROMPT 14 — What-If Simulator**

```
Create /novasec/backend/agents/whatif_agent.py
and add route to /novasec/backend/api/query.py

whatif_agent.py — async def run_whatif(username: str) -> dict:

1. Use get_boto3_client("iam") to call:
   client.list_attached_user_policies(UserName=username)
   client.list_user_policies(UserName=username)
   client.list_groups_for_user(UserName=username)
   
   Wrap all in try/except.
   If LocalStack returns empty, generate realistic mock permissions:
   Mock policy: AllowS3ReadWrite on *, AllowEC2Describe, 
   AllowIAMListUsers, AllowSecretsManagerGetValue

2. Build permissions_summary list from all attached policies

3. Call Gemini with this prompt:
"You are a cloud security analyst performing a blast radius assessment.

IAM User: {username}
Current permissions: {permissions_json}
Known past incidents involving this user: {past_incidents_json}

Answer these questions:
1. If {username}'s credentials were compromised right now, 
   what is the worst thing an attacker could do?
2. Which specific resources are at risk?
3. What is the estimated blast radius: LOW / MEDIUM / HIGH / CRITICAL?
4. What is your top recommendation to reduce this risk?

Respond ONLY in this JSON format:
{
  "worst_case": "string — one sentence worst case scenario",
  "at_risk_resources": ["list", "of", "resource", "types"],
  "blast_radius": "HIGH",
  "top_recommendation": "string — one actionable recommendation",
  "summary": "string — 2-3 sentence plain English summary"
}"

4. Parse and return the JSON response

Add to /novasec/backend/api/query.py:

POST /api/whatif
  Body: {username: str}
  - Call run_whatif(username)
  - Return full whatif result

Add to simulate_query.py:
Also POST to /api/whatif with username: "dev-temp"
Print the result as:
"WHAT-IF ANALYSIS: dev-temp
Blast radius: {blast_radius}
Worst case: {worst_case}
At risk: {at_risk_resources}
Recommendation: {top_recommendation}"
```

---

**PROMPT 15 — Wire everything together + update Commander**

```
Update /novasec/backend/core/graph.py to include 
all new agents in the correct order.

Final node order:
  START 
  → sentinel 
  → memory_agent        (pattern recognition)
  → analyst             (now receives threat_context)
  → forensics_agent     (blast radius)
  → responder 
  → commander           (now has full context)
  → [interrupt]
  → intent_parser
  → APPROVE → executor → confirm_fix → END
  → DENY → END
  → MORE_INFO → commander

Update RESPONDER_TO_COMMANDER_PROMPT in prompts.py
to include ALL context:

"You are Commander, the voice interface of NovaSec.
Speak concisely, calmly, authoritatively.
Maximum 4 sentences. No bullet points. No markdown.
Speaking via text-to-speech.

Incident: {incident_json}
Fix available: {fix_json}
Blast radius: {blast_radius_json}
Threat pattern: {threat_context_json}
MITRE technique: {mitre_json}

Brief the user in this order:
1. What happened and who did it
2. What the blast radius is — what else they touched
3. Whether this matches a known attack pattern
4. What you can fix right now
5. End with a clear yes/no approval question

Example output:
"Critical alert. dev-temp just exposed novasec-demo-bucket 
and in the 4 hours before that accessed 12 other resources 
including two secrets. This matches a known credential 
harvesting pattern — dev-temp has triggered 3 incidents 
this week. I can lock down the bucket now — should I apply the fix?"

Rules:
- Always mention blast radius if HIGH or CRITICAL
- Always mention pattern if pattern_detected is true
- Always reference MITRE technique name naturally if defense evasion
- End with yes/no question
- Under 60 words total"

Update /novasec/backend/main.py startup:
After seed_localstack(), also create 
/novasec/backend/data/ directory if it doesn't exist
and create empty ledger_store.json if it doesn't exist.

Update POST /api/events/respond in events.py:
After graph completes, call 
append_session(state["ledger"]) from ledger_store
so every session is persisted for memory agent.
```

---

**Run order after all prompts:**

```bash
docker compose up
# terminal 2:
python backend/utils/simulate_event.py s3
# watch Commander brief with blast radius + pattern + MITRE
# type "yes" to approve fix
# then run:
python backend/utils/simulate_event.py s3
# second time — memory agent fires, pattern detected, severity escalates
# then run:
python backend/utils/simulate_query.py
# Commander answers natural language questions from ledger history
```

That second run of `simulate_event.py s3` is your **demo moment** — same event fires twice, NovaSec remembers, escalates to CRITICAL automatically, Commander says "this is the second time this week." No boto3 script on earth does that.