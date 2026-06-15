import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader, User, ChevronDown, ChevronRight, Shield, ShieldAlert, ShieldOff } from "lucide-react";
import { colors, fonts } from "../styles/tokens";
import type { Incident } from "../hooks/useNovaSec";

const IAM_USERNAMES = [
  "admin-user", "root-backdoor", "malicious-mike", "pentest-external",
  "svc-account-prod", "ci-bot-staging", "ops-user", "alice-devops",
  "bob-infra", "contractor-01", "dev-temp", "intern-john", "unknown-user",
];

const RISK_COLORS: Record<string, string> = {
  CRITICAL: colors.accent.red,
  HIGH: colors.accent.orange,
  MEDIUM: colors.accent.yellow,
  LOW: colors.accent.teal,
};

function deriveUserMeta(username: string, incidents: Incident[]) {
  const incs = incidents.filter((i) => i.username === username);

  if (incs.length === 0) {
    return { role: "No incidents yet", riskLevel: "LOW", incidentCount: 0 };
  }

  const eventNames  = incs.map((i) => i.eventName ?? "");
  const hasEvasion  = incs.some((i) => i.defense_evasion_detected);
  const hasPattern  = incs.some((i) => i.pattern_detected);
  const hasCritical = incs.some((i) => i.severity === "CRITICAL");
  const hasHigh     = incs.some((i) => i.severity === "HIGH");
  const hasMedium   = incs.some((i) => i.severity === "MEDIUM");

  const match = (terms: string[]) =>
    eventNames.some((n) => terms.some((t) => n.toLowerCase().includes(t.toLowerCase())));

  let role = "Standard User";
  if (hasEvasion)                                          role = "Evasion Specialist";
  else if (hasPattern && hasCritical)                      role = "Persistent Threat Actor";
  else if (hasPattern)                                     role = "Repeat Offender";
  else if (match(["StopLogging", "DeleteTrail"]))          role = "Log Tamperer";
  else if (match(["CreateAccessKey", "AttachPolicy", "CreateUser"])) role = "Privilege Escalator";
  else if (match(["BucketAcl", "BucketPolicy", "PutObject"])) role = "Data Exfiltrator";
  else if (match(["SecurityGroup", "SecurityGroupIngress"])) role = "Network Threat";
  else if (match(["TerminateInstances", "StopInstances"])) role = "Disruptive Actor";
  else if (hasCritical)                                    role = "Critical Threat";
  else if (hasHigh)                                        role = "High Risk Actor";
  else if (hasMedium)                                      role = "Moderate Risk User";

  let riskLevel = "LOW";
  if (hasCritical || hasEvasion)      riskLevel = "CRITICAL";
  else if (hasHigh || hasPattern)     riskLevel = "HIGH";
  else if (hasMedium)                 riskLevel = "MEDIUM";

  return { role, riskLevel, incidentCount: incs.length };
}

function riskIcon(level: string) {
  if (level === "CRITICAL") return <ShieldOff size={13} color={RISK_COLORS.CRITICAL} />;
  if (level === "HIGH")     return <ShieldAlert size={13} color={RISK_COLORS.HIGH} />;
  return <Shield size={13} color={RISK_COLORS[level] ?? colors.text.tertiary} />;
}

function RiskGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? colors.accent.red : score >= 40 ? colors.accent.yellow : colors.accent.teal;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <svg width="88" height="88" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke={colors.bg.border} strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease-out, stroke 0.4s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 18, fontWeight: 700, color }}>{score}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 7, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>RISK</div>
      </div>
    </div>
  );
}

interface WhatIfResult {
  worst_case: string;
  at_risk_resources: string[];
  blast_radius: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  top_recommendation: string;
  summary: string;
}

const BLAST_SCORE: Record<string, number> = { LOW: 18, MEDIUM: 50, HIGH: 76, CRITICAL: 95 };

interface Props {
  onRunWhatIf: (username: string) => Promise<WhatIfResult>;
  incidents: Incident[];
}

export function IAMExplorer({ onRunWhatIf, incidents }: Props) {
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [loading, setLoading]     = useState<string | null>(null);
  const [cache, setCache]         = useState<Record<string, WhatIfResult>>({});
  const [errors, setErrors]       = useState<Record<string, string>>({});

  const toggle = async (username: string) => {
    if (expanded === username) { setExpanded(null); return; }

    setExpanded(username);
    if (cache[username]) return;

    setLoading(username);
    setErrors((e) => { const n = { ...e }; delete n[username]; return n; });
    try {
      const res = await onRunWhatIf(username);
      setCache((c) => ({ ...c, [username]: res }));
    } catch {
      setErrors((e) => ({ ...e, [username]: "Simulation failed — is the backend running?" }));
    } finally {
      setLoading(null);
    }
  };

  // Sort: most incidents first, then alphabetically
  const sorted = [...IAM_USERNAMES].sort((a, b) => {
    const ca = incidents.filter((i) => i.username === a).length;
    const cb = incidents.filter((i) => i.username === b).length;
    return cb - ca || a.localeCompare(b);
  });

  const totalKnown = sorted.filter(
    (u) => incidents.some((i) => i.username === u)
  ).length;

  return (
    <div style={{
      padding: 28,
      display: "flex", flexDirection: "column", gap: 20,
      overflowY: "auto", height: "100%", boxSizing: "border-box",
    }}>
      <div>
        <div style={{ fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: colors.text.primary }}>
          IAM Explorer
        </div>
        <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>
          {sorted.length} users · {totalKnown} with recorded incidents · click a row to expand blast radius
        </div>
      </div>

      {/* Roster — each row owns its own inline accordion */}
      <div style={{
        background: colors.bg.elevated,
        border: `1px solid ${colors.bg.border}`,
        borderRadius: 12,
      }}>
        {sorted.map((username, i) => {
          const { role, riskLevel, incidentCount } = deriveUserMeta(username, incidents);
          const isOpen    = expanded === username;
          const isLoading = loading === username;
          const result    = cache[username] ?? null;
          const err       = errors[username] ?? null;
          const isLast    = i === sorted.length - 1;
          const accentColor = RISK_COLORS[riskLevel] ?? colors.text.tertiary;

          return (
            <div key={username} style={{
              borderBottom: isLast ? "none" : `1px solid ${colors.bg.border}`,
              borderRadius: i === 0 ? "12px 12px 0 0" : i === sorted.length - 1 ? "0 0 12px 12px" : 0,
              overflow: "hidden",
            }}>
              {/* Row header */}
              <div
                onClick={() => toggle(username)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "11px 18px", cursor: "pointer",
                  background: isOpen ? colors.accent.blueGlow : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isOpen) (e.currentTarget as HTMLElement).style.background = colors.bg.overlay;
                }}
                onMouseLeave={(e) => {
                  if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: accentColor + "20",
                  border: `1px solid ${accentColor}40`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <User size={13} color={accentColor} />
                </div>

                {/* Name + role */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: fonts.mono, fontSize: 12, fontWeight: 600,
                    color: isOpen ? colors.accent.blue : colors.text.primary,
                  }}>
                    {username}
                  </div>
                  <div style={{ fontFamily: fonts.sans, fontSize: 10, color: colors.text.tertiary, marginTop: 1 }}>
                    {role}
                    {incidentCount > 0 && (
                      <span style={{ marginLeft: 6, color: accentColor }}>· {incidentCount} incident{incidentCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>

                {/* Risk badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "2px 8px", borderRadius: 4,
                  background: accentColor + "15",
                  border: `1px solid ${accentColor}30`,
                  flexShrink: 0,
                }}>
                  {riskIcon(riskLevel)}
                  <span style={{ fontFamily: fonts.mono, fontSize: 9, color: accentColor, fontWeight: 600 }}>
                    {riskLevel}
                  </span>
                </div>

                {/* Chevron / loader */}
                {isLoading ? (
                  <Loader size={13} color={colors.accent.blue} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                ) : isOpen ? (
                  <ChevronDown size={13} color={colors.accent.blue} style={{ flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={13} color={colors.text.tertiary} style={{ flexShrink: 0 }} />
                )}
              </div>

              {/* Inline accordion panel */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{
                      padding: "16px 18px 18px",
                      borderTop: `1px solid ${colors.bg.border}`,
                      background: colors.bg.overlay,
                    }}>
                      {/* Loading state */}
                      {isLoading && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.text.tertiary, fontSize: 11, fontFamily: fonts.sans }}>
                          <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                          Running blast radius simulation…
                        </div>
                      )}

                      {/* Error */}
                      {err && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", color: colors.accent.red, fontSize: 11, fontFamily: fonts.sans }}>
                          <AlertCircle size={12} />
                          {err}
                        </div>
                      )}

                      {/* Results */}
                      {result && !isLoading && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {/* Top row: gauge + worst case + recommendation */}
                          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 16, alignItems: "start" }}>
                            {/* Gauge */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                              <RiskGauge score={BLAST_SCORE[result.blast_radius] ?? 50} />
                              <span style={{
                                fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
                                color: RISK_COLORS[result.blast_radius],
                              }}>
                                {result.blast_radius}
                              </span>
                            </div>

                            {/* Worst case */}
                            <div>
                              <div style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 600, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                                Worst Case
                              </div>
                              <div style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.text.primary, lineHeight: 1.6 }}>
                                {result.worst_case}
                              </div>
                            </div>

                            {/* Recommendation */}
                            <div>
                              <div style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 600, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                                Top Fix
                              </div>
                              <div style={{
                                display: "flex", gap: 8, alignItems: "flex-start",
                                padding: "8px 10px", borderRadius: 6,
                                background: colors.accent.orange + "10",
                                border: `1px solid ${colors.accent.orange}25`,
                              }}>
                                <AlertCircle size={12} color={colors.accent.orange} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.text.primary, lineHeight: 1.5 }}>
                                  {result.top_recommendation}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Summary */}
                          {result.summary && (
                            <div style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary, lineHeight: 1.7, paddingTop: 4, borderTop: `1px solid ${colors.bg.border}` }}>
                              {result.summary}
                            </div>
                          )}

                          {/* At-risk resources */}
                          {result.at_risk_resources?.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {result.at_risk_resources.map((r) => (
                                <span key={r} style={{
                                  padding: "2px 8px", borderRadius: 4,
                                  background: colors.accent.red + "12",
                                  border: `1px solid ${colors.accent.red}25`,
                                  fontFamily: fonts.mono, fontSize: 9, color: colors.accent.red,
                                }}>
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
