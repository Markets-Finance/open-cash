import { bins, closeBin, marketSession, customBin, hlBinInputSource, maxOrderNotionalUsd, openBin, planBin, weightModes, type Bin, type WeightMode } from "shared";
import { cardFromBin } from "shared";
import { agentExchange } from "../hlSession";
import { info } from "../hl";
import { setCard } from "./agent/card";
import { addBotFromCard } from "./bots";
import { errorText, legStackHtml, query, usd } from "./dom";
import { getDesk } from "./desk";
import { guardOrThrow } from "./guardrails";
import { initHome } from "./home";
import { displaySymbol, getMarketData, getPositions } from "./market";
import { closeModal, openModal } from "./modal";
import { requireTrader } from "./state";
import { activateTab } from "./tabs";

const inputSource = hlBinInputSource(info);

export function initBins() {
  const carousel = query("[data-bins-carousel]");
  carousel.className = "carousel";
  carousel.innerHTML = "";
  for (const bin of bins) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "tile-card";
    card.dataset.binId = bin.id;
    card.innerHTML = `
      ${legStackHtml(bin.legs.map((leg) => leg.symbol))}
      <span class="tile-card__name">${bin.name}${bin.tags?.includes("weekend") ? ` <small class="tag-pill" title="Trades while stock and futures markets are shut">Weekend</small>` : ""}</span>
      <span class="tile-card__thesis">${bin.thesis}</span>
      <div class="tile-card__legs">
        ${bin.legs.map((leg) => `<div class="tile-leg asset-row--link" data-open-asset="${leg.symbol}" title="Trade ${leg.symbol}"><span>${leg.direction === "long" ? "Long" : "Short"} ${displaySymbol(leg.symbol)}</span><span>${(leg.weightBps / 100).toFixed(0)}%</span></div>`).join("")}
      </div>`;
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-open-asset]")) return;
      openBinModal(bin);
    });
    carousel.appendChild(card);
  }
  const build = document.createElement("button");
  build.type = "button";
  build.className = "tile-card";
  build.innerHTML = `
    <div class="leg-stack"><span class="tile-plus">+</span></div>
    <span class="tile-card__name">Build your own</span>
    <span class="tile-card__thesis">${customBase.thesis}</span>
    <div class="tile-card__legs"><div class="tile-leg"><span>Pick assets</span><span>+</span></div></div>`;
  build.addEventListener("click", () => openBinModal(customBase, true));
  carousel.appendChild(build);
}

const customBase: Bin = { id: "custom", name: "Build your own", thesis: "Pick assets and directions, then choose how margin is split.", legs: [] };

function openBinModal(bin: Bin, custom = false) {
  let mode: WeightMode = bin.mode ?? "fixed";
  const picks = new Map<string, "long" | "short">();
  const detail = openModal(`
    <div class="modal__head">
      <div class="modal__identity">${legStackHtml(bin.legs.map((leg) => leg.symbol))}<span class="modal__title">${bin.name}</span></div>
      <button type="button" class="modal__close" data-close>×</button>
    </div>
    <p class="quote-line">${bin.thesis}</p>
    ${bin.tags?.includes("weekend") && bin.legs[0] ? `<p class="quote-line">${marketSession(bin.legs[0].symbol).label}.</p>` : ""}
    ${custom ? `<div class="pick-grid" data-bin-picks>Loading markets…</div>` : ""}
    <div class="chip-row" data-bin-modes>${weightModes.map((m) => `<button type="button" class="chip${m.key === mode ? " chip--active" : ""}" data-mode="${m.key}" title="${m.hint}">${m.label}</button>`).join("")}</div>
    <div class="amount-row">
      <span>$</span>
      <input type="number" min="0" step="any" placeholder="0" data-bin-amount />
    </div>
    <button type="button" class="btn btn--primary" data-bin-size>Size this bin</button>
    <div data-bin-sizing></div>
    <div class="btn-row">
      <button type="button" class="btn" data-bin-agent>Edit in Agent</button>
      <button type="button" class="btn" data-bin-bot>Run as guard bot</button>
    </div>
    <p class="status-line" data-bin-status></p>
  `);
  const status = query("[data-bin-status]", detail);
  const sizingEl = query("[data-bin-sizing]", detail);
  const amountInput = query<HTMLInputElement>("[data-bin-amount]", detail);

  function fail(error: unknown) {
    status.dataset.tone = "error";
    status.textContent = errorText(error);
  }


  detail.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      mode = button.dataset.mode as WeightMode;
      detail.querySelectorAll<HTMLElement>("[data-mode]").forEach((el) => el.classList.toggle("chip--active", el === button));
    }),
  );

  if (custom) {
    void getMarketData().then((data) => {
      const grid = query("[data-bin-picks]", detail);
      const symbols = [...data.markets.values()].filter((m) => m.dayNtlVlm > 0).sort((a, b) => b.dayNtlVlm - a.dayNtlVlm).slice(0, 60).map((m) => m.name);
      grid.innerHTML = symbols
        .map((symbol) => `<div class="pick"><b>${displaySymbol(symbol)}</b><button type="button" class="chip" data-pick="${symbol}:long">Long</button><button type="button" class="chip" data-pick="${symbol}:short">Short</button></div>`)
        .join("");
      grid.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-pick]");
        if (!button) return;
        const [symbol, direction] = button.dataset.pick!.split(":") as [string, "long" | "short"];
        if (picks.get(symbol) === direction) picks.delete(symbol);
        else picks.set(symbol, direction);
        grid.querySelectorAll<HTMLElement>(`[data-pick^="${symbol}:"]`).forEach((el) =>
          el.classList.toggle("chip--active", picks.get(symbol) === el.dataset.pick!.split(":")[1]),
        );
      });
    });
  }

  function activeBin(): Bin | null {
    if (!custom) return bin;
    if (picks.size === 0) return null;
    return customBin([...picks].map(([symbol, direction]) => ({ symbol, direction })), mode, 3);
  }

  const binCard = () => cardFromBin(activeBin() ?? bin, Number(amountInput.value) > 0 ? Number(amountInput.value) : 100, 10);

  query<HTMLButtonElement>("[data-bin-agent]", detail).addEventListener("click", () => {
    closeModal();
    activateTab("agent");
    document.querySelector<HTMLElement>('[data-switcher="agent"] [data-switch="agent"]')?.click();
    setCard(binCard());
  });

  query<HTMLButtonElement>("[data-bin-bot]", detail).addEventListener("click", async () => {
    try {
      await addBotFromCard(binCard(), "guard");
      status.dataset.tone = "";
      status.textContent = "Guard bot added under Your bots in the Agent tab. Press Start there.";
    } catch (error) {
      fail(error);
    }
  });

  query<HTMLButtonElement>("[data-bin-size]", detail).addEventListener("click", async () => {
    const amount = Number(amountInput.value);
    if (!(amount > 0)) {
      status.textContent = "Enter an amount greater than 0.";
      status.dataset.tone = "error";
      return;
    }
    const chosen = activeBin();
    if (chosen === null) {
      status.textContent = "Pick at least one asset.";
      status.dataset.tone = "error";
      return;
    }
    status.textContent = "Reading every leg…";
    status.dataset.tone = "";
    sizingEl.innerHTML = "";
    try {
      const data = await getMarketData();
      const { sized, issues, usedMode } = await planBin(inputSource, chosen, amount, data.markets, mode);
      status.textContent = "";
      const warnings = issues.map((i) => i.detail).join(" · ");
      const skipped = issues.filter((i) => i.reason === "below-minimum" || i.reason === "no-liquidity" || i.reason === "unknown-market").map((i) => i.symbol);
      const fellBack = usedMode !== mode ? `<p class="warn-line">Not enough data for ${mode} weights, using fixed.</p>` : "";
      if (sized.legs.length === 0) {
        sizingEl.innerHTML = `<p class="warn-line">${warnings || "No legs could be sized."}</p>`;
        return;
      }
      sizingEl.innerHTML =
        sized.legs
          .map(
            (leg) =>
              `<div class="leg-row"><span>${leg.leg.direction === "long" ? "Long" : "Short"} ${leg.leg.symbol} · ${leg.leverage}x · ${(leg.leg.weightBps / 100).toFixed(1)}%</span><span>${usd(leg.margin)} margin · ${usd(leg.notional)}</span></div>`,
          )
          .join("") +
        fellBack +
        (warnings ? `<p class="warn-line">${warnings}</p>` : "") +
        `<button type="button" class="btn btn--primary" data-bin-confirm style="margin-top:12px">${skipped.length > 0 ? `Open without ${skipped.join(", ")}` : "Open bin with my passkey"}</button>`;
      const confirm = query<HTMLButtonElement>("[data-bin-confirm]", sizingEl);
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        status.dataset.tone = "";
        try {
          status.textContent = "Waiting for your passkey…";
          await guardOrThrow(sized.margin);
          const exchange = await agentExchange(requireTrader());
          status.textContent = "Opening every leg…";
          const results = await openBin(exchange, sized, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
          const failed = results.filter((r) => r.error !== null);
          const filled = results.filter((r) => r.error === null);
          await getDesk(true);
          await getPositions(true);
          void initHome();
          if (failed.length === 0) {
            status.textContent = `Opened ${bin.name}.`;
            return;
          }
          status.dataset.tone = "error";
          status.textContent = `${filled.length} of ${results.length} legs opened. ${failed.map((r) => `${displaySymbol(r.symbol)}: ${r.error}`).join(" · ")}`;
          if (filled.length > 0) {
            confirm.textContent = "Close the legs that filled";
            confirm.disabled = false;
            confirm.onclick = async () => {
              confirm.disabled = true;
              try {
                const open = (await getDesk(true)).positions.filter((p) => filled.some((r) => r.symbol === p.coin));
                await closeBin(exchange, open, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
                status.dataset.tone = "";
                status.textContent = "Closed the legs that filled.";
                await getPositions(true);
                void initHome();
              } catch (error) {
                fail(error);
                confirm.disabled = false;
              }
            };
          }
        } catch (error) {
          fail(error);
          confirm.disabled = false;
        }
      });
    } catch (error) {
      fail(error);
    }
  });
}
