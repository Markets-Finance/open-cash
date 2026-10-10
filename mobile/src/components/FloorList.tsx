import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FloorStatus, TradingAccount } from "shared";
import { closeProtected, loadFloorStatuses, rearmProtected } from "../lib/floor";
import { displaySymbol } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { ToneCard } from "./ui";

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FloorList({ trader, refreshKey }: { trader: TradingAccount; refreshKey?: number }) {
  const [statuses, setStatuses] = useState<FloorStatus[] | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    loadFloorStatuses(trader)
      .then(setStatuses)
      .catch((error) => setMessage({ text: error instanceof Error ? error.message : String(error), failed: true }));
  }, [trader]);

  useEffect(() => refresh(), [refresh, refreshKey]);

  async function act(status: FloorStatus, kind: "close" | "rearm") {
    setBusy(true);
    setMessage({ text: kind === "close" ? "Closing the trade and taking back the floor…" : "Waiting for your passkey…", failed: false });
    try {
      if (kind === "close") await closeProtected(trader, status);
      else await rearmProtected(trader, status);
      setMessage({ text: kind === "close" ? "Floor closed. The money is back in your trading balance." : "Re-armed.", failed: false });
      refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  if (statuses === null || statuses.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>FLOORS</Text>
      {message !== null && <Text style={message.failed ? styles.error : styles.muted}>{message.text}</Text>}
      {statuses.map((s) => (
        <ToneCard key={`${s.record.coin}-${s.record.openedAt}`}>
          <Text style={styles.title}>
            {s.record.isLong ? "LONG" : "SHORT"} {displaySymbol(s.record.coin)} {s.record.leverage}x
          </Text>
          <Text style={styles.muted}>
            Floor {usd(s.floorValueUsd)} · trade {s.knockedOut ? "closed out" : usd(s.sleeveValueUsd)} · total {usd(s.totalUsd)}
          </Text>
          {!s.knockedOut && <Text style={styles.muted}>Closed at {usd(s.knockOutPx)} ({(s.distanceToKnockOutPct * 100).toFixed(1)}% away)</Text>}
          <View style={styles.actions}>
            {s.knockedOut && (
              <Pressable disabled={busy} onPress={() => void act(s, "rearm")} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={styles.actionLabel}>Re-arm</Text>
              </Pressable>
            )}
            <Pressable disabled={busy} onPress={() => void act(s, "close")} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={styles.actionLabel}>Close</Text>
            </Pressable>
          </View>
        </ToneCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  section: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: dark.ink },
  title: { fontFamily: family.semibold, fontSize: 16, color: dark.ink },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1, minHeight: touch, borderRadius: 999, backgroundColor: "#29312e", alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  pressed: { opacity: 0.75 },
});
