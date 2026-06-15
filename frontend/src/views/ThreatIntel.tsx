import { colors, fonts } from "../styles/tokens";
import type { Incident, MitreInfo } from "../hooks/useNovaSec";

const s: Record<string, any> = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "100%" },
  title: { fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: colors.text.primary },
  subtitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card: {
    background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`,
    borderRadius: 12, padding: 20,
  },
  cardTitle: {
    fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
    color: colors.text.primary, marginBottom: 16,
  },
  tableHeader: {
    display: "grid", gridTemplateColumns: "1fr 2fr 80px 80px",
    padding: "6px 0", borderBottom: `1px solid ${colors.bg.border}`,
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary,
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
  },
  tableRow: {
    display: "grid", gridTemplateColumns: "1fr 2fr 80px 80px",
    padding: "10px 0", borderBottom: `1px solid ${colors.bg.border}`,
    alignItems: "center",
  },
  actor: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.text.primary, fontWeight: 500,
  },
  count: (n: number) => ({
    fontFamily: fonts.mono, fontSize: 11,
    color: n >= 3 ? colors.accent.red : n >= 2 ? colors.accent.orange : colors.text.secondary,
    fontWeight: n >= 2 ? 600 : 400,
  }),
  badge: (color: string) => ({
    padding: "1px 6px", borderRadius: 4,
    background: color + "20", border: `1px solid ${color}40`,
    fontFamily: fonts.mono, fontSize: 9, color,
    display: "inline-block",
  }),
  mitreTiles: {
    display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
  },
  mitreTile: (tactic: string) => ({
    background: colors.bg.overlay, border: `1px solid ${colors.bg.border}`,
    borderRadius: 8, padding: "10px 12px",
    borderLeft: `3px solid ${tacticColor(tactic)}`,
  }),
  tileId: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.accent.blue, marginBottom: 2,
  },
  tileName: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.primary, fontWeight: 500,
  },
  tileTactic: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary, marginTop: 2,
  },
  tileCount: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.text.secondary, marginTop: 4,
  },
  emptyState: {
    padding: "32px 0", textAlign: "center" as const, color: colors.text.tertiary, fontSize: 12,
  },
};

function tacticColor(tactic: string): string {
  const MAP: Record<string, string> = {
    "Collection": colors.accent.blue,
    "Persistence": colors.accent.orange,
    "Defense Evasion": colors.accent.red,
    "Initial Access": colors.accent.purple,
    "Execution": colors.accent.yellow,
    "Exfiltration": colors.accent.red,
    "Discovery": colors.accent.teal,
  };
  return MAP[tactic] ?? colors.accent.blue;
}

interface ActorStats {
  username: string;
  count: number;
  severities: string[];
  tactics: string[];
  pattern: boolean;
}

function buildActorStats(incidents: Incident[]): ActorStats[] {
  const map = new Map<string, ActorStats>();
  incidents.forEach((inc) => {
    const existing = map.get(inc.username) ?? {
      username: inc.username, count: 0, severities: [], tactics: [], pattern: false
    };
    existing.count++;
    if (!existing.severities.includes(inc.severity)) existing.severities.push(inc.severity);
    if (inc.mitre && !existing.tactics.includes(inc.mitre.tactic)) existing.tactics.push(inc.mitre.tactic);
    if (inc.pattern_detected) existing.pattern = true;
    map.set(inc.username, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function buildMitreCoverage(incidents: Incident[]): Map<string, { info: MitreInfo; count: number }> {
  const map = new Map<string, { info: MitreInfo; count: number }>();
  incidents.forEach((inc) => {
    if (!inc.mitre) return;
    const existing = map.get(inc.mitre.technique_id);
    if (existing) existing.count++;
    else map.set(inc.mitre.technique_id, { info: inc.mitre, count: 1 });
  });
  return map;
}

const SEVERITY_COLORS = {
  CRITICAL: colors.accent.red,
  HIGH: colors.accent.orange,
  MEDIUM: colors.accent.yellow,
  LOW: colors.accent.teal,
};

interface Props { incidents: Incident[]; }

export function ThreatIntel({ incidents }: Props) {
  const actors = buildActorStats(incidents);
  const mitreCoverage = buildMitreCoverage(incidents);

  return (
    <div style={s.page}>
      <div>
        <div style={s.title}>Threat Intelligence</div>
        <div style={s.subtitle}>Threat actor profiling and MITRE ATT&CK coverage</div>
      </div>

      <div style={s.grid}>
        <div style={s.card}>
          <div style={s.cardTitle}>Threat Actors</div>
          {actors.length === 0 ? (
            <div style={s.emptyState}>No actors profiled yet</div>
          ) : (
            <>
              <div style={s.tableHeader}>
                <span>Actor</span>
                <span>Tactics</span>
                <span>Events</span>
                <span>Status</span>
              </div>
              {actors.map((actor) => (
                <div key={actor.username} style={s.tableRow}>
                  <div>
                    <div style={s.actor}>{actor.username}</div>
                    <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" as const }}>
                      {actor.severities.map((sev) => (
                        <span key={sev} style={s.badge(SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary)}>
                          {sev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.secondary, lineHeight: 1.6 }}>
                    {actor.tactics.join(" · ") || "—"}
                  </div>
                  <div style={s.count(actor.count)}>{actor.count}</div>
                  <div>
                    {actor.pattern ? (
                      <span style={s.badge(colors.accent.red)}>REPEAT</span>
                    ) : (
                      <span style={s.badge(colors.text.tertiary)}>NEW</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>MITRE ATT&CK Coverage</div>
          {mitreCoverage.size === 0 ? (
            <div style={s.emptyState}>No MITRE techniques detected</div>
          ) : (
            <div style={s.mitreTiles}>
              {Array.from(mitreCoverage.values()).map(({ info, count }) => (
                <div key={info.technique_id} style={s.mitreTile(info.tactic)}>
                  <div style={s.tileId}>{info.technique_id}</div>
                  <div style={s.tileName}>{info.technique_name}</div>
                  <div style={s.tileTactic}>{info.tactic}</div>
                  <div style={s.tileCount}>{count} event{count !== 1 ? "s" : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Tactic Heatmap</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
          {Object.entries(
            incidents.reduce((acc, inc) => {
              if (inc.mitre?.tactic) acc[inc.mitre.tactic] = (acc[inc.mitre.tactic] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).sort((a, b) => b[1] - a[1]).map(([tactic, count]) => (
            <div key={tactic} style={{
              padding: "8px 14px", borderRadius: 8,
              background: tacticColor(tactic) + "15",
              border: `1px solid ${tacticColor(tactic)}40`,
              textAlign: "center" as const,
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: tacticColor(tactic) }}>{count}</div>
              <div style={{ fontFamily: fonts.sans, fontSize: 10, color: colors.text.secondary, marginTop: 2 }}>{tactic}</div>
            </div>
          ))}
          {incidents.filter((i) => i.mitre).length === 0 && (
            <div style={s.emptyState}>Fire events with MITRE-mapped techniques to populate</div>
          )}
        </div>
      </div>
    </div>
  );
}
