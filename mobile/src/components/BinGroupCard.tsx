import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { closeBin, maxOrderNotionalUsd, type BinGroup, type TradingAccount } from "shared";
import { removeBinRecords } from "../lib/binRecords";
import { agentExchange } from "../lib/hl";
import { displaySymbol, type MarketData } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { LegStack, AssetMark } from "./AssetMark";
import { Tag, ToneCard, tone } from "./ui";

function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  group: BinGroup;
  trader: TradingAccount;
  data: MarketData | null;
  onOpenAsset: (symbol: string) => void;
  onChanged: () => void;
};

export function BinGroupCard({ group, trader, data, onOpenAsset, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const pnl = group.legs.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const margin = group.legs.reduce((sum, p) => sum + p.marginUsed, 0);

  async function closeAll() {
    if (!data) return;
    setBusy(true);
    setStatus({ text: "Closing every leg…", failed: false });
    try {
      const results = await closeBin(await agentExchange(trader), group.legs, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
      const failed = results.filter((r) => r.error !== null || !(r.filledSize > 0));
      if (failed.length > 0) throw new Error(`Not closed: ${failed.map((r) => displaySymbol(r.symbol)).join(", ")}`);
      await removeBinRecords(trader.address, [group.record.id]);
      setStatus({ text: `${group.record.name} closed.`, failed: false });
      onChanged();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToneCard>
      <View style={styles.head}>
        <LegStack symbols={group.legs.map((p) => p.coin)} size={26} />
        <Text style={styles.title} numberOfLines={1}>{group.record.name.toUpperCase()}</Text>
        <Text style={[styles.pnl, { color: pnl >= 0 ? dark.green : dark.red }]}>{pnl >= 0 ? "+" : ""}{usd(pnl)}</Text>
      </View>
      <View style={styles.tags}>
        <Tag label="Bin" dot={tone.violet} />
        <Tag label={`${group.legs.length} legs`} />
        <Tag label={`Margin ${usd(margin)}`} />
      </View>
      {group.legs.map((leg) => (
        <Pressable key={leg.coin} onPress={() => onOpenAsset(leg.coin)} style={({ pressed }) => [styles.leg, pressed && styles.pressed]}>
          <AssetMark symbol={leg.coin} size={26} />
          <Text style={styles.legName}>{leg.size > 0 ? "Long" : "Short"} {displaySymbol(leg.coin)}</Text>
          <Text style={[styles.legPnl, { color: leg.unrealizedPnl >= 0 ? dark.green : dark.red }]}>{leg.unrealizedPnl >= 0 ? "+" : ""}{usd(leg.unrealizedPnl)}</Text>
          <Text style={styles.manage}>Manage ↗</Text>
        </Pressable>
      ))}
      <Pressable disabled={busy || !data} onPress={() => void closeAll()} style={({ pressed }) => [styles.close, (busy || !data) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.closeLabel}>{busy ? "Closing…" : "Close bin"}</Text>
      </Pressable>
      {status !== null && <Text style={[styles.status, status.failed && { color: dark.red }]}>{status.text}</Text>}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { flex: 1, fontFamily: family.semibold, fontSize: 18, letterSpacing: -0.5, color: dark.ink },
  pnl: { fontFamily: family.semibold, fontSize: 16 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  leg: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: dark.line },
  legName: { flex: 1, fontFamily: family.medium, fontSize: 15, color: dark.ink },
  legPnl: { fontFamily: family.medium, fontSize: 14 },
  manage: { fontFamily: family.semibold, fontSize: 13, color: dark.accent },
  close: { minHeight: touch, borderRadius: 999, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" },
  closeLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  status: { fontFamily: family.regular, fontSize: 13, color: dark.muted },
});
