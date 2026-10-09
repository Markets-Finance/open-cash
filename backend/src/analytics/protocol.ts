import { createHlInfo, type HlNetwork } from "shared";

const ttlMs = 30_000;
const dexes = ["", "xyz"];
const cache = new Map<HlNetwork, { at: number; value: Awaited<ReturnType<typeof build>> }>();

export type MarketRow = {
  symbol: string;
  dex: string;
  mark: number;
  changePct: number;
  volume24hUsd: number;
  openInterestUsd: number;
  fundingAprPct: number;
  impactSpreadBps: number | null;
  maxLeverage: number;
  shareVolume: number;
};

async function build(net: HlNetwork) {
  const info = createHlInfo(net);
  const rows: MarketRow[] = [];
  for (const dex of dexes) {
    const [meta, ctxs] = await info.metaAndAssetCtxs(dex ? { dex } : undefined);
    meta.universe.forEach((u, i) => {
      const c = ctxs[i];
      if (!c || u.isDelisted) return;
      const mark = Number(c.markPx);
      const impact = c.impactPxs ? c.impactPxs.map(Number) : null;
      rows.push({
        symbol: u.name,
        dex,
        mark,
        changePct: Number(c.prevDayPx) > 0 ? ((mark - Number(c.prevDayPx)) / Number(c.prevDayPx)) * 100 : 0,
        volume24hUsd: Number(c.dayNtlVlm),
        openInterestUsd: Number(c.openInterest) * mark,
        fundingAprPct: Number(c.funding) * 24 * 365 * 100,
        impactSpreadBps: impact && impact.length === 2 && mark > 0 ? ((impact[1] - impact[0]) / mark) * 1e4 : null,
        maxLeverage: u.maxLeverage,
        shareVolume: 0,
      });
    });
  }
  const total = rows.reduce((sum, row) => sum + row.volume24hUsd, 0);
  for (const row of rows) row.shareVolume = total > 0 ? row.volume24hUsd / total : 0;
  rows.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  return {
    network: net,
    at: Date.now(),
    headline: {
      markets: rows.length,
      volume24hUsd: total,
      openInterestUsd: rows.reduce((sum, row) => sum + row.openInterestUsd, 0),
      hip3Volume24hUsd: rows.filter((row) => row.dex).reduce((sum, row) => sum + row.volume24hUsd, 0),
    },
    markets: rows,
  };
}

export async function protocolView(net: HlNetwork) {
  const hit = cache.get(net);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await build(net);
  cache.set(net, { at: Date.now(), value });
  return value;
}
