import { triggerKindOf, type Candle } from "shared";
import type { ChartOverlay } from "./charts";
import { getDesk } from "./desk";
import { displaySymbol } from "./market";
import { requireTrader } from "./state";
import { px, usd } from "./dom";

type CardLeg = { symbol: string; leverage: number };
type CardLike = { legs: CardLeg[]; stopLossPct: number; takeProfitPct?: number };
type BotLike = { enabled?: boolean; card: CardLike };

const colors = { entry: "#7aa7ff", liq: "#ef5b5b", target: "#3ecf8e", stop: "#ffb454" };

function localBots(owner: string): BotLike[] {
  try {
    return JSON.parse(localStorage.getItem(`opencash.bots.${owner.toLowerCase()}`) ?? "[]") as BotLike[];
  } catch {
    return [];
  }
}

export async function buildOverlay(coin: string, candles: Candle[]): Promise<{ overlay: ChartOverlay; legend: string } | null> {
  const trader = requireTrader();
  const desk = await getDesk();
  const position = desk.positions.find((p) => p.coin === coin);
  const lines: ChartOverlay["lines"] = [];
  let legend = "";

  if (position) {
    const isLong = position.size >= 0;
    const lev = position.leverage;
    lines.push({ price: position.entryPx, title: `In ${isLong ? "long" : "short"} ${lev}x`, color: colors.entry });
    const parts = [`You are ${isLong ? "long" : "short"} ${displaySymbol(coin)} ${lev}x, in at ${px(position.entryPx)}`];
    if (position.liquidationPx !== null) {
      const away = (Math.abs(candles[candles.length - 1].close - position.liquidationPx) / candles[candles.length - 1].close) * 100;
      lines.push({ price: position.liquidationPx, title: `Liquidates (${away.toFixed(1)}% away)`, color: colors.liq, dashed: true });
      parts.push(`liquidates at ${px(position.liquidationPx)} (${away.toFixed(1)}% away)`);
    }
    const triggers = desk.orders.filter((o) => o.coin === coin && triggerKindOf(o) !== null);
    for (const trigger of triggers) {
      const kind = triggerKindOf(trigger);
      const price = trigger.triggerPx;
      const pnl = (isLong ? price - position.entryPx : position.entryPx - price) * Math.abs(position.size);
      lines.push({ price, title: `${kind === "sl" ? "Stop" : "Target"} (${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))})`, color: kind === "sl" ? colors.stop : colors.target, dashed: true });
      parts.push(`${kind === "sl" ? "stop" : "target"} ${px(price)}`);
    }
    const bot = triggers.length > 0 ? undefined : localBots(trader.address).find((b) => b.card.legs.some((l) => l.symbol === coin));
    if (bot) {
      const leg = bot.card.legs.find((l) => l.symbol === coin)!;
      const move = (pct: number) => pct / 100 / Math.max(1, leg.leverage || lev);
      const stopPx = position.entryPx * (isLong ? 1 - move(bot.card.stopLossPct) : 1 + move(bot.card.stopLossPct));
      lines.push({ price: stopPx, title: `Stop ${bot.card.stopLossPct}% of margin`, color: colors.stop, dashed: true });
      parts.push(`stop ${px(stopPx)}`);
      if (bot.card.takeProfitPct) {
        const targetPx = position.entryPx * (isLong ? 1 + move(bot.card.takeProfitPct) : 1 - move(bot.card.takeProfitPct));
        lines.push({ price: targetPx, title: `Target ${bot.card.takeProfitPct}% of margin`, color: colors.target, dashed: true });
        parts.push(`target ${px(targetPx)}`);
      }
    }
    parts.push(`${position.unrealizedPnl >= 0 ? "up" : "down"} ${usd(Math.abs(position.unrealizedPnl))} now`);
    legend = parts.join(" · ");
  }

  return lines.length === 0 ? null : { overlay: { lines }, legend };
}
