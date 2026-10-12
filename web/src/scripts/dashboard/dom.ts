import { assetLogoSources } from "shared";

export function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

export function changeClass(value: number): string {
  return value >= 0 ? "change-up" : "change-down";
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function markForSymbol(symbol: string): string {
  const name = symbol.split(":").pop() ?? symbol;
  const letter = esc(name.slice(0, 1).toUpperCase());
  const [first, ...rest] = assetLogoSources(symbol);
  const next = esc(rest.join(" "));
  return `<span class="row-mark row-mark--logo${first.endsWith(".svg") ? " row-mark--svg" : ""}"><img src="${esc(first)}" data-next="${next}" alt="" loading="lazy" onerror="var n=(this.dataset.next||'').split(' ').filter(Boolean);if(n.length){this.dataset.next=n.slice(1).join(' ');this.parentNode.classList.toggle('row-mark--svg',n[0].endsWith('.svg'));this.src=n[0];return}var s=this.nextElementSibling;this.parentNode.className='row-mark row-mark--letter';this.remove();s.hidden=false" /><span hidden>${letter}</span></span>`;
}

export function legStackHtml(symbols: string[]): string {
  return `<div class="leg-stack">${symbols.slice(0, 4).map(markForSymbol).join("")}</div>`;
}

export function say(el: HTMLElement, message: string, tone: "info" | "error" = "info") {
  el.textContent = message;
  el.dataset.tone = tone;
}

export function query<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  return root.querySelector<T>(selector)!;
}

type AvatarModule = typeof import("../../lib/avatar");
let avatarModule: AvatarModule | null = null;

export async function avatars(): Promise<AvatarModule> {
  avatarModule ??= await import("../../lib/avatar");
  return avatarModule;
}

export function withFundingHint(symbols: string | string[], message: string): string {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  if (!list.some((s) => s.includes(":")) || !/margin|perp|insufficient|balance|available/i.test(message)) return message;
  return `${message} Stocks and commodities trade from their own balance. Tap Move on Home to fund it.`;
}
