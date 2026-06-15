const USERS = [
  "dev-temp", "admin-user", "ops-user", "unknown-user",
  "malicious-mike", "contractor-01", "svc-account-prod",
  "intern-john", "root-backdoor", "ci-bot-staging",
  "pentest-external", "alice-devops", "bob-infra",
];

const EVENTS: Array<() => object> = [
  () => ({
    source: "aws.s3",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.s3",
      eventName: "PutBucketAcl",
      requestParameters: { bucketName: `bucket-${randId()}`, AccessControlPolicy: { CannedACL: "public-read" } },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.s3",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.s3",
      eventName: "DeleteBucketPolicy",
      requestParameters: { bucketName: `bucket-${randId()}` },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.iam",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.iam",
      eventName: "CreateAccessKey",
      requestParameters: { userName: pick(USERS) },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.iam",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.iam",
      eventName: "AttachUserPolicy",
      requestParameters: { userName: pick(USERS), policyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.iam",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.iam",
      eventName: "CreateUser",
      requestParameters: { userName: `shadow-${randId()}` },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.cloudtrail",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.cloudtrail",
      eventName: "StopLogging",
      requestParameters: { name: "main-trail" },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.cloudtrail",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.cloudtrail",
      eventName: "DeleteTrail",
      requestParameters: { name: `trail-${randId()}` },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.ec2",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.ec2",
      eventName: "AuthorizeSecurityGroupIngress",
      requestParameters: {
        groupId: `sg-${randId()}`,
        IpPermissions: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }],
      },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.ec2",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.ec2",
      eventName: "RunInstances",
      requestParameters: { instanceType: "t3.xlarge", imageId: "ami-unknown-001" },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.secretsmanager",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.secretsmanager",
      eventName: "GetSecretValue",
      requestParameters: { secretId: "prod/db/password" },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
  () => ({
    source: "aws.sts",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "aws.sts",
      eventName: "AssumeRole",
      requestParameters: { roleArn: "arn:aws:iam::123456789:role/AdminRole" },
      userIdentity: { userName: pick(USERS) },
      eventTime: new Date().toISOString(),
    },
  }),
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randId(): string {
  return Math.random().toString(36).slice(2, 7);
}

export function buildRandomEvent(): object {
  return pick(EVENTS)();
}

export function startChaosMonkey(onEvent: (payload: object) => void): () => void {
  const interval = setInterval(() => {
    onEvent(buildRandomEvent());
  }, 20000);
  return () => clearInterval(interval);
}
