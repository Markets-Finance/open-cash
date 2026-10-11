import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { groupFloors, type FloorStatus, type TradingAccount } from "shared";
import { closeProtectedGroup, loadFloorStatuses, rearmProtected } from "../lib/floor";
import { displaySymbol } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { ToneCard } from "./ui";

const refreshMs = 60_000;

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function until(ms: number): string {
  const minutes = Math.round((ms - Date.now()) / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 90) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}

export function FloorList({ trader, refreshKey }: { trader: TradingAccount; refreshKey?: number }) {
  const [statuses, setStatuses] = useState<FloorStatus[] | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const closing = useRef(false);

  const closeGroup = useCallback(
    async (items: FloorStatus[], reason: string, refresh: () => void) => {
      if (closing.current) return;
      closing.current = true;
      setBusy(true);
      setMessage({ text: reason, failed: false });
      try {
        await closeProtectedGroup(trader, items);
        setMessage({ text: "Closed. The money is back in your trading balance.", failed: false });
        refresh();
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : String(error), failed: true });
      } finally {
        closing.current = false;
        setBusy(false);
      }
    },
    [trader],
  );

  const refresh = useCallback(() => {
    loadFloorStatuses(trader)
      .then((next) => {
        setStatuses(next);
        const due = groupFloors(next).find((g) => g.closeAt !== null && g.closeAt <= Date.now());
        if (due) void closeGroup(due.items, "The timed floor reached its reopen time. Closing…", refresh);
      })
      .catch((error) => setMessage({ text: error instanceof Error ? error.message : String(error), failed: true }));
  }, [trader, closeGroup]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, [refresh, refreshKey]);

  async function rearm(status: FloorStatus) {
    setBusy(true);
    setMessage({ text: "Waiting for your passkey…", failed: false });
    try {
      await rearmProtected(trader, status);
      setMessage({ text: "Re-armed.", failed: false });
      refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  if (statuses === null || statuses.length === 0) return null;
  const groups = groupFloors(statuses);
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>FLOORS</Text>
      {message !== null && <Text style={message.failed ? styles.error : styles.muted}>{message.text}</Text>}
      {groups.map((group) => {
        const items = group.items;
        const floorValue = items.reduce((sum, s) => sum + s.floorValueUsd, 0);
        const tradeValue = items.reduce((sum, s) => sum + (s.knockedOut ? 0 : s.sleeveValueUsd), 0);
        const out = items.filter((s) => s.knockedOut).length;
        const nearest = items.filter((s) => !s.knockedOut).sort((a, b) => a.distanceToKnockOutPct - b.distanceToKnockOutPct)[0];
        const title = group.binId ? `${group.binId} bin · ${items.length} legs` : `${items[0].record.isLong ? "LONG" : "SHORT"} ${displaySymbol(items[0].record.coin)} ${items[0].record.leverage}x`;
        return (
          <ToneCard key={group.key}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.muted}>
              You can't end below {usd(floorValue)} · trade {out === items.length ? "closed out" : usd(tradeValue)}{out > 0 && out < items.length ? ` (${out} closed out)` : ""} · total {usd(floorValue + tradeValue)}
            </Text>
            {nearest && <Text style={styles.muted}>Closed at {usd(nearest.knockOutPx)} ({(nearest.distanceToKnockOutPct * 100).toFixed(1)}% away)</Text>}
            {group.closeAt !== null && <Text style={styles.muted}>Closes by itself {until(group.closeAt)} while the app is open.</Text>}
            <View style={styles.actions}>
              {out > 0 && items.length === 1 && (
                <Pressable disabled={busy} onPress={() => void rearm(items[0])} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Text style={styles.actionLabel}>Re-arm</Text>
                </Pressable>
              )}
              <Pressable disabled={busy} onPress={() => void closeGroup(items, "Closing the trade and taking back the floor…", refresh)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={styles.actionLabel}>Close</Text>
              </Pressable>
            </View>
          </ToneCard>
        );
      })}
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
