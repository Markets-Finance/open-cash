import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { guardrailBounds, type Guardrails, type TradingAccount } from "shared";
import { loadStoredGuardrails, saveGuardrails } from "../lib/guardrails";
import { dark, family, space, touch } from "../theme";

function clock(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function LimitsPanel({ trader }: { trader: TradingAccount }) {
  const [daily, setDaily] = useState("");
  const [perTrade, setPerTrade] = useState("");
  const [coolOff, setCoolOff] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const stored = await loadStoredGuardrails(trader.address);
    setDaily(String(stored.settings.dailyLossLimitUsd));
    setPerTrade(String(stored.settings.maxLossPerTradeUsd));
    setCoolOff(String(stored.settings.coolOffMinutes));
    setNote(
      stored.pending
        ? `A looser limit is waiting and takes effect ${clock(stored.pending.effectiveAt)}. Tighter limits apply at once.`
        : "Tighter limits apply at once. Looser limits wait 24 hours so a bad moment cannot undo them.",
    );
  }

  useEffect(() => {
    void load();
  }, [trader.address]);

  async function save() {
    setBusy(true);
    setStatus({ text: "Waiting for your passkey…", failed: false });
    try {
      const settings: Guardrails = { dailyLossLimitUsd: Number(daily), maxLossPerTradeUsd: Number(perTrade), coolOffMinutes: Number(coolOff) };
      const { delayed } = await saveGuardrails(settings);
      setStatus({ text: delayed ? "Saved. The looser limit takes effect in 24 hours." : "Saved. The new limits apply now.", failed: false });
      await load();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.note}>
        New trades pause once you lose your daily limit, and every new trade must have a defined maximum loss. Closing is always allowed.
      </Text>
      <Text style={styles.label}>DAILY LOSS LIMIT (USD)</Text>
      <TextInput value={daily} onChangeText={setDaily} keyboardType="decimal-pad" style={styles.input} placeholderTextColor={dark.muted} />
      <Text style={styles.label}>MOST TO RISK ON ONE TRADE (USD)</Text>
      <TextInput value={perTrade} onChangeText={setPerTrade} keyboardType="decimal-pad" style={styles.input} placeholderTextColor={dark.muted} />
      <Text style={styles.label}>PAUSE AFTER A BREACH (MINUTES)</Text>
      <TextInput value={coolOff} onChangeText={setCoolOff} keyboardType="number-pad" style={styles.input} placeholderTextColor={dark.muted} />
      <Text style={styles.note}>
        Daily ${guardrailBounds.dailyLossLimitUsd.min}–{guardrailBounds.dailyLossLimitUsd.max.toLocaleString()}. Cool-off {guardrailBounds.coolOffMinutes.min} minutes to {guardrailBounds.coolOffMinutes.max / 1440} days.
      </Text>
      <Text style={styles.note}>{note}</Text>
      <Pressable disabled={busy} onPress={() => void save()} style={({ pressed }) => [styles.cta, busy && styles.ctaOff, pressed && styles.pressed]}>
        <Text style={styles.ctaLabel}>Save with my passkey</Text>
      </Pressable>
      {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, backgroundColor: dark.surface },
  note: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  input: { fontFamily: family.regular, fontSize: 15, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  cta: { minHeight: touch + space.sm, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.onAccent },
  pressed: { opacity: 0.75 },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  ok: { fontFamily: family.medium, fontSize: 13, color: dark.green },
});
