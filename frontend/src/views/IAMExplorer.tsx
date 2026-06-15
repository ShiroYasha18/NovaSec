import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, AlertCircle, CheckCircle, Loader } from "lucide-react";
import { colors, fonts } from "../styles/tokens";

const s: Record<string, any> = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "100%" },
  title: { fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: colors.text.primary },
  subtitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  searchCard: {
    background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`,
    borderRadius: 12, padding: 24,
  },
  searchRow: { display: "flex", gap: 12, alignItems: "center" },
  label: { fontFamily: fonts.sans, fontSize: 12, color: colors.text.secondary, marginBottom: 8 },
  input: {
    flex: 1, background: colors.bg.overlay, border: `1px solid ${colors.bg.border}`,
    borderRadius: 8, padding: "10px 14px", fontFamily: fonts.mono, fontSize: 12,
    color: colors.text.primary, outline: "none",
  },
  runBtn: {
    padding: "10px 20px", borderRadius: 8, border: "none",
    background: colors.accent.blue, color: "#fff",
    fontFamily: fonts.sans, fontSize: 12, fontWeight: 500, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 8,
    transition: "background 0.15s",
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card: {
    background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`,
    borderRadius: 12, padding: 20,
  },
  cardTitle: {
    fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
    color: colors.text.primary, marginBottom: 16,
  },
  gaugeWrap: { display: "flex", justifyContent: "center", padding: "8px 0 16px" },
  riskRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", borderBottom: `1px solid ${colors.bg.border}`,
  },
  riskKey: { fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary },
  riskVal: (isHigh: boolean) => ({
    fontFamily: fonts.mono, fontSize: 11,
    color: isHigh ? colors.accent.red : colors.accent.teal, fontWeight: 600,
  }),
  policyBox: {
    background: colors.bg.overlay, borderRadius: 8, padding: "12px 14px",
    fontFamily: fonts.mono, fontSize: 10, color: colors.text.secondary,
    lineHeight: 1.7, maxHeight: 200, overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
  },
  recommendList: { display: "flex", flexDirection: "column" as const, gap: 8 },
  recommendItem: (risk: string) => ({
    display: "flex", gap: 10, alignItems: "flex-start",
    padding: "8px 12px", borderRadius: 8,
    background: risk === "HIGH" ? colors.accent.red + "10" : colors.accent.yellow + "10",
    border: `1px solid ${risk === "HIGH" ? colors.accent.red + "30" : colors.accent.yellow + "30"}`,
  }),
  recommendText: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.primary, lineHeight: 1.5,
  },
  placeholder: {
    padding: "48px 0", textAlign: "center" as const,
    color: colors.text.tertiary, fontSize: 12,
  },
};

function RiskGauge({ score }: { score: number }) {
  const color = score >= 70 ? colors.accent.red : score >= 40 ? colors.accent.yellow : colors.accent.teal;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div style={s.gaugeWrap}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke={colors.bg.border} strokeWidth="10" />
          <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease-out, stroke 0.5s" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column" as const,
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 28, fontWeight: 700, color }}>{score}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            RISK SCORE
          </div>
        </div>
      </div>
    </div>
  );
}

interface WhatIfResult {
  username: string;
  risk_score: number;
  overprivileged: boolean;
  permissions: string[];
  risky_permissions: string[];
  recommendations: Array<{ action: string; risk: string }>;
  current_policy_summary: string;
}

interface Props {
  onRunWhatIf: (username: string) => Promise<WhatIfResult>;
}

export function IAMExplorer({ onRunWhatIf }: Props) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await onRunWhatIf(username.trim());
      setResult(res);
    } catch (e) {
      setError("Failed to run simulation. Check that the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div>
        <div style={s.title}>IAM Explorer</div>
        <div style={s.subtitle}>What-if IAM risk simulator — analyze user permissions and blast radius</div>
      </div>

      <div style={s.searchCard}>
        <div style={s.label}>Simulate IAM risk for a user</div>
        <div style={s.searchRow}>
          <Search size={16} color={colors.text.tertiary} style={{ flexShrink: 0 }} />
          <input
            style={s.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Enter AWS username (e.g. dev-temp, admin-user)..."
            onFocus={(e) => { e.target.style.borderColor = colors.accent.blue + "60"; }}
            onBlur={(e) => { e.target.style.borderColor = colors.bg.border; }}
          />
          <button style={s.runBtn} onClick={run} disabled={isLoading || !username.trim()}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "#1a6bce"; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = colors.accent.blue; }}>
            {isLoading ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={14} />}
            {isLoading ? "Running..." : "Simulate"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", color: colors.accent.red, fontSize: 11, fontFamily: fonts.sans }}>
            <AlertCircle size={12} />
            {error}
          </div>
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div style={s.resultsGrid}>
              <div style={s.card}>
                <div style={s.cardTitle}>Risk Profile: {result.username}</div>
                <RiskGauge score={result.risk_score} />
                {[
                  ["Overprivileged", result.overprivileged ? "YES" : "NO", result.overprivileged],
                  ["Total Permissions", String(result.permissions?.length ?? 0), false],
                  ["Risky Permissions", String(result.risky_permissions?.length ?? 0), (result.risky_permissions?.length ?? 0) > 0],
                ].map(([key, val, isHigh]) => (
                  <div key={String(key)} style={s.riskRow}>
                    <span style={s.riskKey}>{String(key)}</span>
                    <span style={s.riskVal(isHigh as boolean)}>{String(val)}</span>
                  </div>
                ))}
              </div>

              <div style={s.card}>
                <div style={s.cardTitle}>Recommendations</div>
                {result.recommendations?.length > 0 ? (
                  <div style={s.recommendList}>
                    {result.recommendations.map((rec, i) => (
                      <div key={i} style={s.recommendItem(rec.risk)}>
                        {rec.risk === "HIGH" ? (
                          <AlertCircle size={14} color={colors.accent.red} style={{ flexShrink: 0, marginTop: 1 }} />
                        ) : (
                          <AlertCircle size={14} color={colors.accent.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
                        )}
                        <div style={s.recommendText}>{rec.action}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.accent.teal, fontSize: 12, fontFamily: fonts.sans }}>
                    <CheckCircle size={14} />
                    No critical recommendations — user looks clean
                  </div>
                )}
              </div>

              {result.current_policy_summary && (
                <div style={{ ...s.card, gridColumn: "1 / -1" }}>
                  <div style={s.cardTitle}>Policy Summary</div>
                  <div style={s.policyBox}>{result.current_policy_summary}</div>
                </div>
              )}

              {result.risky_permissions?.length > 0 && (
                <div style={{ ...s.card, gridColumn: "1 / -1" }}>
                  <div style={s.cardTitle}>Risky Permissions</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                    {result.risky_permissions.map((p) => (
                      <span key={p} style={{
                        padding: "2px 8px", borderRadius: 4,
                        background: colors.accent.red + "15",
                        border: `1px solid ${colors.accent.red}30`,
                        fontFamily: fonts.mono, fontSize: 10,
                        color: colors.accent.red,
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !isLoading && (
        <div style={s.placeholder}>
          Enter an AWS username above to simulate IAM risk exposure
        </div>
      )}
    </div>
  );
}
