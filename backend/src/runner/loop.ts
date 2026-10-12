import {
  createHlBotDeps,
  createHlExchange,
  createHlInfo,
  createToolbox,
  defaultLimits,
  tickBot,
  type BotDeps,
  type HlNetwork,
} from "shared";
import { privateKeyToAccount } from "viem/accounts";
import { guardrailStatus } from "../guardrails/store.js";
import { tickLiveAll } from "../live/loop.js";
import { killed } from "../kill.js";
import { claimLock } from "../lock.js";
import { agentIssue, mandateIssue } from "./integrity.js";
import { listBots, saveBot, type ServerBot } from "./store.js";
import { loadKey } from "./vault.js";

const maxOrderUsd = Number(process.env.BOT_MAX_ORDER_USD || Infinity);

function stopped(bot: ServerBot, message: string): ServerBot {
  return {
    ...bot,
    enabled: false,
    status: "halted",
    log: [{ at: Date.now(), level: "error" as const, message }, ...bot.log].slice(0, 60),
  };
}

function withSharedLegGuard(deps: BotDeps, bot: ServerBot, others: ServerBot[]): BotDeps {
  return {
    ...deps,
    open: async (card) => {
      for (const other of others) {
        if (other.id === bot.id || !other.enabled) continue;
        const shared = other.card.legs.find((leg) => card.legs.some((own) => own.symbol === leg.symbol));
        if (shared) throw new Error(`${shared.symbol} is already used by the bot "${other.name}"`);
      }
      return deps.open(card);
    },
  };
}

export function cardBotDeps(owner: string, net: HlNetwork, secretHex: string): BotDeps {
  const info = createHlInfo(net);
  const exchange = createHlExchange(net, privateKeyToAccount(`0x${secretHex}`));
  const user = owner as `0x${string}`;
  const builder = process.env.BUILDER_ADDRESS
    ? { address: process.env.BUILDER_ADDRESS as `0x${string}`, feeTenthsBps: Number(process.env.BUILDER_FEE_TENTHS_BPS ?? 10) }
    : undefined;
  const guard = async (_card: unknown, maxLossUsd: number) => {
    const { verdict } = await guardrailStatus(owner, net, maxLossUsd);
    return { allowed: verdict.allowed, reason: verdict.reason };
  };
  return createHlBotDeps({ info, exchange, user, toolbox: createToolbox(info, defaultLimits, user), maxNotionalUsd: maxOrderUsd, builder, guard });
}

export async function tickOwner(owner: string, net: HlNetwork, bots: ServerBot[]): Promise<void> {
  const stored = await loadKey(owner, net);
  if (!stored) {
    for (const bot of bots) await saveBot(stopped(bot, "No agent key saved for this wallet"));
    return;
  }
  const revoked = await agentIssue(owner, net, stored.agentAddress).catch(() => null);
  if (revoked) {
    for (const bot of bots) await saveBot(stopped(bot, revoked));
    return;
  }
  const verified: ServerBot[] = [];
  for (const bot of bots) {
    const issue = await mandateIssue(bot);
    if (issue) await saveBot(stopped(bot, issue));
    else verified.push(bot);
  }
  bots = verified;
  const deps = cardBotDeps(owner, net, stored.secretHex);
  for (const bot of bots) {
    const next = await tickBot(bot, withSharedLegGuard(deps, bot, bots));
    await saveBot({ ...next, owner: bot.owner, net: bot.net, mandate: bot.mandate });
  }
}

export async function tickAll(): Promise<void> {
  const active = await listBots({ enabled: true });
  const groups = new Map<string, ServerBot[]>();
  for (const bot of active) {
    const key = `${bot.net}:${bot.owner.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), bot]);
  }
  await Promise.allSettled(
    [...groups.entries()].map(([key, bots]) => {
      const [net, owner] = key.split(":") as [HlNetwork, string];
      return tickOwner(owner, net, bots).catch((error) => console.error(`runner ${key} failed`, error));
    }),
  );
}

let active = false;

export function runnerActive(): boolean {
  return active;
}

export async function startRunner(intervalMs = 30_000): Promise<boolean> {
  if (!(await claimLock("data/bot-runner.lock"))) {
    console.error("bot runner: another process owns the runner, this one will not trade");
    return false;
  }
  active = true;
  let busy = false;
  const run = async () => {
    if (busy || killed()) return;
    busy = true;
    try {
      await tickAll();
      await tickLiveAll();
    } finally {
      busy = false;
    }
  };
  setInterval(() => void run(), intervalMs);
  void run();
  return true;
}
