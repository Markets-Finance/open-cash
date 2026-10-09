import type { HlNetwork } from "shared";

export type LeaderSort = "pnl" | "roi" | "volume";
export type LeaderWindow = "day" | "week" | "month" | "allTime";

type Row = {
  ethAddress: string;
  accountValue: string;
  displayName: string | null;
  windowPerformances: [LeaderWindow, { pnl: string; roi: string; vlm: string }][];
};

const ttlMs = 10 * 60_000;
const cache = new Map<HlNetwork, { at: number; rows: Row[] }>();

export function parseSort(value: unknown): LeaderSort {
  return value === "roi" || value === "volume" ? value : "pnl";
}

export function parseWindow(value: unknown): LeaderWindow {
  return value === "day" || value === "week" || value === "allTime" ? value : "month";
}

async function load(net: HlNetwork): Promise<Row[]> {
  const hit = cache.get(net);
  if (hit && Date.now() - hit.at < ttlMs) return hit.rows;
  const url = `https://stats-data.hyperliquid.xyz/${net === "mainnet" ? "Mainnet" : "Testnet"}/leaderboard`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
  const rows = ((await response.json()) as { leaderboardRows: Row[] }).leaderboardRows;
  cache.set(net, { at: Date.now(), rows });
  return rows;
}

export async function leaderboardView(net: HlNetwork, sort: LeaderSort, window: LeaderWindow, limit: number, minEquityUsd: number) {
  const rows = await load(net);
  const scored = rows
    .filter((row) => Number(row.accountValue) >= minEquityUsd)
    .map((row) => {
      const perf = Object.fromEntries(row.windowPerformances)[window];
      return {
        address: row.ethAddress,
        displayName: row.displayName,
        equityUsd: Number(row.accountValue),
        pnlUsd: Number(perf?.pnl ?? 0),
        roiPct: Number(perf?.roi ?? 0) * 100,
        volumeUsd: Number(perf?.vlm ?? 0),
      };
    });
  const key = sort === "pnl" ? "pnlUsd" : sort === "roi" ? "roiPct" : "volumeUsd";
  scored.sort((a, b) => b[key] - a[key]);
  return {
    network: net,
    at: Date.now(),
    window,
    sort,
    ranked: scored.length,
    rows: scored.slice(0, limit).map((row, index) => ({ rank: index + 1, ...row })),
  };
}
