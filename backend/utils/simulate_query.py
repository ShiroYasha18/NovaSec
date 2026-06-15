"""Standalone script to test the NovaSec natural language query and what-if endpoints."""

import json
import httpx

BASE_URL = "http://localhost:8000"


def main():
    print("\n→ Querying Commander about dev-temp activity...\n")
    r = httpx.post(
        f"{BASE_URL}/api/query",
        json={"question": "Should I be worried about dev-temp based on recent activity?"},
        timeout=30,
    )
    data = r.json()
    print(f"Commander: {data['answer']}\n")

    print("→ Running what-if analysis for dev-temp...\n")
    r2 = httpx.post(f"{BASE_URL}/api/whatif", json={"username": "dev-temp"}, timeout=30)
    whatif = r2.json()
    print(f"WHAT-IF ANALYSIS: dev-temp")
    print(f"Blast radius: {whatif.get('blast_radius')}")
    print(f"Worst case: {whatif.get('worst_case')}")
    print(f"At risk: {whatif.get('at_risk_resources')}")
    print(f"Recommendation: {whatif.get('top_recommendation')}")


if __name__ == "__main__":
    main()
