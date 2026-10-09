import type { Address } from "viem";
import type { Bot } from "shared";

export function localBotStorage(owner: Address) {
  const key = `opencash.bots.${owner.toLowerCase()}`;
  return {
    async load(): Promise<Bot[]> {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "[]") as Bot[];
      } catch {
        return [];
      }
    },
    async save(bots: Bot[]): Promise<void> {
      try {
        localStorage.setItem(key, JSON.stringify(bots));
      } catch {
        return;
      }
    },
  };
}
