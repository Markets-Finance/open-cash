import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { maxOrderNotionalUsd, maxSleeveLeverage, previewFloor, type HlMarket, type TradingAccount } from "shared";
import { openProtected } from "../lib/floor";
import { displaySymbol } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { ToneCard } from "./ui";

const floors = [0.9, 0.8, 0.7];

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FloorCard({ trader, market, onOpened }: { trader: TradingAccount; market: HlMarket; onOpened: () => void }) {
  const [isLong, setIsLong] = useState(true);
  const [amount, setAmount] = useState("");
  const [floorPct, setFloorPct] = useState(0.8);
  const [leverage, setLeverage] = useState(3);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  const plan = useMemo(() => ({ market, amountUsd: Number(amount) || 0, floorPct, sleeveLeverage: leverage, isLong }), [market, amount, floorPct, leverage, isLong]);
  const preview = useMemo(() => {
    if (!(plan.amountUsd > 0)) return null;
    try {
      return { value: previewFloor(plan), error: null as string | null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [plan]);

  const problem =
    preview?.value == null
      ? null
      : preview.value.notionalUsd < 10
        ? "The traded position is below the $10 minimum. Raise the amount or the leverage."
        : preview.value.notionalUsd > maxOrderNotionalUsd
          ? `The traded position is above the ${usd(maxOrderNotionalUsd)} testnet cap. Lower the amount or the leverage.`
          : null;

  async function submit() {
    if (!preview?.value) return;
    setBusy(true);
    setStatus({ text: "Waiting for your passkey…", failed: false });
    try {
      const record = await openProtected(trader, plan, preview.value.floorUsd, preview.value.sleeveUsd);
      setStatus({ text: `${isLong ? "Long" : "Short"} ${displaySymbol(market.name)} is open with ${usd(record.floorUsd)} held as the floor.`, failed: false });
      setAmount("");
      onOpened();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = preview?.value
    ? [
        ["Lent as your floor", usd(preview.value.floorUsd)],
        ["Traded", `${usd(preview.value.sleeveUsd)} at ${leverage}x`],
        ["Position size", usd(preview.value.notionalUsd)],
        ["Most you can lose", usd(preview.value.maxLossUsd)],
        ["Trade is closed at", usd(preview.value.knockOutPx)],
      ]
    : [];

  return (
    <ToneCard>
      <Text style={styles.title}>KEEP A FLOOR</Text>
      <Text style={styles.muted}>Lend most of the money and trade with the rest. The most you can lose is the traded part.</Text>
      <View style={styles.chips}>
        {([true, false] as const).map((value) => (
          <Pressable key={String(value)} onPress={() => setIsLong(value)} style={[styles.chip, isLong === value && styles.chipOn]}>
            <Text style={[styles.chipLabel, isLong === value && styles.chipLabelOn]}>{value ? "Long" : "Short"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Text style={styles.cur}>$</Text>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Total to commit" placeholderTextColor={dark.muted} style={styles.input} />
      </View>
      <View style={styles.chips}>
        {floors.map((value) => (
          <Pressable key={value} onPress={() => setFloorPct(value)} style={[styles.chip, floorPct === value && styles.chipOn]}>
            <Text style={[styles.chipLabel, floorPct === value && styles.chipLabelOn]}>{Math.round(value * 100)}% floor</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chips}>
        {Array.from({ length: maxSleeveLeverage }, (_, i) => i + 1).map((value) => (
          <Pressable key={value} onPress={() => setLeverage(value)} style={[styles.chip, leverage === value && styles.chipOn]}>
            <Text style={[styles.chipLabel, leverage === value && styles.chipLabelOn]}>{value}x</Text>
          </Pressable>
        ))}
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.costRow}>
          <Text style={styles.muted}>{label}</Text>
          <Text style={styles.costValue}>{value}</Text>
        </View>
      ))}
      {preview?.error ? <Text style={styles.error}>{preview.error}</Text> : null}
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
      <Pressable
        disabled={busy || !preview?.value || problem !== null}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.cta, (busy || !preview?.value || problem !== null) && styles.ctaOff, pressed && styles.pressed]}
      >
        <Text style={styles.ctaLabel}>{isLong ? "Long" : "Short"} {displaySymbol(market.name)} with a floor</Text>
      </Pressable>
      {status !== null && <Text style={status.failed ? styles.error : styles.muted}>{status.text}</Text>}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: family.semibold, fontSize: 15, letterSpacing: -0.2, color: dark.ink },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cur: { fontFamily: family.light, fontSize: 26, color: dark.muted },
  input: { flex: 1, fontFamily: family.regular, fontSize: 18, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  chips: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  chip: { minHeight: 34, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "#29312e", justifyContent: "center" },
  chipOn: { backgroundColor: dark.accent },
  chipLabel: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  chipLabelOn: { color: dark.onAccent },
  costRow: { flexDirection: "row", justifyContent: "space-between" },
  costValue: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  cta: { minHeight: touch + space.sm, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.onAccent },
  pressed: { opacity: 0.75 },
});
