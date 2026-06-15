import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, AlertTriangle, Brain, Key, Shield } from "lucide-react";
import { colors, fonts } from "./styles/tokens";
import { useNovaSec } from "./hooks/useNovaSec";
import { startChaosMonkey } from "./utils/chaosMonkey";
import { CommanderChat } from "./components/CommanderChat";
import { Dashboard } from "./views/Dashboard";
import { Incidents } from "./views/Incidents";
import { ThreatIntel } from "./views/ThreatIntel";
import { IAMExplorer } from "./views/IAMExplorer";

type View = "dashboard" | "incidents" | "threatintel" | "iam";

const NAV = [
  { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
  { id: "incidents" as View, label: "Incidents", icon: AlertTriangle },
  { id: "threatintel" as View, label: "Threat Intel", icon: Brain },
  { id: "iam" as View, label: "IAM Explorer", icon: Key },
];

const s: Record<string, any> = {
  root: {
    display: "flex", height: "100vh", width: "100vw",
    background: "#080B11", overflow: "hidden",
  },
  sidebar: {
    width: 220, minWidth: 220,
    background: "#0D1117",
    borderRight: `1px solid ${colors.bg.border}`,
    display: "flex", flexDirection: "column",
    padding: "20px 12px",
  },
  logoRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "4px 8px 24px",
  },
  logoIcon: {
    width: 32, height: 32, borderRadius: 8,
    background: "linear-gradient(135deg, rgba(56,139,253,0.2), rgba(188,140,255,0.2))",
    border: `1px solid ${colors.accent.blue}40`,
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "shield-pulse 3s ease-in-out infinite",
  },
  logoText: {
    fontFamily: fonts.sans, fontSize: 16, fontWeight: 700,
    color: colors.text.primary, letterSpacing: "-0.01em",
  },
  logoSub: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.text.tertiary, marginTop: 1,
  },
  navSection: { display: "flex", flexDirection: "column", gap: 2 },
  navItem: (active: boolean) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 8,
    background: active ? colors.accent.blueGlow : "transparent",
    border: `1px solid ${active ? colors.accent.blue + "40" : "transparent"}`,
    fontFamily: fonts.sans, fontSize: 12, fontWeight: active ? 600 : 400,
    color: active ? colors.accent.blue : colors.text.secondary,
    cursor: "pointer", transition: "all 0.15s",
  }),
  sidebarFooter: {
    marginTop: "auto", padding: "12px 8px 4px",
    borderTop: `1px solid ${colors.bg.border}`,
  },
  versionText: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary,
    textAlign: "center" as const,
  },
  main: {
    flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
  },
};

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [isChaosActive, setIsChaosActive] = useState(false);
  const stopChaosRef = { current: null as null | (() => void) };

  const {
    incidents, activeIncident, isProcessing,
    commanderBrief, connectionStatus,
    fireEvent, sendResponse, askCommander, runWhatIf,
  } = useNovaSec();

  const handleToggleChaos = useCallback(() => {
    if (isChaosActive) {
      stopChaosRef.current?.();
      stopChaosRef.current = null;
      setIsChaosActive(false);
    } else {
      stopChaosRef.current = startChaosMonkey(fireEvent);
      setIsChaosActive(true);
    }
  }, [isChaosActive, fireEvent]);

  useEffect(() => {
    return () => { stopChaosRef.current?.(); };
  }, []);

  return (
    <div style={s.root}>
      <nav style={s.sidebar}>
        <div style={s.logoRow}>
          <div style={s.logoIcon}><Shield size={16} color={colors.accent.blue} /></div>
          <div>
            <div style={s.logoText}>NovaSec</div>
            <div style={s.logoSub}>AI Security Platform</div>
          </div>
        </div>

        <div style={s.navSection}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <div key={id} style={s.navItem(view === id)} onClick={() => setView(id)}
              onMouseEnter={(e) => {
                if (view !== id) {
                  (e.currentTarget as HTMLDivElement).style.background = colors.bg.overlay;
                  (e.currentTarget as HTMLDivElement).style.color = colors.text.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (view !== id) {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  (e.currentTarget as HTMLDivElement).style.color = colors.text.secondary;
                }
              }}>
              <Icon size={15} />
              {label}
              {id === "incidents" && incidents.filter((i) => !i.resolved).length > 0 && (
                <span style={{
                  marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 9,
                  background: colors.accent.red, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: fonts.mono, fontSize: 9, color: "#fff", fontWeight: 700,
                }}>
                  {incidents.filter((i) => !i.resolved).length}
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={s.sidebarFooter}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginBottom: 8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connectionStatus === "connected" ? colors.accent.teal : colors.text.tertiary,
              animation: connectionStatus === "connected" ? "pulse-dot 2s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary }}>
              {connectionStatus === "connected" ? "Live" : connectionStatus}
            </span>
          </div>
          <div style={s.versionText}>v1.0.0 · Gemini 2.5 Flash</div>
        </div>
      </nav>

      <div style={s.main}>
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}
            style={{ height: "100%", overflow: "hidden" }}>
            {view === "dashboard" && (
              <Dashboard
                incidents={incidents}
                isProcessing={isProcessing}
                isChaosActive={isChaosActive}
                onToggleChaos={handleToggleChaos}
                onFireEvent={fireEvent}
              />
            )}
            {view === "incidents" && <Incidents incidents={incidents} />}
            {view === "threatintel" && <ThreatIntel incidents={incidents} />}
            {view === "iam" && <IAMExplorer onRunWhatIf={runWhatIf} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <CommanderChat
        commanderBrief={commanderBrief}
        isProcessing={isProcessing}
        connectionStatus={connectionStatus}
        onSendResponse={sendResponse}
        onAskCommander={askCommander}
        activeIncidentId={activeIncident?.id ?? null}
      />
    </div>
  );
}
