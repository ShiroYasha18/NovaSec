"""NovaSec configuration and boto3 client factory."""

import os
import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()


class Settings:
    USE_LOCALSTACK: bool = os.getenv("USE_LOCALSTACK", "true").lower() == "true"
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    AWS_DEFAULT_REGION: str = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    LOCALSTACK_ENDPOINT: str = os.getenv("LOCALSTACK_ENDPOINT", "http://localhost:4566")


settings = Settings()


_fast_config = Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 1})


def get_boto3_client(service_name: str):
    if settings.USE_LOCALSTACK:
        return boto3.client(
            service_name,
            endpoint_url=settings.LOCALSTACK_ENDPOINT,
            region_name="us-east-1",
            aws_access_key_id="test",
            aws_secret_access_key="test",
            config=_fast_config,
        )
    return boto3.client(service_name, region_name=settings.AWS_DEFAULT_REGION)
