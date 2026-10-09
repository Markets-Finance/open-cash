import type * as templates from "shared";

export const tints = { purple: "#8f7cf5", lime: "#b4f58c", blue: "#6fb7f2", peach: "#f2b98b" } as const;

export const meta: Record<templates.TemplateId, { tint: keyof typeof tints; glyph: string; tag: string }> = {
  donchian: { tint: "purple", glyph: "↗", tag: "Follows big moves up or down" },
  dca: { tint: "lime", glyph: "≡", tag: "Buys a little on a schedule" },
  grid: { tint: "blue", glyph: "▦", tag: "Buys dips, sells bounces in a range" },
  trail: { tint: "peach", glyph: "◇", tag: "Rides one trade, exits on a pullback" },
};

export function pct(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function money(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sample(values: number[], max = 90): number[] {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]!);
}

export function price(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 4 })}`;
}
