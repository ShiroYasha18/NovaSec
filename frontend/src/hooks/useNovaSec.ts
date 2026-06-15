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
  fix_proposal?: { fix_available: boolean; action?: string; target?: string };
}

export interface LedgerEntry {
  agent: string;
  timestamp: number;
  [key: string]: unknown;
}

type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

const WS_URL = "ws://localhost:8001/ws/live";
const API_BASE = "/api";

const SCENARIOS: Record<string, object> = {
  s3: {
    source: "aws.s3",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.s3",
      eventName: "PutBucketAcl",
      requestParameters: { bucketName: "novasec-demo-bucket", AccessControlPolicy: { CannedACL: "public-read" } },
      userIdentity: { userName: "dev-temp" },
      eventTime: new Date().toISOString(),
    },
  },
  iam: {
    source: "aws.iam",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.iam",
      eventName: "CreateAccessKey",
      requestParameters: { userName: "dev-temp" },
      userIdentity: { userName: "admin-user" },
      eventTime: new Date().toISOString(),
    },
  },
  cloudtrail: {
    source: "aws.cloudtrail",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.cloudtrail",
      eventName: "StopLogging",
      requestParameters: { name: "novasec-trail" },
      userIdentity: { userName: "unknown-user" },
      eventTime: new Date().toISOString(),
    },
  },
  ec2: {
    source: "aws.ec2",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.ec2",
      eventName: "AuthorizeSecurityGroupIngress",
      requestParameters: { groupId: "sg-prod-01", IpPermissions: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }] },
      userIdentity: { userName: "ops-user" },
      eventTime: new Date().toISOString(),
    },
  },
};

export function useNovaSec() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [commanderBrief, setCommanderBrief] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnectionStatus("reconnecting");

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        reconnectDelay.current = 1000;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (typeof msg === "string") {
            setCommanderBrief(msg);
            return;
          }
          if (msg.commander_brief) setCommanderBrief(msg.commander_brief);
        } catch {
          setCommanderBrief(e.data);
        }
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => ws.close();
    } catch {
      setConnectionStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const fireEvent = useCallback(async (scenario: string): Promise<Incident | null> => {
    const payload = SCENARIOS[scenario];
    if (!payload) return null;

    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/events/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.incident) { setIsProcessing(false); return null; }

      const inc: Incident = {
        id: data.thread_id,
        timestamp: new Date().toISOString(),
        username: data.incident?.summary?.match(/by (\S+)/)?.[1] ??
          (payload as any).detail?.userIdentity?.userName ?? "unknown",
        resource: data.incident?.affected_resource ?? "unknown",
        severity: data.incident?.severity ?? "LOW",
        eventName: (payload as any).detail?.eventName ?? scenario,
        service: (payload as any).detail?.eventSource ?? "aws",
        mitre: data.incident?.mitre,
        blast_radius: data.blast_radius,
        threat_context: data.threat_context,
        pattern_detected: data.threat_context?.pattern_detected ?? false,
        defense_evasion_detected: data.incident?.defense_evasion_detected ?? false,
        commander_brief: data.commander_brief ?? "",
        resolved: data.resolved ?? false,
        fix_proposal: undefined,
      };

      setIncidents((prev) => [inc, ...prev].slice(0, 50));
      setActiveIncident(inc);
      setCommanderBrief(data.commander_brief ?? null);
      return inc;
    } catch (err) {
      console.error("fireEvent error", err);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const sendResponse = useCallback(async (transcript: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/events/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_transcript: transcript }),
      });
      const data = await res.json();
      setActiveIncident((prev) =>
        prev ? { ...prev, resolved: data.resolved, fix_result: data.fix_result } : null
      );
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === activeIncident?.id
            ? { ...inc, resolved: data.resolved, fix_result: data.fix_result }
            : inc
        )
      );
      if (data.commander_brief) setCommanderBrief(data.commander_brief);
      if (data.ledger) setLedger(data.ledger);
      if (data.resolved) setActiveIncident(null);
    } catch (err) {
      console.error("sendResponse error", err);
    } finally {
      setIsProcessing(false);
    }
  }, [activeIncident]);

  const askCommander = useCallback(async (question: string): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      return data.answer ?? "No answer available.";
    } catch {
      return "Could not reach Commander.";
    }
  }, []);

  const runWhatIf = useCallback(async (username: string) => {
    const res = await fetch(`${API_BASE}/whatif`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    return res.json();
  }, []);

  return {
    incidents, activeIncident, isProcessing,
    commanderBrief, ledger, connectionStatus,
    fireEvent, sendResponse, askCommander, runWhatIf,
  };
}
