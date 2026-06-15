"""Seeds LocalStack with demo AWS resources for NovaSec."""

import asyncio
import json

from core.config import get_boto3_client


async def seed_localstack():
    # S3 bucket
    try:
        s3 = get_boto3_client("s3")
        s3.create_bucket(Bucket="novasec-demo-bucket")
        print("✓ created S3 bucket: novasec-demo-bucket")
    except s3.exceptions.BucketAlreadyExists:
        print("→ S3 bucket novasec-demo-bucket already exists, skipping")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print("→ S3 bucket novasec-demo-bucket already exists, skipping")
    except Exception as e:
        print(f"✗ failed S3 bucket: {e}")

    # IAM user
    try:
        iam = get_boto3_client("iam")
        iam.create_user(UserName="dev-temp")
        print("✓ created IAM user: dev-temp")
        key = iam.create_access_key(UserName="dev-temp")
        print(f"✓ created access key for dev-temp: {key['AccessKey']['AccessKeyId']}")
    except iam.exceptions.EntityAlreadyExistsException:
        print("→ IAM user dev-temp already exists, skipping")
    except Exception as e:
        print(f"✗ failed IAM user: {e}")

    # EventBridge rule
    try:
        events = get_boto3_client("events")
        events.put_rule(
            Name="novasec-catch-all",
            EventPattern=json.dumps({
                "source": ["aws.s3", "aws.iam", "aws.ec2", "aws.cloudtrail"]
            }),
            State="ENABLED",
        )
        print("✓ created EventBridge rule: novasec-catch-all")
        events.put_targets(
            Rule="novasec-catch-all",
            Targets=[{
                "Id": "novasec-backend",
                "Arn": "arn:aws:events:us-east-1:000000000000:event-bus/default",
                "HttpParameters": {
                    "HeaderParameters": {},
                    "QueryStringParameters": {},
                    "PathParameterValues": [],
                },
            }],
        )
        print("✓ added EventBridge target: novasec-backend")
    except Exception as e:
        print(f"✗ failed EventBridge: {e}")

    # CloudTrail
    try:
        ct = get_boto3_client("cloudtrail")
        ct.create_trail(
            Name="novasec-trail",
            S3BucketName="novasec-demo-bucket",
        )
        ct.start_logging(Name="novasec-trail")
        print("✓ created CloudTrail trail: novasec-trail")
    except ct.exceptions.TrailAlreadyExistsException:
        print("→ CloudTrail trail novasec-trail already exists, skipping")
    except Exception as e:
        print(f"✗ failed CloudTrail: {e}")


if __name__ == "__main__":
    asyncio.run(seed_localstack())
