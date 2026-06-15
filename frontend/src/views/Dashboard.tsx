import { motion } from "framer-motion";
import { AlertTriangle, Shield, Activity, Users, Zap, RefreshCw } from "lucide-react";
import { AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
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
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "100%" },
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: colors.text.primary },
  pageSubtitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.text.tertiary, marginTop: 2 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  statCard: (_accent: string) => ({
    background: colors.bg.elevated,
    border: `1px solid ${colors.bg.border}`,
    borderRadius: 12,
    padding: 20,
    position: "relative",
    overflow: "hidden",
    transition: "border-color 0.2s",
  }),
  statAccentBar: (color: string) => ({
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    background: color,
  }),
  statIcon: (color: string) => ({
    width: 36, height: 36, borderRadius: 8,
    background: color + "20",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  }),
  statValue: {
    fontFamily: fonts.mono, fontSize: 28, fontWeight: 700,
    color: colors.text.primary, lineHeight: 1,
    animation: "count-up 0.4s ease-out",
  },
  statLabel: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary,
    marginTop: 4,
  },
  chartsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  card: {
    background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`,
    borderRadius: 12, padding: 20,
  },
  cardTitle: {
    fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
    color: colors.text.primary, marginBottom: 16,
  },
  feedCard: {
    background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`,
    borderRadius: 12, padding: 20,
  },
  feedItem: (_severity: string) => ({
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "10px 0",
    borderBottom: `1px solid ${colors.bg.border}`,
    animation: "slide-in-right 0.3s ease-out",
  }),
  severityDot: (severity: string) => ({
    width: 8, height: 8, borderRadius: "50%",
    background: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary,
    flexShrink: 0, marginTop: 5,
    boxShadow: `0 0 6px ${SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary}`,
  }),
  feedEvent: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.text.primary, fontWeight: 500,
  },
  feedMeta: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.text.secondary, marginTop: 2,
  },
  feedTime: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.text.tertiary, marginLeft: "auto", flexShrink: 0,
  },
  badge: (color: string) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "1px 6px", borderRadius: 4,
    background: color + "20", border: `1px solid ${color}40`,
    fontFamily: fonts.mono, fontSize: 9, color: color,
    marginTop: 2,
  }),
  chaosBtn: (active: boolean) => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "7px 16px", borderRadius: 8, border: "none",
    background: active ? colors.accent.red : colors.bg.overlay,
    color: active ? "#fff" : colors.text.secondary,
    fontFamily: fonts.sans, fontSize: 12, fontWeight: 500,
    cursor: "pointer", transition: "all 0.2s",
    boxShadow: active ? `0 0 20px ${colors.accent.red}40` : "none",
  }),
};

function buildAreaData(incidents: Incident[]) {
  const now = Date.now();
  // 10 buckets: index 0 = "9m ago", index 9 = "now" — oldest LEFT, newest RIGHT
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    t: i === 9 ? "now" : `${9 - i}m ago`,
    v: 0,
  }));
  incidents.forEach((inc) => {
    const ageMin = (now - new Date(inc.timestamp).getTime()) / 60000;
    const idx = 9 - Math.min(9, Math.floor(ageMin));
    if (idx >= 0 && idx < 10) buckets[idx].v++;
  });
  return buckets;
}

function buildPieData(incidents: Incident[]) {
  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  incidents.forEach((i) => { if (i.severity in counts) counts[i.severity]++; });
  return Object.entries(counts).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
}

function buildServiceData(incidents: Incident[]) {
  const counts: Record<string, number> = {};
  incidents.forEach((i) => {
    const svc = i.service?.replace("aws.", "").toUpperCase() ?? "OTHER";
    counts[svc] = (counts[svc] ?? 0) + 1;
  });
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

interface Props {
  incidents: Incident[];
  isProcessing: boolean;
  isChaosActive: boolean;
  onToggleChaos: () => void;
  onFireEvent: (scenario: string) => void;
}

export function Dashboard({ incidents, isProcessing, isChaosActive, onToggleChaos, onFireEvent }: Props) {
  const criticalCount = incidents.filter((i) => i.severity === "CRITICAL").length;
  const activeCount = incidents.filter((i) => !i.resolved).length;
  const uniqueActors = new Set(incidents.map((i) => i.username)).size;
  const mitreCount = incidents.filter((i) => i.mitre).length;

  const areaData = buildAreaData(incidents);
  const pieData = buildPieData(incidents);
  const serviceData = buildServiceData(incidents);

  const SCENARIOS = ["s3", "iam", "cloudtrail", "ec2"];

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.pageTitle}>Security Overview</div>
          <div style={s.pageSubtitle}>Real-time cloud threat intelligence</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {SCENARIOS.map((sc) => (
            <button key={sc} onClick={() => onFireEvent(sc)} disabled={isProcessing}
              style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${colors.bg.border}`,
                background: "transparent", fontFamily: fonts.mono, fontSize: 10,
                color: colors.text.secondary, cursor: isProcessing ? "not-allowed" : "pointer" }}>
              +{sc.toUpperCase()}
            </button>
          ))}
          <button style={s.chaosBtn(isChaosActive)} onClick={onToggleChaos}>
            <Zap size={13} />
            {isChaosActive ? "Chaos ON" : "Chaos Monkey"}
          </button>
        </div>
      </div>

      <div style={s.statsRow}>
        {[
          { label: "Critical Threats", value: criticalCount, icon: AlertTriangle, color: colors.accent.red },
          { label: "Active Incidents", value: activeCount, icon: Activity, color: colors.accent.orange },
          { label: "Threat Actors", value: uniqueActors, icon: Users, color: colors.accent.purple },
          { label: "MITRE Mapped", value: mitreCount, icon: Shield, color: colors.accent.blue },
        ].map(({ label, value, icon: Icon, color }) => (
          <motion.div key={label} whileHover={{ y: -2 }}
            style={s.statCard(color)}>
            <div style={s.statAccentBar(color)} />
            <div style={s.statIcon(color)}><Icon size={18} color={color} /></div>
            <div style={s.statValue}>{value}</div>
            <div style={s.statLabel}>{label}</div>
          </motion.div>
        ))}
      </div>

      <div style={s.chartsRow}>
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={s.cardTitle as any}>Incidents over Time</div>
            <span style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.text.tertiary }}>count vs last 10 min</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={areaData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.accent.blue} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={colors.accent.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={{ fill: colors.text.tertiary, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fill: colors.text.tertiary, fontSize: 9 }} axisLine={false} tickLine={false} width={18} />
              <Tooltip
                contentStyle={{ background: colors.bg.overlay, border: `1px solid ${colors.bg.border}`, borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [v, "incidents"]}
                labelFormatter={(l) => `Time: ${l}`}
              />
              <Area type="monotone" dataKey="v" stroke={colors.accent.blue} fill="url(#blueGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>Severity Distribution</div>
          {pieData.length === 0 ? (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: colors.text.tertiary, fontSize: 12 }}>
              No incidents yet
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] ?? colors.text.tertiary} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pieData.map((entry) => (
                  <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] }} />
                    <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.secondary }}>{entry.name}</span>
                    <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.primary, marginLeft: "auto" }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {serviceData.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>Events by AWS Service</div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={serviceData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fill: colors.text.secondary, fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ background: colors.bg.overlay, border: `1px solid ${colors.bg.border}`, borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="count" fill={colors.accent.blue} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={s.feedCard}>
        <div style={{ ...s.cardTitle, display: "flex", alignItems: "center", gap: 8 }}>
          Live Event Feed
          {isProcessing && <RefreshCw size={12} color={colors.accent.blue} style={{ animation: "spin 1s linear infinite" }} />}
        </div>
        {incidents.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: colors.text.tertiary, fontSize: 12 }}>
            No events yet — fire an event or enable Chaos Monkey
          </div>
        ) : (
          incidents.slice(0, 8).map((inc) => (
            <div key={inc.id} style={s.feedItem(inc.severity)}>
              <div style={s.severityDot(inc.severity)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.feedEvent}>{inc.eventName}</div>
                <div style={s.feedMeta}>{inc.username} → {inc.resource}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  <span style={s.badge(SEVERITY_COLORS[inc.severity] ?? colors.text.tertiary)}>{inc.severity}</span>
                  {inc.mitre && <span style={s.badge(colors.accent.purple)}>{inc.mitre.technique_id}</span>}
                  {inc.pattern_detected && <span style={s.badge(colors.accent.orange)}>PATTERN</span>}
                  {inc.defense_evasion_detected && <span style={s.badge(colors.accent.red)}>DEFENSE EVASION</span>}
                  {inc.resolved && <span style={s.badge(colors.accent.teal)}>RESOLVED</span>}
                </div>
              </div>
              <div style={s.feedTime}>
                {formatDistanceToNow(new Date(inc.timestamp), { addSuffix: true })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
