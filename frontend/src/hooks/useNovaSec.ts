import { useState, useEffect, useRef, useCallback } from "react";

export interface MitreInfo {
  technique_id: string;
  technique_name: string;
  tactic: string;
  description?: string;
}

export interface BlastRadius {
  blast_radius_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  resources_touched: string[];
  sensitive_actions: string[];
  summary: string;
  events_found: number;
  timespan_hours: number;
}

export interface ThreatContext {
  username: string;
  pattern_detected: boolean;
  user_incident_count: number;
  past_severities: string[];
  pattern_summary: string;
}

export interface Incident {
  id: string;
  timestamp: string;
  username: string;
  resource: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  eventName: string;
  service: string;
  mitre?: MitreInfo;
  blast_radius?: BlastRadius;
  threat_context?: ThreatContext;
  pattern_detected: boolean;
  defense_evasion_detected: boolean;
  commander_brief: string;
  resolved: boolean;
  fix_result?: { success: boolean; error?: string };
}

export interface LedgerEntry {
  agent: string;
  timestamp: number;
  [key: string]: unknown;
}

type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// In production VITE_BACKEND_URL is the Render backend URL (e.g. https://novasec-backend.onrender.com)
// In dev the Vite proxy forwards /api and /ws to localhost:8001
const _backend = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "");
const API_BASE  = _backend ? `${_backend}/api` : "/api";
const WS_URL    = _backend
  ? `${_backend.replace(/^https/, "wss").replace(/^http/, "ws")}/ws/live`
  : "ws://localhost:8001/ws/live";
const AUTO_APPROVE_MS = 2 * 60 * 1000;

const USERS = [
  "dev-temp", "admin-user", "ops-user", "unknown-user",
  "malicious-mike", "contractor-01", "svc-account-prod",
  "intern-john", "root-backdoor", "ci-bot-staging",
  "pentest-external", "alice-devops", "bob-infra",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randId(): string { return Math.random().toString(36).slice(2, 7); }

const SCENARIO_BUILDERS: Record<string, () => object> = {
  s3: () => ({
    source: "aws.s3", "detail-type": "AWS API Call via CloudTrail",
    detail: { eventSource: "aws.s3", eventName: "PutBucketAcl",
      requestParameters: { bucketName: `bucket-${randId()}`, AccessControlPolicy: { CannedACL: "public-read" } },
      userIdentity: { userName: pick(USERS) }, eventTime: new Date().toISOString() },
  }),
  iam: () => ({
    source: "aws.iam", "detail-type": "AWS API Call via CloudTrail",
    detail: { eventSource: "aws.iam", eventName: "CreateAccessKey",
      requestParameters: { userName: pick(USERS) },
      userIdentity: { userName: pick(USERS) }, eventTime: new Date().toISOString() },
  }),
  cloudtrail: () => ({
    source: "aws.cloudtrail", "detail-type": "AWS API Call via CloudTrail",
    detail: { eventSource: "aws.cloudtrail", eventName: "StopLogging",
      requestParameters: { name: "main-trail" },
      userIdentity: { userName: pick(USERS) }, eventTime: new Date().toISOString() },
  }),
  ec2: () => ({
    source: "aws.ec2", "detail-type": "AWS API Call via CloudTrail",
    detail: { eventSource: "aws.ec2", eventName: "AuthorizeSecurityGroupIngress",
      requestParameters: { groupId: `sg-${randId()}`, IpPermissions: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }] },
      userIdentity: { userName: pick(USERS) }, eventTime: new Date().toISOString() },
  }),
};

export function useNovaSec() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [commanderBrief, setCommanderBrief] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [autoApproveSecondsLeft, setAutoApproveSecondsLeft] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  // per-incident auto-approve timers
  const autoApproveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownDeadline = useRef<{ id: string; deadline: number } | null>(null);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnectionStatus("reconnecting");
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => { setConnectionStatus("connected"); reconnectDelay.current = 1000; };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (typeof msg === "string") { setCommanderBrief(msg); return; }
          if (msg.commander_brief) setCommanderBrief(msg.commander_brief);
        } catch { setCommanderBrief(e.data); }
      };
      ws.onclose = () => {
        setConnectionStatus("disconnected");
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          connect();
        }, reconnectDelay.current);
      };
      ws.onerror = () => ws.close();
    } catch { setConnectionStatus("disconnected"); }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      autoApproveTimers.current.forEach((t) => clearTimeout(t));
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Countdown ticker (shows remaining time for selected incident) ───────────
  const startCountdown = useCallback((incidentId: string) => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    const deadline = Date.now() + AUTO_APPROVE_MS;
    countdownDeadline.current = { id: incidentId, deadline };
    setAutoApproveSecondsLeft(Math.round(AUTO_APPROVE_MS / 1000));
    countdownInterval.current = setInterval(() => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setAutoApproveSecondsLeft(left > 0 ? left : 0);
    }, 1000);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = null;
    countdownDeadline.current = null;
    setAutoApproveSecondsLeft(null);
  }, []);

  // When selected incident changes, update the countdown display
  useEffect(() => {
    if (!selectedIncidentId) { clearCountdown(); return; }
    // Check if selected incident has a timer
    const hasTimer = autoApproveTimers.current.has(selectedIncidentId);
    if (hasTimer) {
      startCountdown(selectedIncidentId);
    } else {
      clearCountdown();
    }
  }, [selectedIncidentId, startCountdown, clearCountdown]);

  // ── Auto-approve a specific incident ──────────────────────────────────────
  const scheduleAutoApprove = useCallback((incidentId: string) => {
    // Clear any existing timer for this incident
    const existing = autoApproveTimers.current.get(incidentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      autoApproveTimers.current.delete(incidentId);
      try {
        const res = await fetch(`${API_BASE}/events/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_transcript: "approve", thread_id: incidentId }),
        });
        const data = await res.json();
        setIncidents((prev) =>
          prev.map((inc) =>
            inc.id === incidentId
              ? { ...inc, resolved: true, fix_result: data.fix_result }
              : inc
          )
        );
        setSelectedIncidentId((cur) => (cur === incidentId ? null : cur));
        if (data.commander_brief)
          setCommanderBrief(`[AUTO] ${data.commander_brief}`);
        if (data.ledger) setLedger(data.ledger);
      } catch (e) { console.error("auto-approve failed", e); }
    }, AUTO_APPROVE_MS);

    autoApproveTimers.current.set(incidentId, timer);
    // If this incident is currently selected, start the countdown display
    setSelectedIncidentId((cur) => {
      if (!cur || cur === incidentId) startCountdown(incidentId);
      return cur ?? incidentId;
    });
  }, [startCountdown]);

  // ── Fire event (fire-and-forget — doesn't block subsequent fires) ──────────
  const fireEvent = useCallback((scenarioOrPayload: string | object): void => {
    const payload =
      typeof scenarioOrPayload === "string"
        ? SCENARIO_BUILDERS[scenarioOrPayload]?.()
        : scenarioOrPayload;
    if (!payload) return;

    // Generate an optimistic placeholder id — will be replaced with real thread_id
    const optimisticId = `pending-${randId()}`;

    const detail = (payload as any).detail ?? {};
    const optimistic: Incident = {
      id: optimisticId,
      timestamp: new Date().toISOString(),
      username: detail?.userIdentity?.userName ?? "unknown",
      resource: "processing…",
      severity: "MEDIUM",
      eventName: detail?.eventName ?? "UnknownEvent",
      service: detail?.eventSource ?? "aws",
      pattern_detected: false,
      defense_evasion_detected: false,
      commander_brief: "",
      resolved: false,
    };

    setIncidents((prev) => [optimistic, ...prev].slice(0, 100));
    setProcessingIds((prev) => new Set(prev).add(optimisticId));
    // Auto-select first incident if nothing selected
    setSelectedIncidentId((cur) => cur ?? optimisticId);

    fetch(`${API_BASE}/events/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.thread_id) return;
        const realId = data.thread_id;

        const real: Incident = {
          id: realId,
          timestamp: optimistic.timestamp,
          username: detail?.userIdentity?.userName ?? "unknown",
          resource: data.incident?.affected_resource ?? "unknown",
          severity: data.incident?.severity ?? "LOW",
          eventName: detail?.eventName ?? "UnknownEvent",
          service: detail?.eventSource ?? "aws",
          mitre: data.incident?.mitre,
          blast_radius: data.blast_radius,
          threat_context: data.threat_context,
          pattern_detected: data.threat_context?.pattern_detected ?? false,
          defense_evasion_detected: data.incident?.defense_evasion_detected ?? false,
          commander_brief: data.commander_brief ?? "",
          resolved: data.resolved ?? false,
        };

        setIncidents((prev) =>
          prev.map((inc) => (inc.id === optimisticId ? real : inc))
        );
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(optimisticId);
          return next;
        });
        setSelectedIncidentId((cur) =>
          cur === optimisticId ? realId : cur
        );

        if (!real.resolved) scheduleAutoApprove(realId);
        if (data.commander_brief) setCommanderBrief(data.commander_brief);
      })
      .catch((err) => {
        console.error("fireEvent error", err);
        setIncidents((prev) => prev.filter((inc) => inc.id !== optimisticId));
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(optimisticId);
          return next;
        });
      });
  }, [scheduleAutoApprove]);

  // ── Send response for a specific incident ─────────────────────────────────
  const sendResponse = useCallback(async (transcript: string, threadId: string) => {
    // Cancel auto-approve for this incident
    const timer = autoApproveTimers.current.get(threadId);
    if (timer) { clearTimeout(timer); autoApproveTimers.current.delete(threadId); }
    if (countdownDeadline.current?.id === threadId) clearCountdown();

    setProcessingIds((prev) => new Set(prev).add(threadId));
    try {
      const res = await fetch(`${API_BASE}/events/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_transcript: transcript, thread_id: threadId }),
      });
      const data = await res.json();

      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === threadId
            ? { ...inc, resolved: data.resolved, fix_result: data.fix_result }
            : inc
        )
      );
      if (data.commander_brief) setCommanderBrief(data.commander_brief);
      if (data.ledger) setLedger(data.ledger);

      if (data.resolved) {
        // Move selection to next pending incident
        setSelectedIncidentId((cur) => {
          if (cur !== threadId) return cur;
          setIncidents((latest) => {
            const next = latest.find((i) => !i.resolved && i.id !== threadId);
            if (next) startCountdown(next.id);
            setTimeout(() => setSelectedIncidentId(next?.id ?? null), 0);
            return latest;
          });
          return null;
        });
      }
    } catch (err) {
      console.error("sendResponse error", err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    }
  }, [clearCountdown, startCountdown]);

  // ── Commander NL query ─────────────────────────────────────────────────────
  const askCommander = useCallback(async (question: string): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      return data.answer ?? "No answer available.";
    } catch { return "Could not reach Commander."; }
  }, []);

  const runWhatIf = useCallback(async (username: string) => {
    const res = await fetch(`${API_BASE}/whatif`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    return res.json();
  }, []);

  const pendingIncidents = incidents.filter((i) => !i.resolved);
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) ?? null;
  const isProcessingSelected = selectedIncidentId ? processingIds.has(selectedIncidentId) : false;

  return {
    incidents,
    pendingIncidents,
    selectedIncident,
    selectedIncidentId,
    setSelectedIncidentId,
    processingIds,
    isProcessingSelected,
    commanderBrief,
    ledger,
    connectionStatus,
    autoApproveSecondsLeft,
    fireEvent,
    sendResponse,
    askCommander,
    runWhatIf,
  };
}
