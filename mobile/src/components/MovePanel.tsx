import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { loadBalances, moveFunds, venues, type TradingAccount, type Venue } from "shared";
import { info, mainExchange } from "../lib/hl";
import { dark, family, space, touch } from "../theme";

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MovePanel({ trader }: { trader: TradingAccount }) {
  const [balances, setBalances] = useState<Record<Venue, number> | null>(null);
  const [from, setFrom] = useState<Venue>("perp");
  const [to, setTo] = useState<Venue>("xyz");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  async function load() {
    setBalances(await loadBalances(info, trader.address).catch(() => null));
  }

  useEffect(() => {
    void load();
  }, [trader.address]);

  const value = Number(amount) || 0;
  const blocked = busy ? "Moving…" : from === to ? "Pick two different balances" : value <= 0 ? "Enter an amount" : balances !== null && value > balances[from] ? "More than that balance holds" : null;

  async function submit() {
    setBusy(true);
    setStatus({ text: "Moving…", failed: false });
    try {
      await moveFunds(mainExchange(trader), trader.address, value, from, to);
      setStatus({ text: `Moved ${usd(value)}.`, failed: false });
      setAmount("");
      await load();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  const pills = (current: Venue, set: (v: Venue) => void) => (
    <View style={styles.chips}>
      {venues.map((v) => (
        <Pressable key={v.key} onPress={() => set(v.key)} style={[styles.chip, current === v.key && styles.chipOn]}>
          <Text style={[styles.chipLabel, current === v.key && styles.chipLabelOn]}>{v.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.note}>Your money sits in three places on Hyperliquid. Each kind of trade uses its own. This only moves money inside your own account.</Text>
      {venues.map((v) => (
        <View key={v.key} style={styles.balanceRow}>
          <Text style={styles.note}>{v.label}</Text>
          <Text style={styles.balance}>{balances === null ? "…" : usd(balances[v.key])}</Text>
        </View>
      ))}
      <Text style={styles.label}>FROM</Text>
      {pills(from, setFrom)}
      <Text style={styles.label}>TO</Text>
      {pills(to, setTo)}
      <Text style={styles.note}>{venues.find((v) => v.key === to)?.hint}</Text>
      <Text style={styles.label}>AMOUNT (USDC)</Text>
      <View style={styles.amountRow}>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={dark.muted} style={styles.input} />
        <Pressable onPress={() => setAmount(String(Math.floor((balances?.[from] ?? 0) * 100) / 100))} style={styles.max}>
          <Text style={styles.chipLabel}>Max</Text>
        </Pressable>
      </View>
      <Pressable disabled={blocked !== null} onPress={() => void submit()} style={({ pressed }) => [styles.cta, blocked !== null && styles.ctaOff, pressed && styles.pressed]}>
        <Text style={styles.ctaLabel}>{blocked ?? `Move ${usd(value)}`}</Text>
      </Pressable>
      {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, backgroundColor: dark.surface },
  note: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  balanceRow: { flexDirection: "row", justifyContent: "space-between" },
  balance: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { minHeight: 34, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "#29312e", justifyContent: "center" },
  chipOn: { backgroundColor: dark.accent },
  chipLabel: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  chipLabelOn: { color: dark.onAccent },
  amountRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  input: { flex: 1, fontFamily: family.regular, fontSize: 18, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  max: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: "#29312e", justifyContent: "center" },
  cta: { minHeight: touch + space.sm, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.onAccent },
  pressed: { opacity: 0.75 },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  ok: { fontFamily: family.medium, fontSize: 13, color: dark.green },
});
