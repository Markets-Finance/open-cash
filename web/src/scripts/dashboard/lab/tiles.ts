import * as templates from "shared";
import { esc, query } from "../dom";
import { runTemplate } from "./data";
import { pct, tone } from "./format";
import { glyph, meta } from "./meta";
import { labState, paramsFor } from "./state";

export function renderTiles() {
  const series = labState.series;
  const host = query("[data-lab-tiles]");
  if (!series) return;
  host.innerHTML = templates.library
    .map((template) => {
      const result = runTemplate(template, paramsFor(template), series, labState.allocationUsd);
      const m = result.metrics;
      const info = meta[template.id];
      return `<button type="button" class="tile tile--${info.tint}" data-lab-tile="${template.id}" aria-pressed="${labState.selected === template.id}">
        <span class="tile__head">
          <span class="tile__name">${esc(template.name)}</span>
          <span class="tile__tag" title="${esc(info.tag)}">${glyph(template.id)}</span>
        </span>
        <span class="tile__big tile__big--${tone(m.returnPct)}">${pct(m.returnPct)}</span>
        <span class="tile__stats">
          <span><small>Worst dip</small>${m.maxDrawdownPct.toFixed(1)}%</span>
          <span><small>Exits</small>${m.closingFills}</span>
          <span><small>Just hold</small>${pct(m.holdReturnPct)}</span>
        </span>
      </button>`;
    })
    .join("");
}
