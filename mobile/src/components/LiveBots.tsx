import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { LiveAction } from "shared";
import { liveAct, loadLive, preflightLive, stopAllBots, type Preflight, type PublicLive } from "../lib/live";
import { dark, family, space, touch } from "../theme";
import { AssetMark } from "./AssetMark";
import { meta, money, price, tints } from "./labShared";
import { tone } from "./ui";

const refreshMs = 15_000;
const frames: Record<number, string> = { 300: "5m", 900: "15m", 1800: "30m", 3600: "1h", 14400: "4h", 86400: "1d" };

function confirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Yes", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export function PreflightView({ preflight }: { preflight: Preflight }) {
  return (
    <View style={styles.review}>
      {preflight.checks.map((c) => (
        <Text key={c.name} style={[styles.small, !c.ok && styles.bad]}>
          {c.ok ? "✓" : "✕"} {c.name}: {c.detail}
        </Text>
      ))}
      <Text style={styles.label}>ON THE LATEST CANDLE IT WOULD</Text>
      {preflight.intents.length === 0 ? <Text style={styles.small}>Do nothing yet. It acts when its signal appears.</Text> : preflight.intents.map((i, k) => <Text key={k} style={styles.small}>• {i}</Text>)}
      <Text style={styles.small}>Dry run. Nothing was sent.</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const signed = (value: number) => (value > 0 ? dark.green : value < 0 ? dark.red : undefined);

export function LiveBots({ refreshKey = 0, onOpenAsset }: { refreshKey?: number; onOpenAsset: (symbol: string) => void }) {
  const [bots, setBots] = useState<PublicLive[]>([]);
  const [runner, setRunner] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dry, setDry] = useState<Record<string, Preflight>>({});

  const refresh = useCallback(async () => {
    try {
      const next = await loadLive();
      setBots(next.bots);
      setRunner(next.runner);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(timer);
  }, [refresh, refreshKey]);

  async function act(id: string, action: LiveAction) {
    if (action === "close" && !(await confirm("Stop and close", "Cancel this bot's orders and close its position at market?"))) return;
    if (action === "remove" && !(await confirm("Remove bot", "Anything it has open is closed at market first."))) return;
    setBusy(id);
    setNote(null);
    try {
      await liveAct(id, action);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function runDry(id: string) {
    setBusy(id);
    try {
      const result = await preflightLive(id);
      setDry((prev) => ({ ...prev, [id]: result }));
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function stopAll(close: boolean) {
    const ok = await confirm(close ? "Stop all and close" : "Pause all bots", close ? "Stop every bot and close all bot positions at market?" : "Pause every bot? Positions and exchange stops stay in place.");
    if (!ok) return;
    try {
      setNote(await stopAllBots(close));
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
    await refresh();
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>LIVE STRATEGIES</Text>
      {!runner && <Text style={styles.small}>The server runner is off, so live bots will not act.</Text>}
      <View style={styles.row}>
        <Pressable onPress={() => void stopAll(false)} style={styles.btn}>
          <Text style={styles.btnLabel}>Pause all</Text>
        </Pressable>
        <Pressable onPress={() => void stopAll(true)} style={[styles.btn, styles.btnDanger]}>
          <Text style={[styles.btnLabel, styles.bad]}>Stop all and close</Text>
        </Pressable>
      </View>
      {note !== null && <Text style={styles.small}>{note}</Text>}
      {bots.length === 0 && <Text style={styles.small}>No live strategies yet. Pick one above and choose Real money.</Text>}
      {bots.map((bot) => {
        const m = bot.metrics;
        const statusColor = bot.status === "open" || bot.status === "watching" ? dark.green : bot.status === "halted" ? dark.red : dark.muted;
        return (
          <View key={bot.id} style={styles.card}>
            <View style={styles.row}>
              <Pressable onPress={() => onOpenAsset(bot.symbol)} style={styles.row} accessibilityLabel={`Trade ${bot.symbol}`}>
                <AssetMark symbol={bot.symbol} size={28} />
                <Text style={styles.name}>{bot.name} ↗</Text>
              </Pressable>
              <Text style={styles.pill}>{frames[bot.resolution] ?? `${bot.resolution}s`}</Text>
              <Text style={[styles.pill, { color: statusColor }]}>{bot.status}</Text>
            </View>
            <Text style={styles.small}>
              Allocation ${bot.allocationUsd} up to {bot.leverage}x · {bot.candlesSeen} candles run
              {bot.lastCheck ? ` · ${bot.lastCheck.message}` : ""}
            </Text>
            <View style={styles.stats}>
              {m && <Stat label="Net" value={`${money(m.netUsd)} · ${m.returnPct.toFixed(1)}%`} color={signed(m.netUsd)} />}
              {m && <Stat label="Realised" value={money(m.realizedUsd)} color={signed(m.realizedUsd)} />}
              {m && <Stat label="Open PnL" value={money(m.unrealizedUsd)} color={signed(m.unrealizedUsd)} />}
              {m && <Stat label="Fees" value={money(-m.feesUsd)} />}
              <Stat label="Orders sent" value={String(bot.orders)} />
              {m && <Stat label="Fills" value={String(m.fills)} />}
              {m && <Stat label="Position" value={m.positionSize === 0 ? "Flat" : `${m.positionSize} @ ${m.entryPx === null ? "—" : price(m.entryPx)}`} />}
              <Stat label="Stop" value={bot.stop ? price(bot.stop.px) : "None"} />
              <Stat label="Resting" value={String(bot.resting.length)} />
            </View>
            {dry[bot.id] && <PreflightView preflight={dry[bot.id]!} />}
            <View style={styles.row}>
              {bot.enabled ? (
                <Pressable disabled={busy === bot.id} onPress={() => void act(bot.id, "pause")} style={styles.btn}>
                  <Text style={styles.btnLabel}>Pause</Text>
                </Pressable>
              ) : (
                <Pressable disabled={busy === bot.id} onPress={() => void act(bot.id, "enable")} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={[styles.btnLabel, styles.btnPrimaryLabel]}>{bot.startedAt ? "Resume" : "Start"}</Text>
                </Pressable>
              )}
              <Pressable disabled={busy === bot.id} onPress={() => void act(bot.id, "close")} style={styles.btn}>
                <Text style={styles.btnLabel}>Stop and close</Text>
              </Pressable>
              <Pressable disabled={busy === bot.id} onPress={() => void runDry(bot.id)} style={styles.link}>
                <Text style={styles.linkLabel}>Dry run</Text>
              </Pressable>
              <Pressable disabled={busy === bot.id} onPress={() => void act(bot.id, "remove")} style={styles.link}>
                <Text style={styles.linkLabel}>Remove</Text>
              </Pressable>
            </View>
            {bot.log.slice(0, 5).map((entry, i) => (
              <Text key={`${entry.at}-${i}`} style={[styles.small, entry.level === "error" && styles.bad, entry.level === "action" && styles.ink]}>
                {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {entry.message}
              </Text>
            ))}
            <View style={[styles.stripe, { backgroundColor: tints[meta[bot.templateId].tint] }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted, marginTop: space.sm },
  card: { padding: space.lg, borderRadius: 28, backgroundColor: dark.surface, gap: space.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  name: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  pill: { fontFamily: family.medium, fontSize: 11, color: dark.muted, backgroundColor: dark.surfaceHover, paddingVertical: 3, paddingHorizontal: space.sm, borderRadius: 999, overflow: "hidden" },
  small: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  ink: { color: dark.ink },
  bad: { color: dark.red },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { width: "31%", flexGrow: 1, padding: space.sm, borderRadius: 14, backgroundColor: dark.surfaceHover, gap: 2 },
  statLabel: { fontFamily: family.regular, fontSize: 11, color: dark.muted },
  statValue: { fontFamily: family.semibold, fontSize: 13, color: dark.ink },
  review: { gap: space.xs },
  btn: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, borderWidth: 1, borderColor: dark.line, justifyContent: "center" },
  btnDanger: { borderColor: dark.red },
  btnPrimary: { backgroundColor: tints.lime, borderColor: tints.lime },
  btnLabel: { fontFamily: family.semibold, fontSize: 13, color: dark.ink },
  btnPrimaryLabel: { color: tone.ink },
  link: { minHeight: touch, justifyContent: "center", paddingHorizontal: space.xs },
  linkLabel: { fontFamily: family.medium, fontSize: 13, color: dark.muted },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
});
