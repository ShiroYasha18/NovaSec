import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { colors, fonts } from "../styles/tokens";
import type { Incident } from "../hooks/useNovaSec";

const SEVERITY_COLORS = {
  CRITICAL: colors.accent.red,
  HIGH: colors.accent.orange,
  MEDIUM: colors.accent.yellow,
  LOW: colors.accent.teal,
};

const s: Record<string, any> = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", height: "100%" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: colors.text.primary },
  subtitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  filterRow: { display: "flex", gap: 8 },
  filterBtn: (active: boolean, color: string) => ({
    padding: "4px 12px", borderRadius: 6,
    border: `1px solid ${active ? color : colors.bg.border}`,
    background: active ? color + "20" : "transparent",
    fontFamily: fonts.mono, fontSize: 10,
    color: active ? color : colors.text.secondary,
    cursor: "pointer", transition: "all 0.15s",
  }),
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 },
  card: (severity: string, expanded: boolean) => ({
    background: colors.bg.elevated,
    border: `1px solid ${expanded ? SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] + "60" : colors.bg.border}`,
    borderRadius: 12, overflow: "hidden",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxShadow: expanded ? `0 0 20px ${SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS]}20` : "none",
    cursor: "pointer",
  }),
  cardTop: (severity: string) => ({
    height: 3, background: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary,
  }),
  cardBody: { padding: "16px 18px" },
  cardHeader: { display: "flex", alignItems: "flex-start", gap: 12 },
  severityBadge: (severity: string) => ({
    padding: "2px 8px", borderRadius: 4, flexShrink: 0,
    background: (SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary) + "20",
    border: `1px solid ${(SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary) + "40"}`,
    fontFamily: fonts.mono, fontSize: 9, fontWeight: 600,
    color: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary,
  }),
  eventName: {
    fontFamily: fonts.mono, fontSize: 13, fontWeight: 600,
    color: colors.text.primary, flex: 1,
  },
  meta: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary, marginTop: 6,
  },
  tagRow: { display: "flex", gap: 4, flexWrap: "wrap" as const, marginTop: 8 },
  tag: (color: string) => ({
    padding: "1px 6px", borderRadius: 4,
    background: color + "20", border: `1px solid ${color}40`,
    fontFamily: fonts.mono, fontSize: 9, color,
  }),
  chevronBtn: {
    marginLeft: "auto", flexShrink: 0, color: colors.text.tertiary,
    display: "flex", alignItems: "center",
  },
  expanded: {
    padding: "0 18px 16px",
    display: "flex", flexDirection: "column" as const, gap: 12,
  },
  divider: { height: 1, background: colors.bg.border, marginBottom: 4 },
  section: {
    background: colors.bg.overlay, borderRadius: 8, padding: "12px 14px",
  },
  sectionTitle: {
    fontFamily: fonts.mono, fontSize: 9, fontWeight: 600,
    color: colors.text.tertiary, textTransform: "uppercase" as const,
    letterSpacing: "0.1em", marginBottom: 8,
  },
  detailRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "4px 0",
    borderBottom: `1px solid ${colors.bg.border}`,
  },
  detailKey: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.text.secondary,
  },
  detailVal: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.text.primary, maxWidth: "60%",
    textAlign: "right" as const, wordBreak: "break-all" as const,
  },
  briefText: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary,
    lineHeight: 1.6, whiteSpace: "pre-wrap" as const,
  },
  emptyState: {
    padding: "60px 0", textAlign: "center" as const,
    color: colors.text.tertiary, fontSize: 13,
  },
};

interface Props {
  incidents: Incident[];
}

export function Incidents({ incidents }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const filtered = filter === "ALL" ? incidents : incidents.filter((i) => i.severity === filter);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Incidents</div>
          <div style={s.subtitle}>{incidents.length} total · {incidents.filter((i) => !i.resolved).length} active</div>
        </div>
      </div>

      <div style={s.filterRow}>
        {FILTERS.map((f) => (
          <button key={f} style={s.filterBtn(filter === f, SEVERITY_COLORS[f as keyof typeof SEVERITY_COLORS] ?? colors.accent.blue)}
            onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={s.emptyState}>
          No incidents{filter !== "ALL" ? ` at ${filter} severity` : ""} — fire events to populate
        </div>
      ) : (
        <div style={s.grid}>
          <AnimatePresence>
            {filtered.map((inc) => (
              <motion.div key={inc.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }}>
                <div style={s.card(inc.severity, expanded === inc.id)}
                  onClick={() => setExpanded(expanded === inc.id ? null : inc.id)}>
                  <div style={s.cardTop(inc.severity)} />
                  <div style={s.cardBody}>
                    <div style={s.cardHeader}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={s.severityBadge(inc.severity)}>{inc.severity}</span>
                          {inc.resolved && <span style={s.tag(colors.accent.teal)}>RESOLVED</span>}
                          {inc.pattern_detected && <span style={s.tag(colors.accent.orange)}>REPEAT</span>}
                        </div>
                        <div style={s.eventName}>{inc.eventName}</div>
                      </div>
                      <div style={s.chevronBtn}>
                        {expanded === inc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                    <div style={s.meta}>{inc.username} · {inc.resource}</div>
                    <div style={s.meta}>{formatDistanceToNow(new Date(inc.timestamp), { addSuffix: true })}</div>
                    <div style={s.tagRow}>
                      {inc.mitre && <span style={s.tag(colors.accent.purple)}>{inc.mitre.technique_id} {inc.mitre.tactic}</span>}
                      {inc.defense_evasion_detected && <span style={s.tag(colors.accent.red)}>DEF EVASION</span>}
                      {inc.blast_radius && <span style={s.tag(SEVERITY_COLORS[inc.blast_radius.blast_radius_level] ?? colors.text.tertiary)}>
                        BLAST: {inc.blast_radius.blast_radius_level}
                      </span>}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expanded === inc.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                        <div style={s.expanded} onClick={(e) => e.stopPropagation()}>
                          <div style={s.divider} />

                          {inc.commander_brief && (
                            <div style={s.section}>
                              <div style={s.sectionTitle}>◈ Commander Brief</div>
                              <div style={s.briefText}>{inc.commander_brief}</div>
                            </div>
                          )}

                          {inc.mitre && (
                            <div style={s.section}>
                              <div style={s.sectionTitle}>⚡ MITRE ATT&CK</div>
                              {[
                                ["Technique", `${inc.mitre.technique_id} — ${inc.mitre.technique_name}`],
                                ["Tactic", inc.mitre.tactic],
                                ...(inc.mitre.description ? [["Description", inc.mitre.description]] : []),
                              ].map(([k, v]) => (
                                <div key={k} style={s.detailRow}>
                                  <span style={s.detailKey}>{k}</span>
                                  <span style={s.detailVal}>{v}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {inc.blast_radius && (
                            <div style={s.section}>
                              <div style={s.sectionTitle}>💥 Blast Radius</div>
                              {[
                                ["Level", inc.blast_radius.blast_radius_level],
                                ["Events", String(inc.blast_radius.events_found)],
                                ["Timespan", `${inc.blast_radius.timespan_hours.toFixed(1)}h`],
                              ].map(([k, v]) => (
                                <div key={k} style={s.detailRow}>
                                  <span style={s.detailKey}>{k}</span>
                                  <span style={s.detailVal}>{v}</span>
                                </div>
                              ))}
                              {inc.blast_radius.sensitive_actions?.length > 0 && (
                                <div style={{ marginTop: 8, fontFamily: fonts.mono, fontSize: 10, color: colors.text.secondary }}>
                                  Sensitive: {inc.blast_radius.sensitive_actions.join(", ")}
                                </div>
                              )}
                            </div>
                          )}

                          {inc.threat_context && (
                            <div style={s.section}>
                              <div style={s.sectionTitle}>🧠 Threat Memory</div>
                              {[
                                ["Actor", inc.threat_context.username],
                                ["Past Incidents", String(inc.threat_context.user_incident_count)],
                                ["Pattern", inc.threat_context.pattern_detected ? "YES" : "NO"],
                              ].map(([k, v]) => (
                                <div key={k} style={s.detailRow}>
                                  <span style={s.detailKey}>{k}</span>
                                  <span style={s.detailVal}>{v}</span>
                                </div>
                              ))}
                              {inc.threat_context.pattern_summary && (
                                <div style={{ marginTop: 8, fontFamily: fonts.sans, fontSize: 10, color: colors.text.secondary, lineHeight: 1.5 }}>
                                  {inc.threat_context.pattern_summary}
                                </div>
                              )}
                            </div>
                          )}

                          {inc.fix_result && (
                            <div style={s.section}>
                              <div style={s.sectionTitle}>🔧 Fix Result</div>
                              <div style={{ fontFamily: fonts.mono, fontSize: 10,
                                color: inc.fix_result.success ? colors.accent.teal : colors.accent.red }}>
                                {inc.fix_result.success ? "Fix applied successfully" : inc.fix_result.error ?? "Fix failed"}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
