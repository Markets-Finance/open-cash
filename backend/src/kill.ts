import { existsSync } from "node:fs";

const flagPath = "data/kill-switch";

export function killed(): boolean {
  return process.env.KILL_SWITCH === "1" || existsSync(flagPath);
}
