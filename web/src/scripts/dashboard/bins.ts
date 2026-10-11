import { bins, closeBin, marketSession, customBin, hlBinInputSource, maxOrderNotionalUsd, openBin, planBin, weightModes, type Bin, type WeightMode } from "shared";
import { cardFromBin } from "shared";
import { agentExchange } from "../hlSession";
import { info } from "../hl";
import { setCard } from "./agent/card";
import { addBotFromCard } from "./bots";
import { errorText, legStackHtml, markForSymbol, query, usd, withFundingHint } from "./dom";
import { getDesk } from "./desk";
import { mountCombo } from "./combo";
import { binFloorPreview, binTimebox, floorPercentChoices, openFlooredBin } from "./floor";
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
    ${custom ? `<div data-bin-picker></div><div class="pick-selected" data-bin-selected><p class="quote-line">Loading markets…</p></div>` : ""}
    <div class="chip-row" data-bin-modes>${weightModes.map((m) => `<button type="button" class="chip${m.key === mode ? " chip--active" : ""}" data-mode="${m.key}" title="${m.hint}">${m.label}</button>`).join("")}</div>
    <div class="amount-row">
      <span>$</span>
      <input type="number" min="0" step="any" placeholder="0" data-bin-amount />
    </div>
    <div class="chip-row" data-bin-floors>${floorPercentChoices.map((v) => `<button type="button" class="chip${v === 0.8 ? " chip--active" : ""}" data-bin-floor="${v}">${Math.round(v * 100)}% floor</button>`).join("")}<button type="button" class="chip" data-bin-floor="none">No floor</button></div>
    <label class="quote-line" data-bin-timebox-row hidden><input type="checkbox" data-bin-timebox /> <span data-bin-timebox-label></span></label>
    <button type="button" class="btn btn--primary" data-bin-size>Size this bin</button>
    <div data-bin-sizing></div>
    <div class="btn-row">
      <button type="button" class="btn" data-bin-agent>Edit in Agent</button>
      <button type="button" class="btn" data-bin-bot>Run as guard bot</button>
    </div>
    <p class="status-line" data-bin-status></p>
  `);
  const status = query("[data-bin-status]", detail);
  let floorPct: number | null = 0.8;
  const timeboxRow = query("[data-bin-timebox-row]", detail);
  const timeboxEl = query<HTMLInputElement>("[data-bin-timebox]", detail);
  detail.querySelectorAll<HTMLElement>("[data-bin-floor]").forEach((chip) =>
    chip.addEventListener("click", () => {
      floorPct = chip.dataset.binFloor === "none" ? null : Number(chip.dataset.binFloor);
      detail.querySelectorAll<HTMLElement>("[data-bin-floor]").forEach((el) => el.classList.toggle("chip--active", el === chip));
    }),
  );
  const reopen = bin.tags?.includes("weekend") ? binTimebox(bin) : null;
  if (reopen !== null) {
    timeboxRow.hidden = false;
    query("[data-bin-timebox-label]", detail).textContent = `Close automatically when the market reopens (${new Date(reopen).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })})`;
  }
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
      const picker = query("[data-bin-picker]", detail);
      const selected = query("[data-bin-selected]", detail);
      const ranked = [...data.markets.values()].filter((m) => m.dayNtlVlm > 0).sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);

      function paintSelected() {
        selected.innerHTML =
          picks.size === 0
            ? `<p class="quote-line">No markets yet. Add at least one.</p>`
            : [...picks]
                .map(
                  ([symbol, direction]) =>
                    `<div class="pick"><span class="pick__name">${markForSymbol(symbol)}<b>${displaySymbol(symbol)}</b></span><button type="button" class="chip${direction === "long" ? " chip--active" : ""}" data-pick-dir="${symbol}:long">Long</button><button type="button" class="chip${direction === "short" ? " chip--active" : ""}" data-pick-dir="${symbol}:short">Short</button><button type="button" class="link-btn" data-pick-remove="${symbol}">Remove</button></div>`,
                )
                .join("");
      }

      mountCombo(picker, {
        buttonHtml: "Add a market",
        searchPlaceholder: `Search ${ranked.length} markets`,
        items: ranked.map((m) => ({ key: m.name, label: displaySymbol(m.name), markHtml: markForSymbol(m.name), group: m.name.includes(":") ? "Stocks, commodities and indices" : "Crypto" })),
        onPick: (symbol) => {
          if (!picks.has(symbol)) picks.set(symbol, "long");
          paintSelected();
        },
      });
      selected.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const dir = target.closest<HTMLElement>("[data-pick-dir]");
        const remove = target.closest<HTMLElement>("[data-pick-remove]");
        if (dir) {
          const raw = dir.dataset.pickDir!;
          const cut = raw.lastIndexOf(":");
          picks.set(raw.slice(0, cut), raw.slice(cut + 1) as "long" | "short");
        }
        if (remove) picks.delete(remove.dataset.pickRemove!);
        if (dir || remove) paintSelected();
      });
      paintSelected();
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
    if (floorPct !== null) {
      try {
        const data = await getMarketData();
        const floorChoice = floorPct;
        const preview = binFloorPreview(chosen, data.markets, amount, floorChoice, 3);
        status.textContent = "";
        sizingEl.innerHTML =
          preview.legs
            .map((l) => `<div class="leg-row"><span>${l.isLong ? "Long" : "Short"} ${displaySymbol(l.symbol)} · 3x</span><span>${usd(l.sleeveUsd)} traded · ${usd(l.notionalUsd)} position</span></div>`)
            .join("") +
          `<div class="leg-row"><span>You can't end below</span><span>${usd(preview.floorUsd)}</span></div><div class="leg-row"><span>Most you can lose</span><span>${usd(preview.maxLossUsd)}</span></div>` +
          (preview.blocked ? `<p class="warn-line">${preview.blocked} Raise the amount or pick a smaller floor.</p>` : `<button type="button" class="btn btn--primary" data-bin-confirm style="margin-top:12px">Open with a floor</button>`);
        const go = sizingEl.querySelector<HTMLButtonElement>("[data-bin-confirm]");
        go?.addEventListener("click", async () => {
          go.disabled = true;
          status.dataset.tone = "";
          try {
            status.textContent = "Lending the floor and opening every leg…";
            const records = await openFlooredBin(chosen, data.markets, amount, floorChoice, 3, timeboxEl.checked && !timeboxRow.hidden);
            status.textContent = `${bin.name} is open with ${usd(records.reduce((sum, r) => sum + r.floorUsd, 0))} held as the floor.`;
            await getPositions(true);
            void initHome();
          } catch (error) {
            status.dataset.tone = "error";
            status.textContent = withFundingHint(chosen.legs.map((l) => l.symbol), errorText(error));
            go.disabled = false;
          }
        });
      } catch (error) {
        fail(error);
      }
      return;
    }
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
