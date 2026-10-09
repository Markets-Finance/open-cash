import { createBot, createBotRuntime, createHlBotDeps, maxOrderNotionalUsd, type Bot, type BotMode, type BotRuntime } from "shared";
import { agentExchange, agentReady } from "../../hlSession";
import { info } from "../../hl";
import { query } from "../dom";
import { toolbox } from "../agent/session";
import { requireTrader } from "../state";
import { localBotStorage } from "./storage";
import { publishStrategy } from "../strategies";
import { initServerBots, runOnServer, startServerBots } from "./server";
import { renderBot } from "./view";

let runtime: BotRuntime | null = null;

function paint(bots: Bot[]) {
  const list = query("[data-bot-list]");
  list.innerHTML = bots.length === 0 ? `<p class="empty">No bots yet.</p>` : bots.map(renderBot).join("");
}

async function ensureRuntime(): Promise<BotRuntime> {
  if (runtime) return runtime;
  const trader = requireTrader();
  const exchange = await agentExchange(trader);
  runtime = createBotRuntime({
    deps: createHlBotDeps({ info, exchange, user: trader.address, toolbox, maxNotionalUsd: maxOrderNotionalUsd }),
    storage: localBotStorage(trader.address),
    onChange: paint,
  });
  await runtime.init();
  runtime.start();
  return runtime;
}

export async function startBots() {
  startServerBots();
  if (await agentReady(requireTrader()).catch(() => false)) await ensureRuntime();
}

export async function addBotFromCard(card: Bot["card"], mode: BotMode) {
  const active = await ensureRuntime();
  await active.add(createBot(card.name, mode, card, Date.now()));
}

export function initBots() {
  const list = query("[data-bot-list]");
  initServerBots((error) => {
    const hint = query("[data-bot-hint]");
    hint.dataset.tone = "error";
    hint.textContent = error instanceof Error ? error.message : String(error);
  });

  list.addEventListener("click", async (event) => {
    const root = (event.target as HTMLElement).closest<HTMLElement>("[data-bot]");
    if (!root) return;
    if ((event.target as HTMLElement).closest("[data-bot-server]")) {
      const hint = query("[data-bot-hint]");
      const source = JSON.parse(localStorage.getItem(`opencash.bots.${requireTrader().address.toLowerCase()}`) ?? "[]") as Bot[];
      const bot = source.find((b) => b.id === root.dataset.bot);
      if (!bot) return;
      hint.dataset.tone = "";
      hint.textContent = "Waiting for your passkey…";
      try {
        await runOnServer(bot.card, bot.mode);
        hint.textContent = `${bot.name} now runs on the server.`;
      } catch (error) {
        hint.dataset.tone = "error";
        hint.textContent = error instanceof Error ? error.message : String(error);
      }
      return;
    }
    if ((event.target as HTMLElement).closest("[data-bot-share]")) {
      const hint = query("[data-bot-hint]");
      const source = JSON.parse(localStorage.getItem(`opencash.bots.${requireTrader().address.toLowerCase()}`) ?? "[]") as Bot[];
      const shared = source.find((b) => b.id === root.dataset.bot);
      if (!shared) return;
      try {
        const published = await publishStrategy(shared.card);
        hint.dataset.tone = "";
        hint.textContent = `Shared as strategy ${published.id}. It appears on Ranks and ranks once two followers have closed trades.`;
      } catch (error) {
        hint.dataset.tone = "error";
        hint.textContent = error instanceof Error ? error.message : String(error);
      }
      return;
    }
    const active = await ensureRuntime();
    const bot = active.list().find((b) => b.id === root.dataset.bot);
    if (!bot) return;
    if ((event.target as HTMLElement).closest("[data-bot-toggle]")) await active.setEnabled(bot.id, !bot.enabled);
    if ((event.target as HTMLElement).closest("[data-bot-delete]")) await active.remove(bot.id);
  });

  list.addEventListener("change", async (event) => {
    const field = event.target as HTMLInputElement;
    const rule = field.dataset.rule;
    const root = field.closest<HTMLElement>("[data-bot]");
    if (!rule || !root || !runtime) return;
    await runtime.update(root.dataset.bot!, (bot) => ({
      ...bot,
      rules: { ...bot.rules, [rule]: Number(field.value) },
    }));
  });

}
