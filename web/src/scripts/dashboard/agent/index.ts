import { bins, cardFromBin, ruleDrafter } from "shared";
import { esc, query } from "../dom";
import { addLeg, initCard, setCard } from "./card";
import { initLab } from "../lab";
import { onAddLeg, pushOutcome } from "./feed";
import { run, toolbox } from "./session";

const argsByTool: Record<string, string[]> = {
  list_markets: [],
  market_snapshot: ["symbol"],
  funding_history: ["symbol", "days"],
  price_stats: ["symbol", "days"],
  order_book: ["symbol", "notionalUsd"],
  compare_pair: ["long", "short", "days"],
  smart_money: [],
};

function readArgs(tool: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (tool === "smart_money") {
    const names = ["symbol", "long", "short"].map((key) => query<HTMLInputElement>(`[data-arg=${key}]`).value.trim().toUpperCase());
    args.symbols = [...new Set(names.filter((name) => name !== ""))];
    return args;
  }
  for (const key of argsByTool[tool] ?? []) {
    const value = query<HTMLInputElement>(`[data-arg=${key}]`).value.trim();
    args[key] = key === "days" || key === "notionalUsd" ? Number(value) : value.toUpperCase();
  }
  return args;
}

export function initAgent() {
  void initLab();
  initCard();
  onAddLeg(addLeg);

  const hint = query("[data-agent-hint]");
  const input = query<HTMLInputElement>("[data-agent-input]");

  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) =>
    button.addEventListener("click", async () => {
      button.disabled = true;
      pushOutcome(await run(button.dataset.tool!, readArgs(button.dataset.tool!)));
      button.disabled = false;
    }),
  );

  query("[data-agent-ideas]").innerHTML = bins
    .map((bin, index) => `<button type="button" class="chip" data-idea="${index}">${esc(bin.name)}</button>`)
    .join("");
  query("[data-agent-ideas]").addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-idea]");
    if (chip) setCard(cardFromBin(bins[Number(chip.dataset.idea)], 100, 10));
  });

  query<HTMLFormElement>("[data-agent-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    hint.textContent = "";
    hint.dataset.tone = "";
    try {
      const symbols = (await toolbox.getMarkets()).map((m) => m.name);
      const drafted = await ruleDrafter(input.value, symbols);
      if (drafted === null) {
        hint.dataset.tone = "error";
        hint.textContent = `Name a market and a side, for example "long ETH short BTC 2x $100 stop 8%". Markets: ${symbols.join(", ")}.`;
        return;
      }
      setCard(drafted);
    } catch (error) {
      hint.dataset.tone = "error";
      hint.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}
