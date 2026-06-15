const SCENARIOS = ["s3", "iam", "cloudtrail", "ec2", "s3", "iam"];

export function startChaosMonkey(onEvent: (scenario: string) => void): () => void {
  let index = 0;
  const interval = setInterval(() => {
    onEvent(SCENARIOS[index % SCENARIOS.length]);
    index++;
  }, 6000);
  return () => clearInterval(interval);
}
