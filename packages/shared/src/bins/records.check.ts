import assert from "node:assert/strict";
import type { HlPosition } from "../hl/positions.js";
import { groupByBins, type BinRecord } from "./records.js";

const pos = (coin: string, size: number, margin: number, pnl: number): HlPosition => ({ dex: "xyz", coin, size, entryPx: 100, positionValue: Math.abs(size) * 100, leverage: 3, leverageType: "isolated", unrealizedPnl: pnl, marginUsed: margin, liquidationPx: null });
const record = (id: string, openedAt: number, legs: BinRecord["legs"]): BinRecord => ({ id, binId: "us-large-cap", name: "US large cap", openedAt, legs });

const a = groupByBins([pos("xyz:SP500", 0.002, 5, 1), pos("xyz:XYZ100", 0.001, 4, -1)], [record("r1", 1, [{ symbol: "xyz:SP500", direction: "long", size: 0.002 }, { symbol: "xyz:XYZ100", direction: "long", size: 0.001 }])]);
assert.equal(a.groups.length, 1);
assert.equal(a.groups[0].legs.length, 2, "both legs inside one bin");
assert.equal(a.loose.length, 0);

const b = groupByBins([pos("xyz:SP500", 0.004, 10, 2)], [record("r1", 1, [{ symbol: "xyz:SP500", direction: "long", size: 0.002 }])]);
assert.equal(b.groups[0].legs[0].size, 0.002);
assert.equal(b.groups[0].legs[0].marginUsed, 5, "bin gets its share of margin");
assert.equal(b.loose.length, 1);
assert.equal(b.loose[0].size, 0.002, "the extra manual size stays separate");
assert.equal(b.loose[0].unrealizedPnl, 1);

const c = groupByBins([pos("xyz:SP500", -0.002, 5, 0)], [record("r1", 1, [{ symbol: "xyz:SP500", direction: "long", size: 0.002 }])]);
assert.deepEqual(c.stale, ["r1"], "opposite side does not match, record is stale");
assert.equal(c.loose.length, 1);

const d = groupByBins([pos("BTC", 0.001, 30, 0)], [record("old", 1, [{ symbol: "BTC", direction: "long", size: 0.001 }]), record("new", 2, [{ symbol: "BTC", direction: "long", size: 0.001 }])]);
assert.deepEqual(d.groups.map((g) => g.record.id), ["old"], "oldest bin claims the size first");
assert.deepEqual(d.stale, ["new"]);

console.log("bin records: ok");
