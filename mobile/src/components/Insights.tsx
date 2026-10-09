import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { loadInsights, type HeldRow, type Insights as InsightsData, type Network } from "../lib/insights";
import { dark, family, space } from "../theme";
import { AssetMark } from "./AssetMark";
import { CardTitle, SelectPill, ToneCard, tone } from "./ui";

const refreshMs = 60_000;

function compact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(abs < 10 ? 2 : 0)}`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${compact(Math.abs(value))}`;
}

function short(address: string | null, accountId: number): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : `account ${accountId}`;
}

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

function distanceColor(value: number | null): string {
  if (value === null) return tone.raised;
  return value < 5 ? tone.coral : value < 15 ? tone.butter : tone.lime;
}

export function Insights({ onOpenAsset }: { onOpenAsset: (symbol: string) => void }) {
  const [network, setNetwork] = useState<Network>("mainnet");
  const [data, setData] = useState<InsightsData | null>(null);
  const [mode, setMode] = useState<"largest" | "nearest">("largest");

  useEffect(() => {
    let live = true;
    setData(null);
    const run = () => loadInsights(network).then((next) => live && setData(next));
    void run();
    const timer = setInterval(run, refreshMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [network]);

  const rows: HeldRow[] = data?.positions ? (mode === "largest" ? data.positions.largest : data.positions.nearest).slice(0, 8) : [];
  const peak = Math.max(...(data?.liquidations?.hours.map((hour) => hour.count) ?? [1]), 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.network}>
        <SelectPill label="Mainnet" active={network === "mainnet"} onPress={() => setNetwork("mainnet")} />
        <SelectPill label="Testnet" active={network === "testnet"} onPress={() => setNetwork("testnet")} />
      </View>

      {data === null && <ActivityIndicator color={dark.ink} />}
      {data !== null && data.errors.length > 0 && <Text style={styles.error}>{data.errors[0]}</Text>}

      {data?.protocol && (
        <ToneCard>
          <CardTitle>Hyperliquid today</CardTitle>
          <View style={styles.tiles}>
            {[
              ["24h volume", compact(data.protocol.headline.volume24h)],
              ["7d volume", compact(data.protocol.headline.volume7d)],
              ["Open interest", compact(data.protocol.headline.openInterest)],
              ["TVL", compact(data.protocol.headline.tvl)],
            ].map(([label, value]) => (
              <View key={label} style={styles.tile}>
                <Text style={styles.tileLabel}>{label}</Text>
                <Text style={styles.tileValue}>{value}</Text>
              </View>
            ))}
          </View>
        </ToneCard>
      )}

      {data?.liquidations && (
        <ToneCard>
          <CardTitle>Liquidations</CardTitle>
          <Text style={styles.muted}>
            {data.liquidations.count === 0
              ? "None in the last 24 hours."
              : `${data.liquidations.count} in the last 24h, ${compact(data.liquidations.lossUsd)} lost.`}
          </Text>
          <View style={styles.bars}>
            {data.liquidations.hours.map((hour) => (
              <View
                key={hour.t}
                style={[styles.bar, { height: `${Math.max(6, (hour.count / peak) * 100)}%`, backgroundColor: hour.count > 0 ? tone.coral : tone.raised }]}
              />
            ))}
          </View>
          {data.liquidations.recent.slice(0, 5).map((row) => (
            <View key={`${row.t}-${row.accountId}`} style={styles.row}>
              <AssetMark symbol={row.symbol} size={28} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.symbol}</Text>
                <Text style={styles.muted}>
                  {short(row.address, row.accountId)} · {ago(row.t)}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: dark.red }]}>{signed(-row.lossUsd)}</Text>
            </View>
          ))}
        </ToneCard>
      )}

      {data?.positions && (
        <ToneCard>
          <CardTitle>Large positions</CardTitle>
          <Text style={styles.muted}>
            {data.positions.openPositions} open, {compact(data.positions.openNotionalUsd)} across the {data.positions.scanned} most active wallets.
          </Text>
          <View style={styles.network}>
            <SelectPill label="Largest" active={mode === "largest"} onPress={() => setMode("largest")} />
            <SelectPill label="Nearest liquidation" active={mode === "nearest"} onPress={() => setMode("nearest")} />
          </View>
          {rows.map((row, index) => (
            <Pressable key={`${row.accountId}-${row.symbol}-${index}`} onPress={() => onOpenAsset(row.symbol)} style={styles.row}>
              <AssetMark symbol={row.symbol} size={28} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {row.symbol} <Text style={{ color: row.side === "long" ? dark.green : dark.red }}>{row.side}</Text>
                </Text>
                <Text style={styles.muted}>
                  {short(row.address, row.accountId)} · {compact(row.notionalUsd)}
                  {row.leverage === null ? "" : ` · ${row.leverage.toFixed(1)}x`}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: distanceColor(row.liquidationDistancePct) }]}>
                <Text style={styles.pillLabel}>{row.liquidationDistancePct === null ? "—" : `${row.liquidationDistancePct.toFixed(1)}%`}</Text>
              </View>
            </Pressable>
          ))}
        </ToneCard>
      )}

      {data?.wallets && data.wallets.rows.length > 0 && (
        <ToneCard>
          <CardTitle>Top wallets</CardTitle>
          <Text style={styles.muted}>
            {data.wallets.backfilling ? "Still indexing history. " : ""}Ranked by realised PnL over {data.wallets.indexedHours >= 48 ? `${(data.wallets.indexedHours / 24).toFixed(1)} days` : `${data.wallets.indexedHours.toFixed(0)} hours`}.
          </Text>
          {data.wallets.rows.map((row) => (
            <View key={row.accountId} style={styles.row}>
              <Text style={styles.rank}>#{row.rank}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{short(row.address, row.accountId)}</Text>
                <Text style={styles.muted}>
                  {Math.round(row.winRate * 100)}% wins · {row.closedTrades} trades · {row.tier}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: row.netPnlUsd >= 0 ? dark.green : dark.red }]}>{signed(row.netPnlUsd)}</Text>
            </View>
          ))}
        </ToneCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  network: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { width: "48%", padding: space.md, borderRadius: 18, backgroundColor: tone.raised, gap: 4 },
  tileLabel: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  tileValue: { fontFamily: family.semibold, fontSize: 20, letterSpacing: -0.5, color: dark.ink },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 56 },
  bar: { flex: 1, borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  rowValue: { fontFamily: family.semibold, fontSize: 15 },
  rank: { width: 32, fontFamily: family.medium, fontSize: 13, color: dark.muted },
  pill: { minWidth: 58, paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: 999, alignItems: "center" },
  pillLabel: { fontFamily: family.semibold, fontSize: 12, color: tone.ink },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
});
