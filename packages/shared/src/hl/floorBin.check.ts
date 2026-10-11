import assert from "node:assert/strict";
import type { HlMarket } from "./markets.js";
import { groupFloors, previewFloorBin, weekendCloseAt } from "./floorBin.js";
import { floorDigest } from "./floorMessages.js";
import type { Bin } from "../bins/types.js";

const market = (name: string, markPx: number): HlMarket => ({ dex: name.includes(":") ? "xyz" : "", name, assetIndex: 0, assetId: 1, szDecimals: 3, maxLeverage: 20, markPx, oraclePx: markPx, prevDayPx: markPx, dayNtlVlm: 1e6, openInterest: 1e5, funding: 0 });
const markets = new Map([["BTC", market("BTC", 80000)], ["ETH", market("ETH", 2400)]]);
const bin: Bin = { id: "t", name: "t", thesis: "", legs: [{ symbol: "BTC", direction: "long", weightBps: 6000, leverage: 3 }, { symbol: "ETH", direction: "long", weightBps: 4000, leverage: 3 }] };

const good = previewFloorBin({ bin, markets, amountUsd: 200, floorPct: 0.8, sleeveLeverage: 5 });
assert.equal(good.blocked, null);
assert.equal(Math.round(good.floorUsd), 160);
assert.equal(Math.round(good.maxLossUsd), 40);
assert.equal(good.legs.length, 2);

const small = previewFloorBin({ bin, markets, amountUsd: 20, floorPct: 0.8, sleeveLeverage: 5 });
assert.ok(small.blocked?.includes("below the $10 minimum"));

const missing = previewFloorBin({ bin: { ...bin, legs: [{ symbol: "XYZ", direction: "long", weightBps: 10000, leverage: 3 }] }, markets, amountUsd: 200, floorPct: 0.8, sleeveLeverage: 5 });
assert.ok(missing.blocked?.includes("not listed"));

const record = { coin: "BTC", dex: "", assetId: 1, szDecimals: 3, isLong: true, floorUsd: 1, sleeveUsd: 1, leverage: 5, size: 1, entryPx: 1, openedAt: 1 };
assert.notEqual(floorDigest(record), floorDigest({ ...record, groupId: "g" }));
assert.equal(floorDigest(record), floorDigest({ ...record }));
assert.equal(groupFloors([{ record: { ...record, groupId: "g" } } as never, { record: { ...record, coin: "ETH", groupId: "g" } } as never]).length, 1);
const sat = Date.UTC(2026, 9, 10, 15, 0, 0);
const close = weekendCloseAt(["xyz:GOLD"], sat);
assert.ok(close !== null && close > sat);
assert.equal(weekendCloseAt(["BTC"], sat), null);
console.log("ok");
