import type * as templates from "shared";

type Meta = { tag: string; tint: string; glyph: string };

const glyphs = {
  trend: `<path d="M3 17l6-6 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  stack: `<path d="M5 8h14M5 12h14M5 16h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  grid: `<path d="M4 4v16M10 4v16M16 4v16M22 4v16M3 9h18M3 15h18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" transform="scale(.9) translate(1 1)"/>`,
  shield: `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`,
};

export const meta: Record<templates.TemplateId, Meta> = {
  donchian: { tag: "Trend", tint: "purple", glyph: glyphs.trend },
  dca: { tag: "Accumulate", tint: "lime", glyph: glyphs.stack },
  grid: { tag: "Range", tint: "blue", glyph: glyphs.grid },
  trail: { tag: "Protect", tint: "peach", glyph: glyphs.shield },
};

export function glyph(id: templates.TemplateId): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${meta[id].glyph}</svg>`;
}
