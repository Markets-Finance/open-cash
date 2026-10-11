import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TradingAccount } from "shared";
import { loadFloorStatuses } from "../lib/floor";
import { loadGuardStatus } from "../lib/guardrails";
import { displaySymbol } from "../lib/market";
import { dark, family, space } from "../theme";

const everyMs = 30_000;

type Alert = { key: string; tone: "warn" | "bad" | "info"; text: string };

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

async function collect(trader: TradingAccount): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const statuses = await loadFloorStatuses(trader).catch(() => []);
  for (const s of statuses) {
    const name = `${s.record.isLong ? "Long" : "Short"} ${displaySymbol(s.record.coin)}`;
    if (s.knockedOut) alerts.push({ key: `ko:${s.record.coin}:${s.record.openedAt}`, tone: "bad", text: `${name}: the trade part was closed out. Your floor of ${usd(s.floorValueUsd)} is safe. Re-arm or close it under Floors.` });
    else if (s.distanceToKnockOutPct * 100 < 5) alerts.push({ key: `near:${s.record.coin}:${s.record.openedAt}`, tone: "warn", text: `${name} is ${(s.distanceToKnockOutPct * 100).toFixed(1)}% from being closed out.` });
    const closeAt = s.record.closeAt;
    if (closeAt && closeAt > Date.now() && closeAt - Date.now() < 3_600_000) alerts.push({ key: `due:${s.record.coin}:${s.record.openedAt}`, tone: "info", text: `${name} closes by itself in ${Math.max(1, Math.round((closeAt - Date.now()) / 60_000))} min. Keep the app open.` });
  }
  const guard = await loadGuardStatus(trader.address, null).catch(() => null);
  const until = guard?.verdict.lockedUntil;
  if (until && until > Date.now()) alerts.push({ key: `lock:${until}`, tone: "bad", text: `New trades are paused until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. You reached your daily loss limit.` });
  return alerts;
}

export function AlertStrip({ trader }: { trader: TradingAccount }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let live = true;
    const run = () => collect(trader).then((next) => live && setAlerts(next));
    void run();
    const timer = setInterval(run, everyMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [trader]);

  if (alerts.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {alerts.map((a) => (
        <View key={a.key} style={[styles.bar, a.tone === "warn" && styles.warn, a.tone === "bad" && styles.bad]}>
          <Text style={[styles.text, a.tone === "warn" && styles.warnText, a.tone === "bad" && styles.badText]}>{a.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  bar: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "rgba(255, 255, 255, 0.06)" },
  warn: { backgroundColor: "rgba(255, 196, 82, 0.16)" },
  bad: { backgroundColor: "rgba(239, 91, 91, 0.18)" },
  text: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  warnText: { color: "#ffc452" },
  badText: { color: dark.red },
});
