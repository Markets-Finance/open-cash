import AsyncStorage from "@react-native-async-storage/async-storage";
import { triggerKindOf, type Candle } from "shared";
import { loadAccountDesk } from "./market";

type CardLike = { legs: { symbol: string; leverage: number }[]; stopLossPct: number; takeProfitPct?: number };

export type Overlay = {
  lines: { price: number; title: string; color: string; dashed?: boolean }[];
  legend: string;
};

const colors = { entry: "#7aa7ff", liq: "#ef5b5b", target: "#3ecf8e", stop: "#ffb454" };

function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

export async function buildOverlay(owner: string, coin: string, candles: Candle[]): Promise<Overlay | null> {
  if (candles.length < 2) return null;
  const desk = await loadAccountDesk(owner);
  const position = desk.positions.find((p) => p.coin === coin);
  const lines: Overlay["lines"] = [];
  const parts: string[] = [];
  const last = candles[candles.length - 1].close;

  if (position) {
    const isLong = position.size >= 0;
    lines.push({ price: position.entryPx, title: `In ${isLong ? "long" : "short"} ${position.leverage}x`, color: colors.entry });
    parts.push(`${isLong ? "Long" : "Short"} ${position.leverage}x, in at ${px(position.entryPx)}`);
    if (position.liquidationPx !== null) {
      const away = (Math.abs(last - position.liquidationPx) / last) * 100;
      lines.push({ price: position.liquidationPx, title: `Liquidates ${away.toFixed(1)}% away`, color: colors.liq, dashed: true });
      parts.push(`liquidates at ${px(position.liquidationPx)}`);
    }
    const triggers = desk.orders.filter((o) => o.coin === coin && triggerKindOf(o) !== null);
    for (const trigger of triggers) {
      const kind = triggerKindOf(trigger);
      lines.push({ price: trigger.triggerPx, title: kind === "sl" ? "Stop" : "Target", color: kind === "sl" ? colors.stop : colors.target, dashed: true });
      parts.push(`${kind === "sl" ? "stop" : "target"} ${px(trigger.triggerPx)}`);
    }
    try {
      if (triggers.length > 0) throw new Error("triggers cover this");
      const bots = JSON.parse((await AsyncStorage.getItem(`opencash.bots.${owner.toLowerCase()}`)) ?? "[]") as { card: CardLike }[];
      const bot = bots.find((b) => b.card.legs.some((l) => l.symbol === coin));
      if (bot) {
        const leg = bot.card.legs.find((l) => l.symbol === coin)!;
        const move = (pct: number) => pct / 100 / Math.max(1, leg.leverage || position.leverage);
        const stopPx = position.entryPx * (isLong ? 1 - move(bot.card.stopLossPct) : 1 + move(bot.card.stopLossPct));
        lines.push({ price: stopPx, title: `Stop ${bot.card.stopLossPct}%`, color: colors.stop, dashed: true });
        parts.push(`stop ${px(stopPx)}`);
        if (bot.card.takeProfitPct) {
          const targetPx = position.entryPx * (isLong ? 1 + move(bot.card.takeProfitPct) : 1 - move(bot.card.takeProfitPct));
          lines.push({ price: targetPx, title: `Target ${bot.card.takeProfitPct}%`, color: colors.target, dashed: true });
          parts.push(`target ${px(targetPx)}`);
        }
      }
    } catch {
      /* bots are optional context */
    }
    parts.push(`${position.unrealizedPnl >= 0 ? "up" : "down"} $${Math.abs(position.unrealizedPnl).toFixed(2)} now`);
  }

  if (lines.length === 0) return null;
  return { lines, legend: parts.join(" · ") };
}
