import type { HlPosition } from "../hl/positions.js";
import type { BinDirection } from "./types.js";

export type BinRecord = {
  id: string;
  binId: string;
  name: string;
  openedAt: number;
  legs: { symbol: string; direction: BinDirection; size: number }[];
};

export type BinGroup = { record: BinRecord; legs: HlPosition[] };

function share(position: HlPosition, size: number): HlPosition {
  const total = Math.abs(position.size);
  const part = total > 0 ? size / total : 0;
  return {
    ...position,
    size: Math.sign(position.size) * size,
    positionValue: position.positionValue * part,
    marginUsed: position.marginUsed * part,
    unrealizedPnl: position.unrealizedPnl * part,
  };
}

export function groupByBins(positions: HlPosition[], records: BinRecord[]): { groups: BinGroup[]; loose: HlPosition[]; stale: string[] } {
  const remaining = new Map(positions.map((p) => [p.coin, { ...p }]));
  const groups: BinGroup[] = [];
  const stale: string[] = [];
  for (const record of [...records].sort((a, b) => a.openedAt - b.openedAt)) {
    const legs: HlPosition[] = [];
    for (const leg of record.legs) {
      const position = remaining.get(leg.symbol);
      if (!position || (position.size > 0) !== (leg.direction === "long")) continue;
      const take = Math.min(Math.abs(position.size), leg.size);
      if (!(take > 0)) continue;
      legs.push(share(position, take));
      const left = Math.abs(position.size) - take;
      if (left <= Math.abs(position.size) * 1e-9) remaining.delete(leg.symbol);
      else remaining.set(leg.symbol, share(position, left));
    }
    if (legs.length === 0) stale.push(record.id);
    else groups.push({ record, legs });
  }
  return { groups, loose: [...remaining.values()], stale };
}
