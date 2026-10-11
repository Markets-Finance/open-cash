import {
  binEntryOrders,
  binFromCard,
  cardMaxLossUsd,
  checkEntry,
  createHlInfo,
  createToolbox,
  defaultLimits,
  hlBinInputSource,
  orderIssue,
  planBin,
} from "shared";
import { guardrailStatus } from "../guardrails/store.js";
import { agentIssue, mandateIssue } from "./integrity.js";
import type { ServerBot } from "./store.js";
import { hasKey, loadKey } from "./vault.js";

const maxOrderUsd = Number(process.env.BOT_MAX_ORDER_USD ?? 100);

export type PreflightCheck = { name: string; ok: boolean; detail: string };

export async function preflight(bot: ServerBot) {
  const checks: PreflightCheck[] = [];
  const add = (name: string, issue: string | null, detail = "ok") => checks.push({ name, ok: issue === null, detail: issue ?? detail });
  const step = async (name: string, run: () => Promise<string | null | { detail: string }>) => {
    try {
      const result = await run();
      if (result === null) add(name, null);
      else if (typeof result === "string") add(name, result);
      else add(name, null, result.detail);
    } catch (error) {
      add(name, error instanceof Error ? error.message : String(error));
    }
  };

  await step("mandate", () => mandateIssue(bot));
  await step("agent key", async () => {
    if (!(await hasKey(bot.owner, bot.net))) return "No agent key saved for this wallet";
    const stored = await loadKey(bot.owner, bot.net);
    return stored ? agentIssue(bot.owner, bot.net, stored.agentAddress) : "Agent key could not be read";
  });
  await step("guardrails", async () => {
    const { verdict } = await guardrailStatus(bot.owner, bot.net, cardMaxLossUsd(bot.card));
    return verdict.allowed ? { detail: verdict.reason } : verdict.reason;
  });

  const info = createHlInfo(bot.net);
  const toolbox = createToolbox(info, defaultLimits, bot.owner as `0x${string}`);
  await step("entry", async () => {
    const check = await checkEntry(bot.card, bot.rules.minCarryAprPct, toolbox);
    return check.ok ? { detail: check.reason } : check.reason;
  });
  await step("orders", async () => {
    const markets = new Map((await toolbox.getMarkets()).map((m) => [m.name, m]));
    const plan = await planBin(hlBinInputSource(info), binFromCard(bot.card), bot.card.marginUsd, markets, "fixed");
    if (plan.sized.legs.length !== bot.card.legs.length) return `Not every leg could be sized: ${plan.issues.map((i) => i.detail).join("; ")}`;
    const orders = binEntryOrders(plan.sized, markets, { maxNotionalUsd: maxOrderUsd });
    const problems = orders.map((order, index) => ({ leg: bot.card.legs[index].symbol, issue: orderIssue(order) })).filter((p) => p.issue);
    if (problems.length > 0) return problems.map((p) => `${p.leg}: ${p.issue}`).join("; ");
    const total = orders.reduce((sum, o) => sum + o.size * o.price, 0);
    return { detail: `${orders.length} orders, $${total.toFixed(2)} notional, none sent` };
  });

  return { network: bot.net, botId: bot.id, ready: checks.every((c) => c.ok), checks, sent: false as const };
}
