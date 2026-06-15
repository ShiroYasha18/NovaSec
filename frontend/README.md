# NovaSec — Frontend

Vite + React + TypeScript dashboard for the NovaSec cloud security platform. Real-time incident feed, Commander Chat, IAM Explorer, and a Chaos Monkey that fires random AWS security events every 20 seconds so you can watch the pipeline work.

> For the full project overview see the [root README](../README.md).

---

## What it does

The frontend connects to the backend over REST (`/api/*`) and WebSocket (`/ws/live`). Every security event the backend processes appears in the dashboard within seconds. The Commander Chat panel on the right shows the AI's plain-English analysis and lets you approve or deny the suggested remediation — or just ask it questions in natural language.

---

## Tech stack

| Layer | Technology |
|---|---|
| Bundler | Vite 8 |
| UI | React 19 + TypeScript |
| Animations | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |
| Date formatting | date-fns |
| Styling | CSS-in-JS (inline style objects, no Tailwind) |

Design language: dark mode, Vercel × Linear × Stripe aesthetic. Design tokens are in `src/styles/tokens.ts`.

---

## Installation

### Prerequisites

- Node.js 20+
- Backend running on `http://localhost:8001` (see [backend README](../backend/README.md))

### Steps

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:3000`. Vite proxies `/api/*` → `http://localhost:8001` and `/ws/*` → `ws://localhost:8001` so you never hit CORS.

### Production build

```bash
npm run build      # outputs to frontend/dist/
npm run preview    # serves the built output locally
```

### Docker

```bash
# from repo root
docker compose up --build
```

The frontend Dockerfile does a multi-stage build (Node builder → nginx:alpine). nginx proxies API and WS requests to the backend container.

---

## Views

### Dashboard

The landing page — the first thing you see when you open the app.

**Top row — four stat cards:**
- Critical Threats — count of CRITICAL severity incidents
- Active Incidents — unresolved incidents right now
- Threat Actors — unique usernames seen across all events
- MITRE Mapped — incidents with a confirmed ATT&CK technique

**Charts row:**
- *Incidents over Time* — area chart of the last 10 minutes, X axis = time (oldest left → now right), Y axis = incident count. Spike builds on the right as new events arrive.
- *Severity Distribution* — donut chart breaking down CRITICAL / HIGH / MEDIUM / LOW proportions with a live legend.

**Events by AWS Service** — horizontal bar chart showing which services (S3, IAM, EC2, CloudTrail) are generating the most events.

**Live Event Feed** — scrollable list of the 8 most recent incidents with severity dot, event name, username → resource, MITRE technique badge, and relative timestamp.

**Chaos Monkey** toggle (top-right) fires a random AWS security event every 20 seconds. It is **on by default** so incidents appear immediately when you open the app. Manual `+S3`, `+IAM`, `+CLOUDTRAIL`, `+EC2` buttons let you fire specific scenarios on demand.

---

### Incidents

Full incident log — every event the pipeline has ever processed.

Each row shows:
- Severity badge (color-coded CRITICAL → LOW)
- Event name (e.g. `StopLogging`, `CreateAccessKey`)
- Username and affected resource
- MITRE ATT&CK technique ID and tactic
- `PATTERN` badge if the user has repeated suspicious behaviour
- `DEFENSE EVASION` badge if evasion was detected
- `RESOLVED` badge once approved/denied
- Relative timestamp (e.g. "3 minutes ago")

Resolved incidents are visually dimmed. The list updates in real time as chaos monkey fires.

---

### Threat Intel

Pattern and behavioural analysis across all incidents.

- **Repeat Offenders** — users who have triggered multiple incidents, ranked by count
- **Tactic Breakdown** — which MITRE tactics (Initial Access, Execution, Exfiltration, etc.) are appearing most
- **Defense Evasion Detections** — highlights any incidents where the attacker tried to hide their tracks (e.g. disabling CloudTrail)

Useful for spotting whether a single bad actor is driving the noise vs. multiple independent events.

---

### IAM Explorer

User roster for all 13 simulated IAM identities.

**Roster list** — sorted by incident count (most active actors at the top). Each row shows:
- Avatar colored by risk level
- Username and dynamically derived role (e.g. "Log Tamperer", "Privilege Escalator", "Repeat Offender") — computed from the user's actual incident history, not hardcoded
- Incident count
- Risk badge (CRITICAL / HIGH / MEDIUM / LOW) derived from their worst severity

**Click any row** → inline accordion expands below it with a full Gemini-powered blast radius simulation:
- Risk gauge (score mapped from blast radius level)
- Worst-case scenario if credentials were compromised right now
- Top remediation recommendation
- 2–3 sentence analysis summary
- At-risk resource tags (e.g. S3, IAM, EC2)

Results are cached per session — clicking the same user twice is instant, no extra API call.

---

## Commander Chat

The right-hand panel. Always visible regardless of which view is active.

- Shows the AI's Commander brief for the currently selected incident
- Typewriter animation (14 ms per character)
- Incident queue bar at the top — horizontal scrollable chips for every unresolved incident. Click a chip to switch focus
- Countdown badge shows time remaining before auto-approve kicks in (turns red under 60 s)
- Quick-action buttons (`approve`, `deny`, `tell me more`) when an incident is selected; general NL questions otherwise
- Free-text input routes to `sendResponse` (incident decisions) or `askCommander` (general queries) depending on context

---

## Key files

```
src/
├── App.tsx                   # Root layout, sidebar nav, chaos monkey lifecycle
├── styles/
│   └── tokens.ts             # Colors, fonts, spacing — single source of truth
├── hooks/
│   └── useNovaSec.ts         # All API calls, WebSocket, incident state, timers
├── utils/
│   └── chaosMonkey.ts        # Random event generator (13 users, 11 event types)
├── components/
│   └── CommanderChat.tsx     # Incident queue + chat panel
└── views/
    ├── Dashboard.tsx          # Stats, charts, live feed
    ├── Incidents.tsx          # Full incident table
    ├── ThreatIntel.tsx        # Pattern & tactic analysis
    └── IAMExplorer.tsx        # IAM user roster + blast radius simulation
```

---

## State management

All state lives in `useNovaSec`. No external state library.

| State | Description |
|---|---|
| `incidents` | All incidents (optimistic + resolved) capped at 100 |
| `pendingIncidents` | Filtered view — unresolved only |
| `selectedIncidentId` | Currently focused incident in Commander Chat |
| `processingIds` | Set of incident IDs currently being processed |
| `autoApproveSecondsLeft` | Countdown for the selected incident's auto-approve timer |
| `commanderBrief` | Latest Commander brief text (also pushed via WebSocket) |
| `connectionStatus` | `"connected"` / `"disconnected"` / `"reconnecting"` |

### Fire-and-forget event flow

1. `fireEvent(payload)` creates an optimistic incident immediately (visible in UI)
2. `POST /api/events/ingest` runs in the background
3. When it resolves, the optimistic entry is replaced with real data
4. A per-incident `setTimeout` schedules auto-approve in 2 minutes
5. If the user acts first, the timer is cancelled

---

## Vite proxy config

`vite.config.ts` proxies both HTTP and WebSocket to avoid CORS:

```ts
proxy: {
  '/api': { target: 'http://localhost:8001', changeOrigin: true },
  '/ws':  { target: 'ws://localhost:8001',  changeOrigin: true, ws: true },
}
```

In Docker the nginx config (`nginx.conf`) handles the same proxying for the production build.

---

## Troubleshooting

**No incidents appearing**
Check that the backend is running (`curl http://localhost:8001/`) and that the WebSocket connects (green dot in the sidebar footer).

**`ECONNREFUSED` in Vite terminal**
Backend is not reachable on port 8001. Start it with `uvicorn main:app --host 0.0.0.0 --port 8001 --reload` from inside `backend/`.

**Chaos Monkey fires but incidents disappear**
A previous Vite HMR update may have left a stale dev server. Kill the process and run `npm run dev` fresh.
