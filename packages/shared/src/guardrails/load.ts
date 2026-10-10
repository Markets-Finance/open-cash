import type { InfoClient } from "@nktkas/hyperliquid";
import { getAccount } from "../hl/positions.js";
import { computeLoss, utcDayStart } from "./evaluate.js";
import type { GuardrailLoss } from "./types.js";

export async function loadGuardrailLoss(
  info: InfoClient,
  user: `0x${string}`,
  now: number = Date.now(),
  dexes: string[] = ["", "xyz"],
): Promise<GuardrailLoss> {
  const start = utcDayStart(now);
  const [fills, fundings, accounts] = await Promise.all([
    info.userFillsByTime({ user, startTime: start, endTime: now }),
    info.userFunding({ user, startTime: start, endTime: now }),
    Promise.all(dexes.map((dex) => getAccount(info, user, dex))),
  ]);
  const unrealisedPnls = accounts.flatMap((a) => a.positions.map((p) => p.unrealizedPnl));
  return computeLoss({ fills, fundings, unrealisedPnls, now });
}
