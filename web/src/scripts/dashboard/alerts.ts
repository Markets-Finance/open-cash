import { displaySymbol } from "./market";
import { loadFloorStatuses } from "./floor";
import { loadGuardStatus } from "./guardrails";
import { session } from "./state";
import { usd } from "./dom";

const everyMs = 30_000;
const nearPct = 5;
const dueSoonMs = 60 * 60_000;
const seen = new Set<string>();

type Alert = { key: string; tone: "warn" | "bad" | "info"; text: string };

async function collect(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const statuses = await loadFloorStatuses().catch(() => []);
  for (const s of statuses) {
    const name = `${s.record.isLong ? "Long" : "Short"} ${displaySymbol(s.record.coin)}`;
    if (s.knockedOut) alerts.push({ key: `ko:${s.record.coin}:${s.record.openedAt}`, tone: "bad", text: `${name}: the trade part was closed out. Your floor of ${usd(s.floorValueUsd)} is safe. Re-arm or close it in Floors.` });
    else if (s.distanceToKnockOutPct * 100 < nearPct) alerts.push({ key: `near:${s.record.coin}:${s.record.openedAt}`, tone: "warn", text: `${name} is ${(s.distanceToKnockOutPct * 100).toFixed(1)}% from being closed out.` });
    const closeAt = s.record.closeAt;
    if (closeAt && closeAt - Date.now() < dueSoonMs && closeAt > Date.now()) alerts.push({ key: `due:${s.record.coin}:${s.record.openedAt}`, tone: "info", text: `${name} closes by itself in ${Math.max(1, Math.round((closeAt - Date.now()) / 60_000))} min. Keep this page open.` });
  }
  const guard = await loadGuardStatus(null).catch(() => null);
  const until = guard?.verdict.lockedUntil;
  if (until && until > Date.now()) alerts.push({ key: `lock:${until}`, tone: "bad", text: `New trades are paused until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. You reached your daily loss limit.` });
  else if (guard && guard.verdict.remainingTodayUsd < guard.settings.dailyLossLimitUsd * 0.2) alerts.push({ key: `low:${new Date().toDateString()}`, tone: "warn", text: `Only ${usd(guard.verdict.remainingTodayUsd)} left of today's loss limit.` });
  return alerts;
}

function notify(alert: Alert) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || seen.has(alert.key)) return;
  seen.add(alert.key);
  try {
    new Notification("OpenCash", { body: alert.text });
  } catch {
    return;
  }
}

async function paint() {
  const strip = document.querySelector<HTMLElement>("[data-alert-strip]");
  if (!strip || !session.trader) return;
  const alerts = await collect();
  alerts.forEach(notify);
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";
  strip.hidden = alerts.length === 0 && !canAsk;
  strip.innerHTML =
    alerts.map((a) => `<div class="alert alert--${a.tone}">${a.text}</div>`).join("") +
    (canAsk ? `<button type="button" class="link-btn" data-alerts-enable>Turn on alerts for knock-outs, close-outs and loss limits</button>` : "");
}

export function startAlerts() {
  const strip = document.querySelector<HTMLElement>("[data-alert-strip]");
  strip?.addEventListener("click", async (event) => {
    if ((event.target as HTMLElement).closest("[data-alerts-enable]")) {
      await Notification.requestPermission().catch(() => undefined);
      void paint();
    }
  });
  void paint();
  setInterval(() => void paint(), everyMs);
  document.addEventListener("floor:changed", () => void paint());
  document.addEventListener("guard:changed", () => void paint());
}
