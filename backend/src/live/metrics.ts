import { createHlInfo, getAccount, type HlNetwork } from "shared";
import type { ServerLiveBot } from "./store.js";

export type LiveMetrics = {
  fills: number;
  volumeUsd: number;
  feesUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  netUsd: number;
  returnPct: number;
  positionSize: number;
  entryPx: number | null;
};

function dexOf(symbol: string): string {
  return symbol.includes(":") ? symbol.split(":")[0]! : "";
}

export async function metricsFor(owner: string, net: HlNetwork, bots: ServerLiveBot[]): Promise<Map<string, LiveMetrics>> {
  const result = new Map<string, LiveMetrics>();
  const started = bots.filter((b) => b.startedAt !== null);
  if (started.length === 0) return result;
  const info = createHlInfo(net);
  const user = owner as `0x${string}`;
  const since = Math.min(...started.map((b) => b.startedAt!));
  const dexes = [...new Set(started.map((b) => dexOf(b.symbol)))];
  const [fills, accounts] = await Promise.all([info.userFillsByTime({ user, startTime: since }), Promise.all(dexes.map((dex) => getAccount(info, user, dex)))]);
  const positions = accounts.flatMap((a) => a.positions);
  for (const bot of started) {
    const own = fills.filter((f) => f.coin === bot.symbol && f.time >= bot.startedAt!);
    const feesUsd = own.reduce((sum, f) => sum + Number(f.fee), 0);
    const realizedUsd = own.reduce((sum, f) => sum + Number(f.closedPnl), 0) - feesUsd;
    const held = positions.find((p) => p.coin === bot.symbol);
    const unrealizedUsd = held?.unrealizedPnl ?? 0;
    const netUsd = realizedUsd + unrealizedUsd;
    result.set(bot.id, {
      fills: own.length,
      volumeUsd: own.reduce((sum, f) => sum + Number(f.px) * Number(f.sz), 0),
      feesUsd,
      realizedUsd,
      unrealizedUsd,
      netUsd,
      returnPct: (netUsd / bot.allocationUsd) * 100,
      positionSize: held?.size ?? 0,
      entryPx: held ? held.entryPx : null,
    });
  }
  return result;
}
