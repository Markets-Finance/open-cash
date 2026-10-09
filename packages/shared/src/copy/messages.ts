export function publishMessage(digest: string, issuedAt: number): string {
  return `Publish this strategy on OpenCash.\nDigest: ${digest}\nIssued: ${new Date(issuedAt).toISOString()}`;
}

export function followMessage(strategyId: string, marginUsd: number, issuedAt: number): string {
  return `Follow strategy ${strategyId} on OpenCash with ${marginUsd} USD margin.\nIssued: ${new Date(issuedAt).toISOString()}`;
}

export function unfollowMessage(strategyId: string, issuedAt: number): string {
  return `Stop following strategy ${strategyId} on OpenCash.\nIssued: ${new Date(issuedAt).toISOString()}`;
}
