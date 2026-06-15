"""Standalone script to simulate AWS security events against the NovaSec backend."""

import sys
import json
import httpx

BASE_URL = "http://localhost:8000"

SCENARIOS = {
    "s3": {
        "source": "aws.s3",
        "detail-type": "AWS API Call via CloudTrail",
        "detail": {
            "eventSource": "aws.s3",
            "eventName": "PutBucketAcl",
            "requestParameters": {
                "bucketName": "novasec-demo-bucket",
                "AccessControlPolicy": {"CannedACL": "public-read"},
            },
            "userIdentity": {"userName": "dev-temp"},
            "eventTime": "2026-06-15T14:32:00Z",
        },
    },
    "iam": {
        "source": "aws.iam",
        "detail-type": "AWS API Call via CloudTrail",
        "detail": {
            "eventSource": "aws.iam",
            "eventName": "CreateAccessKey",
            "requestParameters": {"userName": "dev-temp"},
            "userIdentity": {"userName": "admin-user"},
            "eventTime": "2026-06-15T14:33:00Z",
        },
    },
    "cloudtrail": {
        "source": "aws.cloudtrail",
        "detail-type": "AWS API Call via CloudTrail",
        "detail": {
            "eventSource": "aws.cloudtrail",
            "eventName": "StopLogging",
            "requestParameters": {"name": "novasec-trail"},
            "userIdentity": {"userName": "unknown-user"},
            "eventTime": "2026-06-15T14:34:00Z",
        },
    },
}


def main():
    scenario = sys.argv[1] if len(sys.argv) > 1 else "s3"
    event = SCENARIOS.get(scenario)
    if not event:
        print(f"Unknown scenario '{scenario}'. Choose from: {', '.join(SCENARIOS)}")
        sys.exit(1)

    print(f"\n→ Sending '{scenario}' event to {BASE_URL}/api/events/ingest ...\n")
    r = httpx.post(f"{BASE_URL}/api/events/ingest", json=event, timeout=60)
    print(json.dumps(r.json(), indent=2))

    user_input = input("\nEnter your response (or press enter to approve): ").strip()
    if not user_input:
        user_input = "yes"

    print(f"\n→ Sending response: '{user_input}' ...\n")
    r2 = httpx.post(
        f"{BASE_URL}/api/events/respond",
        json={"voice_transcript": user_input},
        timeout=60,
    )
    print(json.dumps(r2.json(), indent=2))


if __name__ == "__main__":
    main()
