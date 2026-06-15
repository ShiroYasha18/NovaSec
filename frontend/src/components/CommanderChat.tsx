import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Send, Zap } from "lucide-react";
import { colors, fonts } from "../styles/tokens";

interface Message {
  id: string;
  role: "commander" | "user";
  content: string;
  timestamp: Date;
}

interface Props {
  commanderBrief: string | null;
  isProcessing: boolean;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  onSendResponse: (text: string) => void;
  onAskCommander: (question: string) => Promise<string>;
  activeIncidentId: string | null;
}

const s: Record<string, any> = {
  panel: {
    width: 340,
    minWidth: 340,
    height: "100vh",
    background: colors.bg.surface,
    borderLeft: `1px solid ${colors.bg.border}`,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
  },
  header: {
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${colors.bg.border}`,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: colors.bg.elevated,
  },
  shieldWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: colors.accent.blueGlow,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "shield-pulse 3s ease-in-out infinite",
  },
  title: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    color: colors.text.primary,
    letterSpacing: "0.02em",
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 1,
  },
  statusDot: (status: string) => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginLeft: "auto",
    backgroundColor: status === "connected" ? colors.accent.teal : status === "reconnecting" ? colors.accent.yellow : colors.text.tertiary,
    animation: status === "connected" ? "pulse-dot 2s ease-in-out infinite" : "none",
  }),
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  msgBubble: (role: "commander" | "user") => ({
    maxWidth: "88%",
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: role === "user" ? colors.accent.blueGlow : colors.bg.elevated,
    border: `1px solid ${role === "user" ? colors.accent.blue + "40" : colors.bg.border}`,
    borderRadius: role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
    padding: "10px 12px",
  }),
  msgLabel: (role: "commander" | "user") => ({
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 500,
    color: role === "commander" ? colors.accent.blue : colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 4,
  }),
  msgText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 1.6,
    color: colors.text.primary,
    whiteSpace: "pre-wrap",
  },
  msgTime: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.text.tertiary,
    marginTop: 6,
  },
  processingDots: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    padding: "8px 12px",
  },
  inputArea: {
    padding: "12px 16px",
    borderTop: `1px solid ${colors.bg.border}`,
    background: colors.bg.elevated,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  contextBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: colors.accent.blueGlow,
    border: `1px solid ${colors.accent.blue}40`,
    borderRadius: 6,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent.blue,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: colors.bg.overlay,
    border: `1px solid ${colors.bg.border}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.text.primary,
    resize: "none",
    outline: "none",
    minHeight: 36,
    maxHeight: 96,
    lineHeight: 1.5,
    transition: "border-color 0.15s",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "none",
    background: colors.accent.blue,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s",
  },
  quickActions: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  quickBtn: {
    padding: "3px 8px",
    borderRadius: 4,
    border: `1px solid ${colors.bg.borderHover}`,
    background: "transparent",
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.text.secondary,
    cursor: "pointer",
    transition: "all 0.15s",
  },
};

const QUICK_ACTIONS_ACTIVE = ["approve", "deny", "tell me more"];
const QUICK_QUESTIONS = ["What happened?", "Who is the attacker?", "Show recent threats"];

export function CommanderChat({ commanderBrief, isProcessing, connectionStatus, onSendResponse, onAskCommander, activeIncidentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([{
    id: "init",
    role: "commander",
    content: "NovaSec Commander online. Awaiting events — I'll brief you on every threat detected.",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [typingContent, setTypingContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevBriefRef = useRef<string | null>(null);

  useEffect(() => {
    if (commanderBrief && commanderBrief !== prevBriefRef.current) {
      prevBriefRef.current = commanderBrief;
      typeWriter(commanderBrief, "commander");
    }
  }, [commanderBrief]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingContent]);

  const typeWriter = (text: string, role: "commander" | "user") => {
    if (role !== "commander") {
      addMessage(role, text);
      return;
    }
    setIsTyping(true);
    setTypingContent("");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypingContent(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setIsTyping(false);
        setTypingContent("");
        addMessage("commander", text);
      }
    }, 18);
  };

  const addMessage = (role: "commander" | "user", content: string) => {
    setMessages((prev) => [...prev, {
      id: Math.random().toString(36).slice(2),
      role, content,
      timestamp: new Date(),
    }]);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const text = input.trim();
    setInput("");
    addMessage("user", text);

    const lower = text.toLowerCase();
    if (activeIncidentId && (lower === "approve" || lower === "deny" || lower.includes("more"))) {
      onSendResponse(text);
    } else {
      const answer = await onAskCommander(text);
      typeWriter(answer, "commander");
    }
  };

  const handleQuick = (action: string) => {
    setInput(action);
  };

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div style={s.shieldWrap}><Shield size={16} color={colors.accent.blue} /></div>
        <div>
          <div style={s.title}>Commander</div>
          <div style={s.subtitle}>AI Security Advisor</div>
        </div>
        <div style={s.statusDot(connectionStatus)} title={connectionStatus} />
      </div>

      <div style={s.messages}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}
            >
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
              <div style={s.msgText}>{typingContent}<span style={{ animation: "blink 1s step-end infinite" }}>▍</span></div>
            </div>
          </motion.div>
        )}

        {isProcessing && !isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ alignSelf: "flex-start" }}>
            <div style={s.msgBubble("commander")}>
              <div style={s.processingDots}>
                {[0, 1, 2].map((i) => (
                  <motion.div key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: "50%", background: colors.accent.blue }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={s.inputArea}>
        {activeIncidentId && (
          <div style={s.contextBadge}>
            <Zap size={10} />
            Incident active — respond or ask
          </div>
        )}

        <div style={s.quickActions}>
          {(activeIncidentId ? QUICK_ACTIONS_ACTIVE : QUICK_QUESTIONS).map((q) => (
            <button key={q} style={s.quickBtn} onClick={() => handleQuick(q)}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = colors.accent.blue; (e.target as HTMLButtonElement).style.color = colors.accent.blue; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = colors.bg.borderHover; (e.target as HTMLButtonElement).style.color = colors.text.secondary; }}>
              {q}
            </button>
          ))}
        </div>

        <div style={s.inputRow}>
          <textarea
            style={s.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Commander or respond to incident..."
            rows={1}
            onFocus={(e) => { e.target.style.borderColor = colors.accent.blue + "60"; }}
            onBlur={(e) => { e.target.style.borderColor = colors.bg.border; }}
          />
          <button style={s.sendBtn} onClick={handleSend} disabled={!input.trim() || isProcessing}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "#1a6bce"; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = colors.accent.blue; }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
