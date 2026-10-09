import { loadDesk, type HlDesk } from "shared";
import { info } from "../hl";
import { requireTrader } from "./state";

const deskTtlMs = 5_000;
let cached: { at: number; value: Promise<HlDesk> } | null = null;

export function getDesk(force = false): Promise<HlDesk> {
  if (force || cached === null || Date.now() - cached.at > deskTtlMs) {
    const value = loadDesk(info, requireTrader().address);
    cached = { at: Date.now(), value };
    value.catch(() => {
      cached = null;
    });
  }
  return cached.value;
}
