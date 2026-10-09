import type { CopyRecord } from "./types.js";

export type CopyFill = { coin: string; time: number; px: string; sz: string; fee: string; closedPnl: string };
export type CopyFunding = { time: number; delta: { coin: string; usdc: string } };

export function accumulate(
  copy: CopyRecord,
  fills: CopyFill[],
  fundings: CopyFunding[],
  symbols: Set<string>,
  nowMs: number,
): CopyRecord {
  const lower = Math.max(copy.startMs, copy.countedThroughMs);
  const upper = copy.stopMs ?? nowMs;
  const inWindow = (time: number, coin: string) => symbols.has(coin) && time > lower && time <= upper;
  const next = { ...copy };
  for (const fill of fills) {
    if (!inWindow(fill.time, fill.coin)) continue;
    const pnl = Number(fill.closedPnl);
    const fee = Number(fill.fee);
    next.netPnlUsd += pnl - fee;
    next.feesUsd += fee;
    next.volumeUsd += Number(fill.px) * Number(fill.sz);
    if (pnl !== 0) {
      next.closedTrades += 1;
      if (pnl > 0) next.wins += 1;
    }
  }
  for (const funding of fundings) {
    if (!inWindow(funding.time, funding.delta.coin)) continue;
    const usdc = Number(funding.delta.usdc);
    next.netPnlUsd += usdc;
    next.fundingUsd += usdc;
  }
  next.countedThroughMs = Math.max(copy.countedThroughMs, Math.min(nowMs, upper));
  return next;
}
