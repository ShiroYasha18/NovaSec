"""MITRE ATT&CK lookup table for known AWS event names."""

MITRE_MAP = {
    "PutBucketAcl": {
        "technique_id": "T1530",
        "technique_name": "Data from Cloud Storage",
        "tactic": "Collection",
        "description": "Adversaries access data in cloud storage. Making a bucket public is a known pre-exfiltration step.",
        "recommendation": "Check S3 server access logs for GetObject calls in the last 24 hours even after reverting ACL.",
    },
    "CreateAccessKey": {
        "technique_id": "T1098.001",
        "technique_name": "Account Manipulation: Additional Cloud Credentials",
        "tactic": "Persistence",
        "description": "Adversaries add credentials to maintain persistent access even if the original vector is closed.",
        "recommendation": "Audit all active access keys. Check for new IAM users or role assignments created in the same session.",
    },
    "AuthorizeSecurityGroupIngress": {
        "technique_id": "T1562.007",
        "technique_name": "Impair Defenses: Disable or Modify Cloud Firewall",
        "tactic": "Defense Evasion",
        "description": "Adversaries modify cloud firewalls to enable access to compromised resources or exfiltrate data.",
        "recommendation": "Review all inbound rules on this security group. Check for unusual outbound connections from affected EC2 instances.",
    },
    "StopLogging": {
        "technique_id": "T1562.001",
        "technique_name": "Impair Defenses: Disable or Modify Tools",
        "tactic": "Defense Evasion",
        "description": "Disabling CloudTrail is a known pre-exfiltration technique. Attackers blind your audit trail before moving data.",
        "recommendation": "Assume activity occurred during the logging gap. Check S3 server access logs and VPC flow logs for the blackout period.",
    },
}


def get_mitre_context(event_name: str) -> dict | None:
    return MITRE_MAP.get(event_name)
