import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { HlOrder } from "./desk.js";
import { formatPrice, formatSize } from "./orders.js";
import type { HlPosition } from "./positions.js";

export type TriggerKind = "sl" | "tp";

export type TriggerInput = {
  assetId: number;
  szDecimals: number;
  position: HlPosition;
  markPx: number;
  kind: TriggerKind;
  triggerPx: number;
  maxNotionalUsd: number;
  slippage?: number;
  cloid?: `0x${string}`;
};

export type TriggerCheck = { ok: boolean; reason: string | null; resultUsd: number };

export function triggerPriceFor(markPx: number, isLong: boolean, kind: TriggerKind, pct: number): number {
  const against = (kind === "sl") === isLong;
  return markPx * (against ? 1 - pct / 100 : 1 + pct / 100);
}

export function checkTrigger(position: HlPosition, markPx: number, kind: TriggerKind, triggerPx: number): TriggerCheck {
  const isLong = position.size >= 0;
  const size = Math.abs(position.size);
  const resultUsd = (isLong ? triggerPx - position.entryPx : position.entryPx - triggerPx) * size;
  if (!(triggerPx > 0)) return { ok: false, reason: "Enter a price above zero.", resultUsd };
  const wantsBelow = (kind === "sl") === isLong;
  if (wantsBelow && triggerPx >= markPx) return { ok: false, reason: `A ${kind === "sl" ? "stop" : "target"} on a ${isLong ? "long" : "short"} must sit below the current price.`, resultUsd };
  if (!wantsBelow && triggerPx <= markPx) return { ok: false, reason: `A ${kind === "sl" ? "stop" : "target"} on a ${isLong ? "long" : "short"} must sit above the current price.`, resultUsd };
  if (kind === "sl" && position.liquidationPx !== null) {
    const beyond = isLong ? triggerPx <= position.liquidationPx : triggerPx >= position.liquidationPx;
    if (beyond) return { ok: false, reason: "That stop is beyond your liquidation price, so liquidation would hit first.", resultUsd };
  }
  return { ok: true, reason: null, resultUsd };
}

export async function placeTrigger(exchange: ExchangeClient, input: TriggerInput) {
  const check = checkTrigger(input.position, input.markPx, input.kind, input.triggerPx);
  if (!check.ok) throw new Error(check.reason ?? "Invalid trigger");
  const isLong = input.position.size >= 0;
  const size = formatSize(Math.abs(input.position.size), input.szDecimals);
  if (Number(size) === 0) throw new Error("Position size rounds to zero");
  const slippage = input.slippage ?? 0.05;
  const limit = input.triggerPx * (isLong ? 1 - slippage : 1 + slippage);
  return exchange.order({
    orders: [
      {
        a: input.assetId,
        b: !isLong,
        p: formatPrice(limit, input.szDecimals, "perp"),
        s: size,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: formatPrice(input.triggerPx, input.szDecimals, "perp"), tpsl: input.kind } },
        ...(input.cloid ? { c: input.cloid } : {}),
      },
    ],
    grouping: "positionTpsl",
  });
}

export function triggerKindOf(order: Pick<HlOrder, "isTrigger" | "orderType">): TriggerKind | null {
  if (!order.isTrigger) return null;
  const type = order.orderType.toLowerCase();
  if (type.includes("stop")) return "sl";
  if (type.includes("take profit")) return "tp";
  return null;
}
