import type * as templates from "shared";

const width = 640;
const height = 220;
const pad = 14;

export function equityChart(result: templates.SimResult, allocationUsd: number, uid: string, withMarkers = true): string {
  const points = result.equity;
  if (points.length < 2) return `<div class="lab__empty">Not enough candles yet.</div>`;
  const values = points.map((p) => p.equity);
  const low = Math.min(...values, allocationUsd);
  const high = Math.max(...values, allocationUsd);
  const span = high - low || 1;
  const t0 = points[0]!.time;
  const t1 = points[points.length - 1]!.time;
  const x = (time: number) => pad + ((time - t0) / (t1 - t0 || 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - low) / span) * (height - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)} ${y(p.equity).toFixed(1)}`).join("");
  const area = `${line}L${x(t1).toFixed(1)} ${height - pad}L${x(t0).toFixed(1)} ${height - pad}Z`;
  const base = y(allocationUsd).toFixed(1);
  const byTime = new Map(points.map((p) => [p.time, p.equity]));
  const marks = withMarkers
    ? result.markers
        .filter((m) => byTime.has(m.time))
        .slice(0, 80)
        .map((m) => `<circle class="mk mk--${m.kind}" cx="${x(m.time).toFixed(1)}" cy="${y(byTime.get(m.time)!).toFixed(1)}" r="3.5"/>`)
        .join("")
    : "";
  const up = (values[values.length - 1] ?? allocationUsd) >= allocationUsd;
  return `<svg class="eq eq--${up ? "up" : "down"}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Equity curve">
    <defs><pattern id="h-${uid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" stroke-width="1.4"/></pattern></defs>
    <path class="eq__area" d="${area}" fill="url(#h-${uid})"/>
    <line class="eq__base" x1="${pad}" x2="${width - pad}" y1="${base}" y2="${base}"/>
    <path class="eq__line" d="${line}" fill="none"/>
    ${marks}
  </svg>`;
}
