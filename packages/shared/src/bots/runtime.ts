import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import type { Toolbox } from "../agent/toolbox.js";
import { closeBin, openBin } from "../bins/execute.js";
import { hlBinInputSource } from "../bins/inputs.js";
import { planBin } from "../bins/plan.js";
import type { HlBuilder } from "../hl/orders.js";
import { getAccount, type HlPosition } from "../hl/positions.js";
import { placeTrigger, triggerKindOf, triggerPriceFor, type TriggerKind } from "../hl/triggers.js";
import { binFromCard } from "../strategy/convert.js";
import type { StrategyCard } from "../strategy/types.js";
import { checkEntry } from "./entry.js";
import { tickBot, type BotDeps, type HeldLeg } from "./engine.js";
import type { Bot } from "./types.js";

export type BotStorage = {
  load: () => Promise<Bot[]>;
  save: (bots: Bot[]) => Promise<void>;
};

export type HlBotDepsConfig = {
  info: InfoClient;
  exchange: ExchangeClient;
  user: `0x${string}`;
  toolbox: Toolbox;
  maxNotionalUsd: number;
  builder?: HlBuilder;
  slippage?: number;
  now?: () => number;
  guard?: (card: StrategyCard, maxLossUsd: number) => Promise<{ allowed: boolean; reason: string }>;
};

export function cardMaxLossUsd(card: StrategyCard): number {
  return (card.marginUsd * card.stopLossPct) / 100;
}

function dexOf(symbol: string): string {
  return symbol.includes(":") ? symbol.split(":")[0] : "";
}

async function positionsFor(config: HlBotDepsConfig, card: StrategyCard): Promise<HlPosition[]> {
  const dexes = [...new Set(card.legs.map((leg) => dexOf(leg.symbol)))];
  const accounts = await Promise.all(dexes.map((dex) => getAccount(config.info, config.user, dex)));
  return accounts.flatMap((account) =>
    account.positions.filter((p) =>
      card.legs.some((leg) => leg.symbol === p.coin && (leg.direction === "long") === p.size > 0),
    ),
  );
}

export function createHlBotDeps(config: HlBotDepsConfig): BotDeps {
  const options = { maxNotionalUsd: config.maxNotionalUsd, builder: config.builder, slippage: config.slippage };
  const marketMap = async () => new Map((await config.toolbox.getMarkets()).map((m) => [m.name, m]));

  return {
    now: config.now ?? Date.now,
    heldLegs: async (card) =>
      (await positionsFor(config, card)).map(
        (p): HeldLeg => ({
          symbol: p.coin,
          direction: p.size > 0 ? "long" : "short",
          depositUsd: p.marginUsed,
          pnlUsd: p.unrealizedPnl,
        }),
      ),
    checkEntry: (card, minCarry) => checkEntry(card, minCarry, config.toolbox),
    open: async (card) => {
      if (config.guard) {
        const verdict = await config.guard(card, cardMaxLossUsd(card));
        if (!verdict.allowed) throw new Error(`Guardrail: ${verdict.reason}`);
      }
      if (card.marginUsd > config.toolbox.limits.maxMarginUsd) {
        throw new Error(`Margin $${card.marginUsd} is above the $${config.toolbox.limits.maxMarginUsd} allocation cap`);
      }
      const markets = await marketMap();
      const plan = await planBin(hlBinInputSource(config.info), binFromCard(card), card.marginUsd, markets, "fixed");
      if (plan.sized.legs.length !== card.legs.length) {
        throw new Error(`Not every leg could be sized: ${plan.issues.map((i) => i.detail).join("; ")}`);
      }
      const results = await openBin(config.exchange, plan.sized, markets, options);
      const failed = results.filter((r) => r.filledSize <= 0);
      if (failed.length > 0) {
        const filled = await positionsFor(config, card);
        await closeBin(config.exchange, filled, markets, options);
        throw new Error(`Rolled back: ${failed.map((r) => `${r.symbol} (${r.error ?? "not filled"})`).join(", ")}`);
      }
      return {};
    },
    protect: async (card) => {
      const held = await positionsFor(config, card);
      if (held.length === 0) return [];
      const markets = await marketMap();
      const dexes = [...new Set(held.map((p) => p.dex))];
      const orders = (await Promise.all(dexes.map((dex) => config.info.frontendOpenOrders(dex ? { user: config.user, dex } : { user: config.user })))).flat();
      const placed: string[] = [];
      for (const position of held) {
        const market = markets.get(position.coin);
        if (!market) throw new Error(`${position.coin} is not listed`);
        const existing = orders
          .filter((o) => o.coin === position.coin && o.isTrigger && o.reduceOnly)
          .map((o) => triggerKindOf({ isTrigger: o.isTrigger, orderType: o.orderType }));
        const isLong = position.size > 0;
        const leverage = position.leverage > 0 ? position.leverage : (card.legs.find((leg) => leg.symbol === position.coin)?.leverage ?? 1);
        const wanted: [TriggerKind, number][] = [["sl", card.stopLossPct]];
        if (card.legs.length === 1 && card.takeProfitPct !== undefined) wanted.push(["tp", card.takeProfitPct]);
        for (const [kind, pct] of wanted) {
          if (existing.includes(kind)) continue;
          const triggerPx = triggerPriceFor(position.entryPx, isLong, kind, pct / leverage);
          await placeTrigger(config.exchange, { assetId: market.assetId, szDecimals: market.szDecimals, position, markPx: market.markPx, kind, triggerPx, maxNotionalUsd: config.maxNotionalUsd });
          placed.push(`${kind === "sl" ? "stop" : "target"} ${position.coin.split(":").pop()} at ${Number(triggerPx.toPrecision(5))}`);
        }
      }
      return placed;
    },
    close: async (card) => {
      const markets = await marketMap();
      const results = await closeBin(config.exchange, await positionsFor(config, card), markets, options);
      const failed = results.filter((r) => r.filledSize <= 0);
      if (failed.length > 0) throw new Error(`Close incomplete: ${failed.map((r) => r.symbol).join(", ")}`);
      return {};
    },
  };
}

export type BotRuntimeConfig = {
  deps: BotDeps;
  storage: BotStorage;
  onChange: (bots: Bot[]) => void;
  intervalMs?: number;
};

const defaultIntervalMs = 30_000;

export function createBotRuntime(config: BotRuntimeConfig) {
  const { deps, storage, onChange } = config;
  let bots: Bot[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;

  async function persist() {
    await storage.save(bots);
    onChange(bots);
  }

  async function tickNow() {
    if (busy) return;
    busy = true;
    try {
      const next: Bot[] = [];
      for (const bot of bots) next.push(await tickBot(bot, deps));
      bots = next;
      await persist();
    } finally {
      busy = false;
    }
  }

  return {
    async init() {
      bots = (await storage.load()).map((bot) =>
        bot.status === "halted" ? bot : { ...bot, enabled: false, status: "idle" },
      );
      onChange(bots);
    },
    list: () => bots,
    start() {
      if (timer) return;
      timer = setInterval(() => void tickNow(), config.intervalMs ?? defaultIntervalMs);
      void tickNow();
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
    async add(bot: Bot) {
      bots = [bot, ...bots];
      await persist();
    },
    async update(id: string, patch: (bot: Bot) => Bot) {
      bots = bots.map((bot) => (bot.id === id ? patch(bot) : bot));
      await persist();
    },
    async remove(id: string) {
      bots = bots.filter((bot) => bot.id !== id);
      await persist();
    },
    async setEnabled(id: string, enabled: boolean) {
      bots = bots.map((bot) =>
        bot.id === id ? { ...bot, enabled, status: enabled ? "watching" : "idle", errorStreak: 0 } : bot,
      );
      await persist();
      if (enabled) void tickNow();
    },
    tickNow,
  };
}

export type BotRuntime = ReturnType<typeof createBotRuntime>;
