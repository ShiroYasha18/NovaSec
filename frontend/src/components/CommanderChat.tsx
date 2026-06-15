import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Send, Zap, Loader } from "lucide-react";
import { colors, fonts } from "../styles/tokens";
import type { Incident } from "../hooks/useNovaSec";

interface Message {
  id: string;
  role: "commander" | "user";
  content: string;
  timestamp: Date;
  incidentId?: string;
}

interface Props {
  commanderBrief: string | null;
  isProcessingSelected: boolean;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  onSendResponse: (text: string, threadId: string) => void;
  onAskCommander: (question: string) => Promise<string>;
  pendingIncidents: Incident[];
  selectedIncident: Incident | null;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  autoApproveSecondsLeft: number | null;
  processingIds: Set<string>;
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: colors.accent.red,
  HIGH: colors.accent.orange,
  MEDIUM: colors.accent.yellow,
  LOW: colors.accent.teal,
};

const s: Record<string, any> = {
  panel: {
    width: 340, minWidth: 340, height: "100vh",
    background: colors.bg.surface,
    borderLeft: `1px solid ${colors.bg.border}`,
    display: "flex", flexDirection: "column",
    position: "relative", overflow: "hidden",
  },
  header: {
    padding: "16px 16px 12px",
    borderBottom: `1px solid ${colors.bg.border}`,
    display: "flex", alignItems: "center", gap: 10,
    background: colors.bg.elevated,
  },
  shieldWrap: {
    width: 30, height: 30, borderRadius: 8,
    background: colors.accent.blueGlow,
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "shield-pulse 3s ease-in-out infinite",
  },
  title: { fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: colors.text.primary },
  subtitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary, marginTop: 1 },
  statusDot: (status: string) => ({
    width: 6, height: 6, borderRadius: "50%", marginLeft: "auto",
    background: status === "connected" ? colors.accent.teal : status === "reconnecting" ? colors.accent.yellow : colors.text.tertiary,
    animation: status === "connected" ? "pulse-dot 2s ease-in-out infinite" : "none",
  }),
  // ── Incident queue ──────────────────────────────────────────────────────────
  queueBar: {
    borderBottom: `1px solid ${colors.bg.border}`,
    background: colors.bg.elevated,
    padding: "8px 12px",
  },
  queueLabel: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary,
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  queueScroll: {
    display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2,
  },
  queueChip: (inc: Incident, selected: boolean, processing: boolean) => ({
    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
    padding: "4px 8px", borderRadius: 6, cursor: "pointer",
    background: selected ? SEV_COLORS[inc.severity] + "20" : colors.bg.overlay,
    border: `1px solid ${selected ? SEV_COLORS[inc.severity] + "60" : colors.bg.border}`,
    transition: "all 0.15s",
    opacity: processing ? 0.7 : 1,
  }),
  chipDot: (severity: string) => ({
    width: 6, height: 6, borderRadius: "50%",
    background: SEV_COLORS[severity] ?? colors.text.tertiary,
    boxShadow: `0 0 4px ${SEV_COLORS[severity] ?? colors.text.tertiary}`,
    flexShrink: 0,
  }),
  chipText: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.primary, whiteSpace: "nowrap",
  },
  chipSev: (severity: string) => ({
    fontFamily: fonts.mono, fontSize: 8, fontWeight: 600,
    color: SEV_COLORS[severity] ?? colors.text.tertiary,
  }),
  // ── Messages ────────────────────────────────────────────────────────────────
  messages: {
    flex: 1, overflowY: "auto", padding: "12px 14px 8px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  msgBubble: (role: string) => ({
    maxWidth: "88%",
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: role === "user" ? colors.accent.blueGlow : colors.bg.elevated,
    border: `1px solid ${role === "user" ? colors.accent.blue + "40" : colors.bg.border}`,
    borderRadius: role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
    padding: "8px 11px",
  }),
  msgLabel: (role: string) => ({
    fontFamily: fonts.mono, fontSize: 9, fontWeight: 500,
    color: role === "commander" ? colors.accent.blue : colors.text.tertiary,
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
  }),
  msgText: {
    fontFamily: fonts.sans, fontSize: 11, lineHeight: 1.6,
    color: colors.text.primary, whiteSpace: "pre-wrap",
  },
  msgTime: { fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary, marginTop: 4 },
  // ── Input area ──────────────────────────────────────────────────────────────
  inputArea: {
    padding: "10px 14px", borderTop: `1px solid ${colors.bg.border}`,
    background: colors.bg.elevated, display: "flex", flexDirection: "column", gap: 8,
  },
  countdownBadge: (urgent: boolean) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "4px 8px", borderRadius: 6,
    background: urgent ? colors.accent.red + "20" : colors.accent.blueGlow,
    border: `1px solid ${urgent ? colors.accent.red + "50" : colors.accent.blue + "40"}`,
    fontFamily: fonts.mono, fontSize: 10,
    color: urgent ? colors.accent.red : colors.accent.blue,
  }),
  quickActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  quickBtn: {
    padding: "3px 8px", borderRadius: 4,
    border: `1px solid ${colors.bg.borderHover}`,
    background: "transparent", fontFamily: fonts.mono, fontSize: 10,
    color: colors.text.secondary, cursor: "pointer", transition: "all 0.15s",
  },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: {
    flex: 1, background: colors.bg.overlay, border: `1px solid ${colors.bg.border}`,
    borderRadius: 8, padding: "8px 11px", fontFamily: fonts.sans, fontSize: 12,
    color: colors.text.primary, resize: "none", outline: "none",
    minHeight: 36, maxHeight: 80, lineHeight: 1.5, transition: "border-color 0.15s",
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 8, border: "none",
    background: colors.accent.blue, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, transition: "background 0.15s",
  },
};

const QUICK_ACTIONS = ["approve", "deny", "tell me more"];
const QUICK_QUESTIONS = ["What happened?", "Who is the attacker?", "Show recent threats"];

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtSvc = (s: string) => s.replace("aws.", "").toUpperCase().slice(0, 8);

export function CommanderChat({
  commanderBrief, isProcessingSelected, connectionStatus,
  onSendResponse, onAskCommander,
  pendingIncidents, selectedIncident, selectedIncidentId, onSelectIncident,
  autoApproveSecondsLeft, processingIds,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([{
    id: "init", role: "commander",
    content: "NovaSec Commander online. Awaiting events — I'll brief you on every threat detected.",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [typingContent, setTypingContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevBriefRef = useRef<string | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const typeWriter = (text: string) => {
    // Cancel any in-progress typewriter before starting the new one
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    setIsTyping(true);
    setTypingContent("");
    let i = 0;
    typeIntervalRef.current = setInterval(() => {
      i++;
      setTypingContent(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typeIntervalRef.current!);
        typeIntervalRef.current = null;
        setIsTyping(false);
        setTypingContent("");
        setMessages((prev) => {
          const next = [...prev, {
            id: Math.random().toString(36).slice(2),
            role: "commander" as const, content: text,
            timestamp: new Date(),
          }];
          // keep the chat from growing unbounded
          return next.slice(-60);
        });
      }
    }, 14);
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, []);

  // Show new commander briefs as they arrive from the pipeline
  useEffect(() => {
    if (commanderBrief && commanderBrief !== prevBriefRef.current) {
      prevBriefRef.current = commanderBrief;
      typeWriter(commanderBrief);
    }
  }, [commanderBrief]);

  // When the operator switches to a different incident, show that incident's brief
  useEffect(() => {
    if (selectedIncident?.id !== prevSelectedRef.current && selectedIncident?.commander_brief) {
      prevSelectedRef.current = selectedIncident.id;
      if (selectedIncident.commander_brief !== prevBriefRef.current) {
        prevBriefRef.current = selectedIncident.commander_brief;
        typeWriter(selectedIncident.commander_brief);
      }
    }
  }, [selectedIncident?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingContent]);

  const addUserMsg = (text: string) => {
    setMessages((prev) => [...prev, {
      id: Math.random().toString(36).slice(2),
      role: "user", content: text, timestamp: new Date(),
    }]);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessingSelected) return;
    const text = input.trim();
    setInput("");
    addUserMsg(text);

    const lower = text.toLowerCase();
    const isDecision = lower === "approve" || lower === "deny" || lower.includes("more");
    if (selectedIncidentId && isDecision) {
      onSendResponse(text, selectedIncidentId);
    } else {
      const answer = await onAskCommander(text);
      typeWriter(answer);
    }
  };

  const urgent = autoApproveSecondsLeft !== null && autoApproveSecondsLeft < 60;
  const fmtCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.shieldWrap}><Shield size={14} color={colors.accent.blue} /></div>
        <div>
          <div style={s.title}>Commander</div>
          <div style={s.subtitle}>AI Security Advisor</div>
        </div>
        <div style={s.statusDot(connectionStatus)} title={connectionStatus} />
      </div>

      {/* Incident queue */}
      {pendingIncidents.length > 0 && (
        <div style={s.queueBar}>
          <div style={s.queueLabel}>
            <span>Pending incidents</span>
            <span style={{ color: pendingIncidents.length > 3 ? colors.accent.orange : colors.text.tertiary }}>
              {pendingIncidents.length}
            </span>
          </div>
          <div style={s.queueScroll}>
            {pendingIncidents.map((inc) => {
              const isSelected = inc.id === selectedIncidentId;
              const isProc = processingIds.has(inc.id);
              return (
                <motion.div
                  key={inc.id}
                  whileHover={{ scale: 1.03 }}
                  style={s.queueChip(inc, isSelected, isProc)}
                  onClick={() => onSelectIncident(inc.id)}
                >
                  {isProc ? (
                    <Loader size={8} color={colors.text.tertiary} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  ) : (
                    <div style={s.chipDot(inc.severity)} />
                  )}
                  <div>
                    <div style={s.chipText}>{inc.username}</div>
                    <div style={s.chipSev(inc.severity)}>
                      {fmtSvc(inc.service)} · {inc.severity}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={s.messages}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              <div style={s.msgBubble(msg.role)}>
                <div style={s.msgLabel(msg.role)}>
                  {msg.role === "commander" ? "◈ Commander" : "You"}
                </div>
                <div style={s.msgText}>{msg.content}</div>
                <div style={s.msgTime}>{fmtTime(msg.timestamp)}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ alignSelf: "flex-start", maxWidth: "88%" }}>
            <div style={s.msgBubble("commander")}>
              <div style={s.msgLabel("commander")}>◈ Commander</div>
              <div style={s.msgText}>
                {typingContent}<span style={{ animation: "blink 1s step-end infinite" }}>▍</span>
              </div>
            </div>
          </motion.div>
        )}

        {isProcessingSelected && !isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ alignSelf: "flex-start" }}>
            <div style={s.msgBubble("commander")}>
              <div style={{ display: "flex", gap: 4, padding: "4px 0", alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <motion.div key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                    style={{ width: 5, height: 5, borderRadius: "50%", background: colors.accent.blue }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={s.inputArea}>
        {selectedIncidentId && (
          <div style={s.countdownBadge(urgent)}>
            <Zap size={9} />
            {autoApproveSecondsLeft !== null
              ? `Auto-approve in ${fmtCountdown(autoApproveSecondsLeft)}`
              : `Responding to: ${selectedIncident?.eventName ?? selectedIncidentId.slice(0, 8)}`}
          </div>
        )}

        <div style={s.quickActions}>
          {(selectedIncidentId ? QUICK_ACTIONS : QUICK_QUESTIONS).map((q) => (
            <button key={q} style={s.quickBtn}
              onClick={() => setInput(q)}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = colors.accent.blue; (e.target as HTMLButtonElement).style.color = colors.accent.blue; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = colors.bg.borderHover; (e.target as HTMLButtonElement).style.color = colors.text.secondary; }}>
              {q}
            </button>
          ))}
        </div>

        <div style={s.inputRow}>
          <textarea style={s.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={selectedIncidentId ? "approve / deny / tell me more…" : "Ask Commander…"}
            rows={1}
            onFocus={(e) => { e.target.style.borderColor = colors.accent.blue + "60"; }}
            onBlur={(e) => { e.target.style.borderColor = colors.bg.border; }}
          />
          <button style={s.sendBtn} onClick={handleSend}
            disabled={!input.trim() || isProcessingSelected}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "#1a6bce"; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = colors.accent.blue; }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
