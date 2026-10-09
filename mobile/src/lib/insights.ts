import { backendUrl } from "./config";

export type Network = "mainnet" | "testnet";

export type Protocol = {
  headline: { volume24h: number; volume7d: number; openInterest: number; tvl: number; accounts: number | null; activeAccounts: number };
  window: { depositsUsd: number; withdrawalsUsd: number; trades: number };
};

export type Liquidations = {
  count: number;
  lossUsd: number;
  hours: { t: number; count: number }[];
  recent: { t: number; symbol: string; accountId: number; address: string | null; lossUsd: number }[];
};

export type HeldRow = {
  symbol: string;
  side: "long" | "short";
  notionalUsd: number;
  leverage: number | null;
  unrealizedPnlUsd: number;
  liquidationDistancePct: number | null;
  accountId: number;
  address: string | null;
};

export type Positions = { scanned: number; openPositions: number; openNotionalUsd: number; largest: HeldRow[]; nearest: HeldRow[] };

export type WalletRow = { rank: number; accountId: number; address: string | null; netPnlUsd: number; winRate: number; closedTrades: number; tier: string };

export type Wallets = { rows: WalletRow[]; indexedHours: number; backfilling: boolean };

export type Insights = {
  protocol: Protocol | null;
  liquidations: Liquidations | null;
  positions: Positions | null;
  wallets: Wallets | null;
  errors: string[];
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export async function loadInsights(network: Network): Promise<Insights> {
  const [protocol, liquidations, positions, wallets] = await Promise.allSettled([
    get<Protocol>(`/analytics/protocol?network=${network}`),
    get<Liquidations>(`/analytics/liquidations?network=${network}`),
    get<Positions>(`/analytics/positions?network=${network}`),
    get<Wallets>(`/analytics/leaderboard?network=${network}&sort=pnl&limit=5`),
  ]);
  const value = <T,>(result: PromiseSettledResult<T>) => (result.status === "fulfilled" ? result.value : null);
  const errors = [protocol, liquidations, positions, wallets].flatMap((result) => (result.status === "rejected" ? [String(result.reason?.message ?? result.reason)] : []));
  return { protocol: value(protocol), liquidations: value(liquidations), positions: value(positions), wallets: value(wallets), errors };
}
