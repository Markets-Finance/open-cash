import { backendUrl } from "./config";

export type Network = "mainnet" | "testnet";

export type Protocol = {
  headline: { markets: number; volume24hUsd: number; openInterestUsd: number; hip3Volume24hUsd: number };
  markets: { symbol: string; dex: string; mark: number; changePct: number; volume24hUsd: number; openInterestUsd: number; fundingAprPct: number; shareVolume: number }[];
};

export type LeaderRow = { rank: number; address: string; displayName: string | null; equityUsd: number; pnlUsd: number; roiPct: number; volumeUsd: number };
export type Leaderboard = { rows: LeaderRow[] };

export type WalletView = {
  found: boolean;
  address: string;
  perpEquityUsd: number;
  withdrawableUsd: number;
  unrealizedPnlUsd: number;
  positions: { coin: string; size: number; entryPx: number; markPx: number; positionValue: number; leverage: number; unrealizedPnl: number; liquidationDistancePct: number | null }[];
  recentFills: { count: number; realizedPnlUsd: number; feesUsd: number; winRatePct: number; liquidations: number; makerSharePct: number };
};

export type Insights = {
  protocol: Protocol | null;
  leaderboard: Leaderboard | null;
  errors: string[];
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export const loadWallet = (network: Network, address: string) => get<WalletView>(`/analytics/wallet?network=${network}&address=${address}`);

export async function loadInsights(network: Network): Promise<Insights> {
  const [protocol, leaderboard] = await Promise.allSettled([
    get<Protocol>(`/analytics/protocol?network=${network}`),
    get<Leaderboard>(`/analytics/leaderboard?network=${network}&sort=pnl&window=week&limit=10&minEquity=1000`),
  ]);
  const value = <T,>(result: PromiseSettledResult<T>) => (result.status === "fulfilled" ? result.value : null);
  const errors = [protocol, leaderboard].flatMap((result) => (result.status === "rejected" ? [String(result.reason?.message ?? result.reason)] : []));
  return { protocol: value(protocol), leaderboard: value(leaderboard), errors };
}
