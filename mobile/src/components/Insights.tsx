import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { loadInsights, loadWallet, type Insights as InsightsData, type Network, type WalletView } from "../lib/insights";
import { displaySymbol } from "../lib/market";
import { dark, family, space, touch } from "../theme";
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

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function distanceColor(value: number | null): string {
  if (value === null) return tone.raised;
  return value < 5 ? tone.coral : value < 15 ? tone.butter : tone.lime;
}

export function Insights({ onOpenAsset }: { onOpenAsset: (symbol: string) => void }) {
  const [network, setNetwork] = useState<Network>("mainnet");
  const [data, setData] = useState<InsightsData | null>(null);
  const [address, setAddress] = useState("");
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setWallet(null);
    const run = () => loadInsights(network).then((next) => live && setData(next));
    void run();
    const timer = setInterval(run, refreshMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [network]);

  async function lookup(target: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(target)) {
      setWalletError("That is not a wallet address.");
      return;
    }
    setLooking(true);
    setWalletError(null);
    try {
      const next = await loadWallet(network, target);
      setWallet(next);
      if (!next.found) setWalletError(`${short(target)} has never used Hyperliquid on ${network}.`);
    } catch (error) {
      setWallet(null);
      setWalletError(error instanceof Error ? error.message : String(error));
    } finally {
      setLooking(false);
    }
  }

  const topMarkets = data?.protocol?.markets.slice(0, 8) ?? [];

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
              ["24h volume", compact(data.protocol.headline.volume24hUsd)],
              ["Open interest", compact(data.protocol.headline.openInterestUsd)],
              ["Markets", String(data.protocol.headline.markets)],
              ["HIP-3 share", data.protocol.headline.volume24hUsd > 0 ? `${Math.round((data.protocol.headline.hip3Volume24hUsd / data.protocol.headline.volume24hUsd) * 100)}%` : "—"],
            ].map(([label, value]) => (
              <View key={label} style={styles.tile}>
                <Text style={styles.tileLabel}>{label}</Text>
                <Text style={styles.tileValue}>{value}</Text>
              </View>
            ))}
          </View>
        </ToneCard>
      )}

      {topMarkets.length > 0 && (
        <ToneCard>
          <CardTitle>Biggest markets</CardTitle>
          {topMarkets.map((m) => (
            <Pressable key={m.symbol} onPress={() => onOpenAsset(m.symbol)} style={styles.row}>
              <AssetMark symbol={m.symbol} size={28} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{displaySymbol(m.symbol)}</Text>
                <Text style={styles.muted}>
                  {compact(m.volume24hUsd)} volume · {(m.shareVolume * 100).toFixed(1)}% · funding {m.fundingAprPct.toFixed(1)}% a year
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: m.changePct >= 0 ? dark.green : dark.red }]}>{`${m.changePct >= 0 ? "+" : "−"}${Math.abs(m.changePct).toFixed(2)}%`}</Text>
            </Pressable>
          ))}
        </ToneCard>
      )}

      {data?.leaderboard && data.leaderboard.rows.length > 0 && (
        <ToneCard>
          <CardTitle>Top wallets this week</CardTitle>
          <Text style={styles.muted}>Ranked by profit from Hyperliquid's own stats. Tap one to look inside.</Text>
          {data.leaderboard.rows.map((row) => (
            <Pressable key={row.address} onPress={() => { setAddress(row.address); void lookup(row.address); }} style={styles.row}>
              <Text style={styles.rank}>#{row.rank}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.displayName ?? short(row.address)}</Text>
                <Text style={styles.muted}>
                  {compact(row.equityUsd)} account · {row.roiPct.toFixed(1)}% return
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: row.pnlUsd >= 0 ? dark.green : dark.red }]}>{signed(row.pnlUsd)}</Text>
            </Pressable>
          ))}
        </ToneCard>
      )}

      <ToneCard>
        <CardTitle>Look up a wallet</CardTitle>
        <TextInput
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="0x… any Hyperliquid wallet"
          placeholderTextColor={dark.muted}
          style={styles.input}
        />
        <Pressable disabled={looking} onPress={() => void lookup(address.trim())} style={({ pressed }) => [styles.cta, looking && styles.ctaOff, pressed && styles.pressed]}>
          <Text style={styles.ctaLabel}>{looking ? "Reading…" : "Look up"}</Text>
        </Pressable>
        {walletError !== null && <Text style={styles.error}>{walletError}</Text>}
        {wallet?.found && (
          <View style={styles.result}>
            <Text style={styles.rowTitle}>
              {short(wallet.address)} · {compact(wallet.perpEquityUsd)}
            </Text>
            <Text style={styles.muted}>
              Unrealised {signed(wallet.unrealizedPnlUsd)} · realised {signed(wallet.recentFills.realizedPnlUsd)} · fees {compact(wallet.recentFills.feesUsd)} · win rate {wallet.recentFills.winRatePct.toFixed(0)}% · maker {wallet.recentFills.makerSharePct.toFixed(0)}% · liquidations {wallet.recentFills.liquidations}
            </Text>
            {wallet.positions.slice(0, 8).map((p) => (
              <Pressable key={p.coin} onPress={() => onOpenAsset(p.coin)} style={styles.row}>
                <AssetMark symbol={p.coin} size={28} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>
                    {displaySymbol(p.coin)} <Text style={{ color: p.size >= 0 ? dark.green : dark.red }}>{p.size >= 0 ? "long" : "short"}</Text>
                  </Text>
                  <Text style={styles.muted}>
                    {compact(p.positionValue)} · {p.leverage}x · {signed(p.unrealizedPnl)}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: distanceColor(p.liquidationDistancePct) }]}>
                  <Text style={styles.pillLabel}>{p.liquidationDistancePct === null ? "—" : `${p.liquidationDistancePct.toFixed(1)}%`}</Text>
                </View>
              </Pressable>
            ))}
            <Text style={styles.muted}>Fill statistics cover the wallet's last 2,000 fills only.</Text>
          </View>
        )}
      </ToneCard>
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
  input: { fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  cta: { minHeight: touch, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 14, color: dark.onAccent },
  pressed: { opacity: 0.75 },
  result: { gap: space.sm },
});
