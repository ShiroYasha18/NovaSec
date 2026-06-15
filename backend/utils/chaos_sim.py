#!/usr/bin/env python3
"""
NovaSec Chaos Simulation — Intelligence-Driven
10 hours of AWS incidents compressed into ~5 minutes.
13 users. All 4 monitored services.

The simulation fires events and lets NovaSec's own analysis
decide whether each incident warrants an automated fix.
No responses are hardcoded — every decision is driven by
severity, pattern detection, blast radius, and MITRE tactic.

Run: python backend/utils/chaos_sim.py
"""

import json
import os
import sys
import time
import httpx

BASE        = os.getenv("NOVASEC_URL", "http://localhost:8001")
LEDGER_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ledger_store.json")
SIM_START   = time.time()

# ── ANSI ─────────────────────────────────────────────────────────────────────
R   = "\033[0m";  B   = "\033[1m";  DIM = "\033[2m"
RED = "\033[91m"; YEL = "\033[93m"; GRN = "\033[92m"
CYN = "\033[96m"; MAG = "\033[95m"; BLU = "\033[94m"; WHT = "\033[97m"

USER_COLORS = {
    "malicious-mike":  RED,  "dev-temp":        YEL,
    "contractor-bob":  MAG,  "sysadmin-sarah":  BLU,
    "intern-charlie":  CYN,  "admin-alice":     GRN,
    "vendor-victor":   MAG,  "data-eng-dave":   CYN,
    "ops-olivia":      BLU,  "security-sam":    RED,
    "ci-pipeline":     WHT,  "root-account":    RED,
    "finance-frank":   YEL,
}

SEV_COLOR = {
    "CRITICAL": RED + B, "HIGH": RED,
    "MEDIUM":   YEL,     "LOW":  GRN,
}

SVC_LABEL = {
    "aws.s3":         "S3",
    "aws.iam":        "IAM",
    "aws.ec2":        "EC2",
    "aws.cloudtrail": "CloudTrail",
}

# ── DECISION LOGIC ────────────────────────────────────────────────────────────

def decide(ing: dict) -> tuple[str | None, str]:
    """
    Read NovaSec's own analysis and return (voice_transcript, reason).
    None = no response needed (event was filtered / non-threat).
    """
    inc = ing.get("incident") or {}
    tc  = ing.get("threat_context") or {}
    br  = ing.get("blast_radius") or {}

    if not inc.get("is_threat"):
        return None, "not a threat — no action"

    sev        = inc.get("severity", "LOW")
    defense_ev = inc.get("defense_evasion_detected", False)
    pattern    = tc.get("pattern_detected", False)
    user_count = tc.get("user_incident_count", 0)
    blast      = br.get("blast_radius_level", "LOW")

    # Defense evasion: always fix immediately — attacker is blinding audit trail
    if defense_ev:
        return "yes", f"DEFENSE EVASION ({inc.get('mitre',{}).get('technique_id','')}) → auto-fix"

    # CRITICAL: fix without question
    if sev == "CRITICAL":
        return "yes", f"CRITICAL severity → auto-fix"

    # HIGH + pattern (repeat offender): clearly malicious, fix it
    if sev == "HIGH" and pattern:
        return "yes", f"HIGH + repeat offender ({user_count} incidents) → auto-fix"

    # HIGH + critical blast radius: too much exposure to leave
    if sev == "HIGH" and blast in ("CRITICAL", "HIGH"):
        return "yes", f"HIGH severity + {blast} blast radius → auto-fix"

    # HIGH alone: ask for more context before acting
    if sev == "HIGH":
        return "tell me more about the blast radius", f"HIGH severity → requesting context first"

    # MEDIUM + repeat offender: pattern elevates priority
    if sev == "MEDIUM" and pattern:
        return "yes", f"MEDIUM + pattern detected ({user_count} incidents) → approve"

    # MEDIUM or LOW: log it, flag for manual review, don't auto-fix
    return "no", f"{sev} severity, blast={blast} → flag for manual review, deny auto-fix"


def followup_decide(sev: str, blast: str) -> tuple[str, str]:
    """After a MORE_INFO response, make the final call."""
    if sev in ("CRITICAL", "HIGH") or blast in ("CRITICAL", "HIGH"):
        return "yes apply the fix", "context confirmed high risk → approve"
    return "no leave it", "context shows manageable risk → deny"


# ── TIMELINE (events only — no hardcoded responses) ──────────────────────────

TIMELINE = [
    {
        "sim_hour": 0.17, "user": "malicious-mike",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "prod-data-lake",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "Production data lake made public",
    },
    {
        "sim_hour": 0.50, "user": "contractor-bob",
        "source": "aws.iam", "name": "CreateAccessKey",
        "params": {"userName": "contractor-bob"},
        "label": "Contractor creates access key",
    },
    {
        "sim_hour": 1.25, "user": "intern-charlie",
        "source": "aws.ec2", "name": "AuthorizeSecurityGroupIngress",
        "params": {"groupId": "sg-intern-dev-01",
                   "IpPermissions": [{"IpProtocol": "-1",
                                       "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]},
        "label": "Intern opens ALL traffic on dev security group",
    },
    {
        "sim_hour": 1.83, "user": "dev-temp",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "novasec-demo-bucket",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "dev-temp exposes analytics bucket  [incident #1]",
    },
    {
        "sim_hour": 2.33, "user": "sysadmin-sarah",
        "source": "aws.cloudtrail", "name": "StopLogging",
        "params": {"name": "prod-audit-trail"},
        "label": "CloudTrail DISABLED — audit blind spot opened",
    },
    {
        "sim_hour": 2.92, "user": "vendor-victor",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "customer-uploads-bucket",
                   "AccessControlPolicy": {"CannedACL": "public-read-write"}},
        "label": "Vendor makes customer bucket public-read-write",
    },
    {
        "sim_hour": 3.50, "user": "malicious-mike",
        "source": "aws.iam", "name": "CreateAccessKey",
        "params": {"userName": "malicious-mike"},
        "label": "Mike creates SECOND access key — persistence attempt",
    },
    {
        "sim_hour": 4.00, "user": "dev-temp",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "ml-training-data",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "dev-temp exposes ML training data  [incident #2 — pattern fires]",
    },
    {
        "sim_hour": 4.50, "user": "ops-olivia",
        "source": "aws.ec2", "name": "AuthorizeSecurityGroupIngress",
        "params": {"groupId": "sg-prod-api-gateway",
                   "IpPermissions": [{"IpProtocol": "tcp",
                                       "FromPort": 22, "ToPort": 22,
                                       "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]},
        "label": "Ops opens SSH 0.0.0.0/0 on prod API gateway",
    },
    {
        "sim_hour": 5.00, "user": "finance-frank",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "finance-reports-2026",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "Finance exposes 2026 financial reports bucket",
    },
    {
        "sim_hour": 5.75, "user": "security-sam",
        "source": "aws.cloudtrail", "name": "StopLogging",
        "params": {"name": "novasec-trail"},
        "label": "Security engineer accidentally stops NovaSec trail",
    },
    {
        "sim_hour": 6.25, "user": "admin-alice",
        "source": "aws.iam", "name": "CreateAccessKey",
        "params": {"userName": "deploy-bot"},
        "label": "Admin creates key for deploy bot — no rotation policy",
    },
    {
        "sim_hour": 7.00, "user": "ci-pipeline",
        "source": "aws.iam", "name": "CreateAccessKey",
        "params": {"userName": "ci-pipeline"},
        "label": "CI pipeline self-creates service account key",
    },
    {
        "sim_hour": 8.00, "user": "dev-temp",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "novasec-demo-bucket",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "dev-temp THIRD incident  [memory agent → CRITICAL escalation]",
    },
    {
        "sim_hour": 9.00, "user": "root-account",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "backup-snapshots-prod",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "ROOT ACCOUNT exposes production backup snapshots",
    },
    {
        "sim_hour": 9.67, "user": "data-eng-dave",
        "source": "aws.s3", "name": "PutBucketAcl",
        "params": {"bucketName": "raw-clickstream-data",
                   "AccessControlPolicy": {"CannedACL": "public-read"}},
        "label": "Data engineer exposes raw user clickstream data",
    },
]


# ── HELPERS ──────────────────────────────────────────────────────────────────

def simtime(h: float) -> str:
    hh = int(h); mm = int((h - hh) * 60)
    return f"{hh:02d}:{mm:02d}"

def realtime() -> str:
    e = time.time() - SIM_START
    return f"+{int(e//60):02d}:{int(e%60):02d}"

def build_event(s: dict) -> dict:
    return {
        "source": s["source"],
        "detail-type": "AWS API Call via CloudTrail",
        "detail": {
            "eventSource": s["source"],
            "eventName": s["name"],
            "requestParameters": s["params"],
            "userIdentity": {"userName": s["user"]},
            "eventTime": f"2026-06-15T{simtime(s['sim_hour'])}:00Z",
        },
    }

def wrap(text: str, width: int = 65, indent: str = "    ") -> str:
    words = text.split()
    lines = []; line = ""
    for w in words:
        if len(line) + len(w) + 1 > width:
            lines.append(indent + line.rstrip()); line = w + " "
        else:
            line += w + " "
    if line.strip(): lines.append(indent + line.rstrip())
    return "\n".join(lines)

def banner(text: str, color: str = CYN):
    print(f"\n{color}{B}{'═'*68}{R}")
    print(f"{color}{B}  {text}{R}")
    print(f"{color}{B}{'═'*68}{R}")

def section_line():
    print(f"{DIM}{'─'*68}{R}")


# ── RESULT STORE ─────────────────────────────────────────────────────────────

results: list[dict] = []


# ── SINGLE EVENT RUNNER ───────────────────────────────────────────────────────

def run_event(scenario: dict, idx: int, total: int) -> None:
    user  = scenario["user"]
    uc    = USER_COLORS.get(user, WHT)
    svc   = SVC_LABEL.get(scenario["source"], scenario["source"])
    event = build_event(scenario)

    print(f"\n{DIM}[real {realtime()}  sim {simtime(scenario['sim_hour'])}  {idx}/{total}]{R}")
    print(f"{uc}{B}  {user}{R}  {DIM}→{R}  {B}{svc} / {scenario['name']}{R}")
    print(f"  {DIM}{scenario['label']}{R}")

    t0 = time.time()

    # ── INGEST ────────────────────────────────────────────────────────────────
    try:
        r = httpx.post(f"{BASE}/api/events/ingest", json=event, timeout=120)
        r.raise_for_status()
        ing = r.json()
    except Exception as e:
        print(f"  {RED}✗ ingest error: {e}{R}")
        return

    inc = ing.get("incident") or {}
    tc  = ing.get("threat_context") or {}
    br  = ing.get("blast_radius") or {}

    # ── IF ALREADY RESOLVED (sentinel filtered or non-threat) ────────────────
    if ing.get("resolved") and not inc.get("is_threat"):
        if not inc:
            print(f"  {DIM}✓ Sentinel: event not in monitored scope — ignored{R}")
        else:
            print(f"  {GRN}✓ Analyst: benign activity — no threat{R}")
        results.append({"user": user, "scenario": scenario, "ing": ing,
                         "respond": {}, "voice": None, "reason": "non-threat",
                         "elapsed": time.time() - t0})
        section_line(); return

    if not inc.get("is_threat") and ing.get("commander_brief") is None:
        print(f"  {DIM}✓ Sentinel filtered — not a monitored event type{R}")
        results.append({"user": user, "scenario": scenario, "ing": ing,
                         "respond": {}, "voice": None, "reason": "filtered",
                         "elapsed": time.time() - t0})
        section_line(); return

    # ── DISPLAY ANALYSIS RESULTS ──────────────────────────────────────────────
    sev   = inc.get("severity", "LOW")
    sc    = SEV_COLOR.get(sev, DIM)
    de    = inc.get("defense_evasion_detected", False)
    mitre = inc.get("mitre") or {}

    print(f"\n  {sc}▲ THREAT  {sev}{R}")
    print(f"  {DIM}Title   :{R} {inc.get('title','')}")
    print(f"  {DIM}Risk    :{R} {inc.get('risk','')}")

    if mitre:
        tac_color = RED if mitre.get("tactic") == "Defense Evasion" else YEL
        print(f"  {tac_color}MITRE   : {mitre.get('technique_id','')}  "
              f"{mitre.get('tactic','')} — {mitre.get('technique_name','')}{R}")

    if de:
        print(f"  {RED}{B}  ⚠  DEFENSE EVASION DETECTED — audit trail at risk{R}")

    if tc.get("pattern_detected"):
        cnt = tc.get("user_incident_count", 0)
        prev = tc.get("past_severities", [])
        print(f"  {YEL}Pattern : {user} has {cnt} past incidents  "
              f"(prev severities: {prev}){R}")
        if "ESCALATED BY MEMORY AGENT" in (tc.get("pattern_summary") or ""):
            print(f"  {RED}{B}  ↑  SEVERITY ESCALATED TO CRITICAL BY MEMORY AGENT{R}")

    if br:
        bl = br.get("blast_radius_level", "?")
        bc = SEV_COLOR.get(bl, DIM)
        print(f"  {bc}Blast   : {bl}  — {br.get('events_found',0)} events, "
              f"{len(br.get('resources_touched',[]))} resources touched{R}")
        if br.get("sensitive_actions"):
            print(f"  {RED}Sensitive actions: {', '.join(br['sensitive_actions'])}{R}")

    brief = ing.get("commander_brief") or ""
    if brief:
        print(f"\n  {CYN}{B}Commander brief:{R}")
        print(wrap(brief, indent="    "))

    # ── DECISION ──────────────────────────────────────────────────────────────
    voice, reason = decide(ing)

    print(f"\n  {B}Decision engine:{R} {DIM}{reason}{R}")

    if voice is None:
        results.append({"user": user, "scenario": scenario, "ing": ing,
                         "respond": {}, "voice": None, "reason": reason,
                         "elapsed": time.time() - t0})
        section_line(); return

    print(f"  {B}→ responding:{R}  \"{voice}\"")

    # ── RESPOND ───────────────────────────────────────────────────────────────
    try:
        r2 = httpx.post(f"{BASE}/api/events/respond",
                        json={"voice_transcript": voice}, timeout=120)
        r2.raise_for_status()
        res = r2.json()
    except Exception as e:
        print(f"  {RED}✗ respond error: {e}{R}")
        return

    # ── IF MORE_INFO — show updated brief, then make final call ───────────────
    if not res.get("resolved") and voice not in ("yes", "no"):
        updated_brief = res.get("commander_brief") or brief
        if updated_brief and updated_brief != brief:
            print(f"\n  {CYN}{B}Commander (follow-up):{R}")
            print(wrap(updated_brief[:200], indent="    "))

        final_voice, final_reason = followup_decide(sev, br.get("blast_radius_level", "LOW"))
        print(f"\n  {B}Final decision:{R} {DIM}{final_reason}{R}")
        print(f"  {B}→ responding:{R}  \"{final_voice}\"")

        try:
            r3 = httpx.post(f"{BASE}/api/events/respond",
                            json={"voice_transcript": final_voice}, timeout=120)
            r3.raise_for_status()
            res = r3.json()
            voice = final_voice
        except Exception as e:
            print(f"  {RED}✗ follow-up respond error: {e}{R}")

    # ── OUTCOME ───────────────────────────────────────────────────────────────
    fix = res.get("fix_result") or {}
    elapsed = time.time() - t0

    if fix.get("success"):
        print(f"\n  {GRN}{B}✓ FIX APPLIED  ({elapsed:.0f}s){R}")
    elif voice in ("no", "no leave it"):
        print(f"\n  {YEL}○ Fix denied — flagged for manual review  ({elapsed:.0f}s){R}")
    else:
        # LocalStack may reject the boto3 call — still show the attempt
        print(f"\n  {YEL}○ Fix attempted — result: {fix}  ({elapsed:.0f}s){R}")

    results.append({"user": user, "scenario": scenario, "ing": ing,
                     "respond": res, "voice": voice, "reason": reason,
                     "elapsed": elapsed})
    section_line()


# ── FINAL REPORT ─────────────────────────────────────────────────────────────

def print_report():
    banner("SIMULATION REPORT  —  10-Hour Intelligence Summary", RED)

    threats    = [r for r in results if (r["ing"].get("incident") or {}).get("is_threat")]
    non_threat = [r for r in results if not (r["ing"].get("incident") or {}).get("is_threat")
                  and (r["ing"].get("incident") is not None)]
    filtered   = [r for r in results if r["reason"] == "filtered"]
    auto_fixed = [r for r in results if (r["respond"].get("fix_result") or {}).get("success")]
    denied     = [r for r in results if r["voice"] in ("no", "no leave it")]

    print(f"""
  Total events fired    : {B}{len(results)}{R}
  Genuine threats       : {RED}{B}{len(threats)}{R}
  Non-threats (correct) : {GRN}{len(non_threat)}{R}
  Filtered by Sentinel  : {DIM}{len(filtered)}{R}
  Auto-fixes applied    : {GRN}{B}{len(auto_fixed)}{R}
  Denied / manual review: {YEL}{len(denied)}{R}""")

    # ── Severity breakdown ────────────────────────────────────────────────────
    sev_counts: dict[str, int] = {}
    for r in threats:
        s = (r["ing"].get("incident") or {}).get("severity", "UNKNOWN")
        sev_counts[s] = sev_counts.get(s, 0) + 1

    print(f"\n  {B}Severity breakdown:{R}")
    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"):
        if sev in sev_counts:
            c = sev_counts[sev]
            print(f"    {SEV_COLOR.get(sev,'')}{sev:10}{R}  {'█'*c} {c}")

    # ── Defense evasion ───────────────────────────────────────────────────────
    de_events = [r for r in threats
                 if (r["ing"].get("incident") or {}).get("defense_evasion_detected")]
    if de_events:
        print(f"\n  {RED}{B}Defense Evasion events ({len(de_events)}):{R}")
        for r in de_events:
            inc = r["ing"].get("incident") or {}
            uc  = USER_COLORS.get(r["user"], WHT)
            m   = (inc.get("mitre") or {}).get("technique_id", "")
            print(f"    {uc}{r['user']:<20}{R} {inc.get('title','')}  {YEL}{m}{R}")

    # ── Pattern / memory detection ────────────────────────────────────────────
    pattern_events = [r for r in threats
                      if (r["ing"].get("threat_context") or {}).get("pattern_detected")]
    if pattern_events:
        print(f"\n  {YEL}{B}Pattern detections (repeat offenders):{R}")
        for r in pattern_events:
            tc  = r["ing"].get("threat_context") or {}
            uc  = USER_COLORS.get(r["user"], WHT)
            cnt = tc.get("user_incident_count", 0)
            prev = tc.get("past_severities", [])
            esc = f"  {RED}↑ ESCALATED{R}" if "ESCALATED" in (tc.get("pattern_summary") or "") else ""
            print(f"    {uc}{r['user']:<20}{R}  {cnt} incidents  past={prev}{esc}")

    # ── MITRE techniques ──────────────────────────────────────────────────────
    mitre_seen: dict[str, tuple[str, str]] = {}
    for r in threats:
        m = (r["ing"].get("incident") or {}).get("mitre") or {}
        if m.get("technique_id"):
            mitre_seen[m["technique_id"]] = (m.get("tactic",""), m.get("technique_name",""))
    if mitre_seen:
        print(f"\n  {YEL}{B}MITRE ATT&CK techniques observed:{R}")
        for tid, (tactic, name) in mitre_seen.items():
            tc = RED if tactic == "Defense Evasion" else YEL
            print(f"    {tc}{tid:<14}{R}  {tactic:<20}  {name}")

    # ── Blast radius ──────────────────────────────────────────────────────────
    print(f"\n  {B}Blast radius distribution:{R}")
    br_counts: dict[str, int] = {}
    for r in threats:
        bl = (r["ing"].get("blast_radius") or {}).get("blast_radius_level", "N/A")
        br_counts[bl] = br_counts.get(bl, 0) + 1
    for lvl in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "N/A"):
        if lvl in br_counts:
            c = br_counts[lvl]
            print(f"    {SEV_COLOR.get(lvl,'')}{lvl:10}{R}  {'█'*c} {c}")

    # ── Per-user table ────────────────────────────────────────────────────────
    print(f"\n  {B}{'User':<22}  {'#':>3}  {'Severity':<10}  {'Blast':<10}  Decision{R}")
    print(f"  {'─'*22}  {'─'*3}  {'─'*10}  {'─'*10}  {'─'*20}")
    user_map: dict[str, list] = {}
    for r in threats:
        user_map.setdefault(r["user"], []).append(r)
    for user, evts in sorted(user_map.items(), key=lambda x: -len(x[1])):
        uc   = USER_COLORS.get(user, WHT)
        sev  = (evts[-1]["ing"].get("incident") or {}).get("severity","?")
        blast= (evts[-1]["ing"].get("blast_radius") or {}).get("blast_radius_level","?")
        dec  = evts[-1]["voice"] or "—"
        flag = f"  {RED}⚠ REPEAT{R}" if len(evts) >= 2 else ""
        print(f"  {uc}{user:<22}{R}  {len(evts):>3}  "
              f"{SEV_COLOR.get(sev,'')}{sev:<10}{R}  "
              f"{SEV_COLOR.get(blast,'')}{blast:<10}{R}  {dec}{flag}")

    # ── Timeline ──────────────────────────────────────────────────────────────
    print(f"\n  {B}Event timeline:{R}")
    icons = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢",
             None: "⚪", "filtered": "⚫"}
    for r in results:
        inc  = r["ing"].get("incident") or {}
        sev  = inc.get("severity") if inc.get("is_threat") else None
        icon = icons.get(sev, "⚫") if r["reason"] != "filtered" else "⚫"
        uc   = USER_COLORS.get(r["user"], WHT)
        svc  = SVC_LABEL.get(r["scenario"]["source"], "?")
        dec  = f"→ {r['voice']}" if r["voice"] else f"{DIM}no action{R}"
        print(f"  {icon}  {simtime(r['scenario']['sim_hour'])}  "
              f"{uc}{r['user']:<20}{R}  {svc:<12}  "
              f"{SEV_COLOR.get(sev,'')}{(sev or '—'):<10}{R}  {dec}")

    elapsed = time.time() - SIM_START
    print(f"\n  Wall time : {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print(f"  Sim time  : 10 hours across 13 users\n")
    banner("SIMULATION COMPLETE", GRN)


# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    banner("NovaSec Chaos Simulation  —  Intelligence-Driven", CYN)
    print(f"""
  {DIM}Events are fired automatically.
  NovaSec's own analysis (severity, blast radius, pattern,
  MITRE tactic) drives every approve/deny decision.
  No responses are hardcoded.{R}

  {YEL}Ctrl+C at any time to see partial results.{R}
""")

    # Check backend
    try:
        httpx.get(f"{BASE}/", timeout=5).raise_for_status()
        print(f"  {GRN}✓ Backend online{R}\n")
    except Exception as e:
        print(f"  {RED}✗ Backend not reachable: {e}{R}")
        print(f"  Start with: docker compose up\n")
        sys.exit(1)

    # Clear ledger for clean state
    os.makedirs(os.path.dirname(LEDGER_PATH), exist_ok=True)
    with open(LEDGER_PATH, "w") as f:
        json.dump([], f)
    print(f"  {DIM}Ledger cleared — starting fresh.{R}\n")
    section_line()

    try:
        for idx, scenario in enumerate(TIMELINE, 1):
            run_event(scenario, idx, len(TIMELINE))
    except KeyboardInterrupt:
        print(f"\n\n  {YEL}Interrupted — printing partial results…{R}")

    print_report()


if __name__ == "__main__":
    main()
