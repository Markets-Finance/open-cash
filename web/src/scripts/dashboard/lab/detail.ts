import * as templates from "shared";
import { defaultLimits } from "shared";
import { esc, query } from "../dom";
import { equityChart } from "./chart";
import { runTemplate } from "./data";
import { money, pct, tone } from "./format";
import { glyph, meta } from "./meta";
import { addPaperBot } from "./paper";
import { labState, paramsFor, type Stage } from "./state";

const stages: { id: Stage; label: string }[] = [
  { id: "simulate", label: "Simulate" },
  { id: "paper", label: "Paper" },
  { id: "live", label: "Live" },
];

function paramRow(spec: templates.ParamSpec, value: number): string {
  if (spec.options) {
    const buttons = spec.options
      .map((o) => `<button type="button" class="seg__btn" data-param-option="${spec.key}" data-value="${o.value}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`)
      .join("");
    return `<div class="param"><span class="param__label">${esc(spec.label)}</span><div class="seg">${buttons}</div></div>`;
  }
  return `<label class="param">
    <span class="param__label">${esc(spec.label)}<b data-param-out="${spec.key}">${value}${spec.unit ? ` ${esc(spec.unit)}` : ""}</b></span>
    <input type="range" data-param="${spec.key}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" />
  </label>`;
}

function stageBody(stage: Stage): string {
  if (stage === "simulate") {
    return `<p class="run__text">Replay only. Nothing is placed. Move the sliders and watch the result change.</p>
      <button type="button" class="btn" disabled>Nothing to start</button>`;
  }
  if (stage === "paper") {
    return `<p class="run__text">Runs on live prices with fills simulated. It acts when each candle closes, so the first move comes after the next one.</p>
      <button type="button" class="btn btn--primary" data-lab-paper>Start paper bot</button>`;
  }
  return `<p class="run__text">Real orders under the allocation cap. Unlocks after a paper run of 24 hours. Order placement for these strategies ships after the first real testnet order is verified.</p>
      <button type="button" class="btn" disabled>Locked</button>`;
}

export function renderDetail() {
  const host = query("[data-lab-detail]");
  const id = labState.selected;
  if (!id) {
    host.hidden = true;
    return;
  }
  const template = templates.templateById(id);
  const params = paramsFor(template);
  const info = meta[id];
  host.hidden = false;
  host.innerHTML = `
    <div class="lab__result card" data-lab-result></div>
    <div class="lab__side">
      <div class="card lab__params">
        <span class="lab__kicker"><span class="tile__tag tile__tag--${info.tint}">${glyph(id)}</span>${esc(template.name)}</span>
        <p class="lab__blurb">${esc(template.blurb)}</p>
        ${template.params.map((spec) => paramRow(spec, params[spec.key] ?? spec.min)).join("")}
      </div>
      <div class="card lab__run">
        <div class="seg" role="tablist">${stages.map((s) => `<button type="button" class="seg__btn" data-lab-stage="${s.id}" aria-pressed="${labState.stage === s.id}">${s.label}</button>`).join("")}</div>
        <label class="param">
          <span class="param__label">Allocation cap<b data-alloc-out>$${labState.allocationUsd}</b></span>
          <input type="range" data-lab-allocation min="10" max="${defaultLimits.maxMarginUsd}" step="10" value="${labState.allocationUsd}" />
        </label>
        <div data-lab-stage-body>${stageBody(labState.stage)}</div>
        <p class="status-line" data-lab-status></p>
      </div>
    </div>`;
  paintResult();
}

export function paintResult() {
  const series = labState.series;
  const id = labState.selected;
  if (!series || !id) return;
  const template = templates.templateById(id);
  const result = runTemplate(template, paramsFor(template), series, labState.allocationUsd);
  const m = result.metrics;
  const days = Math.max(1, Math.round((series.candles.length * series.resolution) / 86_400));
  const win = m.winRatePct === null ? "—" : `${m.winRatePct.toFixed(0)}%`;
  query("[data-lab-result]").innerHTML = `
    <div class="result__top">
      <span class="lab__kicker">${esc(series.market.name)} · ${days} days · real Hyperliquid prices</span>
      <span class="result__vs">Just holding: ${pct(m.holdReturnPct)}</span>
    </div>
    <div class="result__big result__big--${tone(m.returnPct)}">${pct(m.returnPct)}</div>
    ${equityChart(result, labState.allocationUsd, "detail")}
    <div class="metrics">
      <div class="metric metric--lime"><small>Net</small><b>${money(m.netPnlUsd)}</b></div>
      <div class="metric metric--purple"><small>Worst dip</small><b>${m.maxDrawdownPct.toFixed(1)}%</b></div>
      <div class="metric metric--white"><small>Winning exits</small><b>${win}</b></div>
      <div class="metric metric--dark"><small>Fees · funding</small><b>${money(-m.feesUsd)} · ${money(m.fundingUsd)}</b></div>
    </div>
    <p class="lab__foot">${m.closingFills} exits, in the market ${m.exposurePct.toFixed(0)}% of the time. Includes Hyperliquid fees, ${templates.defaultSimOptions.slippageBps} bps slippage and funding. ${m.liquidated ? "This setting would have been liquidated." : ""}</p>`;
}

export function initDetail() {
  const host = query("[data-lab-detail]");

  host.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const id = labState.selected;
    if (!id) return;
    const template = templates.templateById(id);
    if (input.dataset.param) {
      const spec = template.params.find((p) => p.key === input.dataset.param)!;
      paramsFor(template)[spec.key] = Number(input.value);
      query(`[data-param-out="${spec.key}"]`).textContent = `${input.value}${spec.unit ? ` ${spec.unit}` : ""}`;
      paintResult();
      document.dispatchEvent(new CustomEvent("lab:changed"));
    }
    if (input.hasAttribute("data-lab-allocation")) {
      labState.allocationUsd = Number(input.value);
      query("[data-alloc-out]").textContent = `$${input.value}`;
      paintResult();
      document.dispatchEvent(new CustomEvent("lab:changed"));
    }
  });

  host.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const id = labState.selected;
    if (!id) return;
    const template = templates.templateById(id);
    const option = target.closest<HTMLElement>("[data-param-option]");
    if (option) {
      paramsFor(template)[option.dataset.paramOption!] = Number(option.dataset.value);
      host.querySelectorAll<HTMLElement>(`[data-param-option="${option.dataset.paramOption}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b === option)));
      paintResult();
      document.dispatchEvent(new CustomEvent("lab:changed"));
    }
    const stage = target.closest<HTMLElement>("[data-lab-stage]");
    if (stage) {
      labState.stage = stage.dataset.labStage as Stage;
      host.querySelectorAll<HTMLElement>("[data-lab-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b === stage)));
      query("[data-lab-stage-body]").innerHTML = stageBody(labState.stage);
    }
    if (target.closest("[data-lab-paper]") && labState.series) {
      const status = query("[data-lab-status]");
      await addPaperBot(template, { ...paramsFor(template) }, labState.series, labState.allocationUsd);
      status.dataset.tone = "info";
      status.textContent = "Paper bot started. It is under Your bots.";
    }
  });
}
