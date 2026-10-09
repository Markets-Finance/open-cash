import { median } from "../analysis/stats.js";
import { minQualifyingFollowers, type CopyRecord, type StrategyScore } from "./types.js";

export function roiPct(copy: CopyRecord): number | null {
  return copy.declaredMarginUsd > 0 ? (copy.netPnlUsd / copy.declaredMarginUsd) * 100 : null;
}

export function scoreStrategy(strategyId: string, copies: CopyRecord[]): StrategyScore {
  const mine = copies.filter((c) => c.strategyId === strategyId);
  const followers = mine.filter((c) => !c.isAuthor);
  const qualifying = followers.filter((c) => c.closedTrades > 0);
  const rois = qualifying.map(roiPct).filter((r): r is number => r !== null);
  const author = mine.find((c) => c.isAuthor);
  const trades = qualifying.reduce((sum, c) => sum + c.closedTrades, 0);
  const wins = qualifying.reduce((sum, c) => sum + c.wins, 0);
  return {
    strategyId,
    followers: followers.length,
    activeFollowers: followers.filter((c) => c.stopMs === null).length,
    qualifyingFollowers: qualifying.length,
    medianRoiPct: rois.length >= minQualifyingFollowers ? median(rois) : null,
    totalFollowerPnlUsd: followers.reduce((sum, c) => sum + c.netPnlUsd, 0),
    winRate: trades > 0 ? wins / trades : null,
    authorRoiPct: author && author.closedTrades > 0 ? roiPct(author) : null,
    ranked: rois.length >= minQualifyingFollowers,
  };
}

export function rankStrategies(strategyIds: string[], copies: CopyRecord[]): StrategyScore[] {
  return strategyIds
    .map((id) => scoreStrategy(id, copies))
    .sort((a, b) => {
      if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
      if (a.ranked && b.ranked) return (b.medianRoiPct ?? 0) - (a.medianRoiPct ?? 0);
      return b.followers - a.followers;
    });
}
