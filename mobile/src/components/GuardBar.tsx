import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { loadGuardStatus } from "../lib/guardrails";
import { dark, family, space } from "../theme";

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function GuardBar({ owner }: { owner: string }) {
  const [line, setLine] = useState<{ text: string; tone: "ok" | "warn" | "locked" } | null>(null);

  useEffect(() => {
    let live = true;
    const run = () =>
      loadGuardStatus(owner, null)
        .then(({ settings, verdict }) => {
          if (!live) return;
          const locked = verdict.lockedUntil !== null && verdict.lockedUntil > Date.now();
          setLine({
            tone: locked ? "locked" : verdict.remainingTodayUsd < settings.dailyLossLimitUsd * 0.25 ? "warn" : "ok",
            text: locked
              ? `New trades are paused until ${new Date(verdict.lockedUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Daily loss limit of ${usd(settings.dailyLossLimitUsd)} reached. Closing is always allowed.`
              : `Loss today ${usd(verdict.lossTodayUsd)} of ${usd(settings.dailyLossLimitUsd)} · ${usd(verdict.remainingTodayUsd)} left`,
          });
        })
        .catch(() => live && setLine(null));
    void run();
    const timer = setInterval(run, 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [owner]);

  if (line === null) return null;
  return (
    <View style={[styles.bar, line.tone === "warn" && styles.warn, line.tone === "locked" && styles.locked]}>
      <Text style={[styles.text, line.tone === "warn" && styles.warnText, line.tone === "locked" && styles.lockedText]}>{line.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "rgba(255, 255, 255, 0.06)" },
  warn: { backgroundColor: "rgba(255, 196, 82, 0.16)" },
  locked: { backgroundColor: "rgba(239, 91, 91, 0.18)" },
  text: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  warnText: { color: "#ffc452" },
  lockedText: { color: dark.red },
});
