import { bins, cardFromBin, ruleDrafter } from "shared";
import { esc, query } from "../dom";
import { addLeg, initCard, setCard } from "./card";
import { initLab } from "../lab";
import { onAddLeg, pushOutcome } from "./feed";
import { hlNetwork } from "../../hl";
import { run, toolbox } from "./session";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";

const argsByTool: Record<string, string[]> = {
  list_markets: [],
  market_snapshot: ["symbol"],
  funding_history: ["symbol", "days"],
  price_stats: ["symbol", "days"],
  order_book: ["symbol", "notionalUsd"],
  compare_pair: ["long", "short", "days"],
};

function readArgs(tool: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
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

  const headlineForm = query<HTMLFormElement>("[data-headline-form]");
  const headlineInput = query<HTMLInputElement>("[data-headline-input]");
  const headlineGo = query<HTMLButtonElement>("[data-headline-go]");
  const headlineHint = query("[data-headline-hint]");
  const headlineResult = query("[data-headline-result]");
  headlineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    headlineHint.dataset.tone = "";
    headlineHint.textContent = "Reading the headline…";
    headlineResult.innerHTML = "";
    headlineGo.disabled = true;
    try {
      const response = await fetch(`${backend}/agent/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: headlineInput.value.trim(), network: hlNetwork, marginUsd: hlNetwork === "testnet" ? 10 : 50 }),
      });
      const body = (await response.json()) as {
        card?: Parameters<typeof setCard>[0];
        preview?: { maxLossAtStopUsd: number; issues?: { message?: string; detail?: string }[] };
        approvable?: boolean;
        rationale?: string;
        caveats?: string[];
        dropped?: string[];
        note?: string;
        error?: string;
      };
      if (response.status === 422) {
        headlineHint.textContent = `No trade found for that headline. ${body.error ?? ""}`.trim();
        return;
      }
      if (!response.ok || !body.card) throw new Error(body.error ?? `Request failed (${response.status})`);
      setCard(body.card);
      headlineHint.textContent = body.note ?? "";
      headlineResult.innerHTML = [
        body.rationale ? `<p>${esc(body.rationale)}</p>` : "",
        body.preview ? `<p class="agent__hint">Most you can lose at the stop: <b>$${body.preview.maxLossAtStopUsd.toFixed(2)}</b>.</p>` : "",
        ...(body.caveats ?? []).map((text) => `<p class="agent__hint">${esc(text)}</p>`),
        body.dropped && body.dropped.length > 0 ? `<p class="agent__hint">Left out because they are not listed: ${body.dropped.map(esc).join(", ")}.</p>` : "",
        ...(body.preview?.issues ?? []).map((issue) => `<p class="agent__hint">${esc(issue.message ?? issue.detail ?? "")}</p>`),
        body.approvable === false ? `<p class="status-line" data-tone="error">This card has a blocking issue. Fix it in the editor below before approving.</p>` : "",
      ].join("");
    } catch (error) {
      headlineHint.dataset.tone = "error";
      headlineHint.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      headlineGo.disabled = false;
    }
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
