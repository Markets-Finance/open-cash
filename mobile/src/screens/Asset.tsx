import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chartRanges, closeBin, maxOrderNotionalUsd, type Candle, type ChartRangeKey, type DepthSummary, type HlPosition, type MarketSnapshot, type TradingAccount } from "shared";
import { AssetMark } from "../components/AssetMark";
import { LineChart } from "../components/LineChart";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { OrderTicket } from "../components/OrderTicket";
import { RoundButton, Tag, ToneCard, tone } from "../components/ui";
import { agentExchange } from "../lib/hl";
import { displaySymbol, loadAccountDesk, loadCandles, loadMarkets, loadMarketView, type MarketData } from "../lib/market";
import { dark, family, space, touch } from "../theme";

const rangeKeys = Object.keys(chartRanges) as ChartRangeKey[];

function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function compact(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function stamp(time: number, range: ChartRangeKey): string {
  const date = new Date(time);
  return chartRanges[range].spanMs <= 86_400_000
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type AssetProps = {
  symbol: string;
  trader: TradingAccount;
  onBack: () => void;
  onSelectTab: (key: TabKey) => void;
  onStrategies: (symbol: string) => void;
};

export function Asset({ symbol, trader, onBack, onSelectTab, onStrategies }: AssetProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MarketData | null>(null);
  const [range, setRange] = useState<ChartRangeKey>("1d");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [depth, setDepth] = useState<DepthSummary | null>(null);
  const [positions, setPositions] = useState<HlPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshPositions() {
    loadAccountDesk(trader.address, true)
      .then((desk) => setPositions(desk.positions.filter((p) => p.coin === symbol)))
      .catch(() => {});
  }

  async function close(entry: HlPosition) {
    if (!data) return;
    setBusy(true);
    try {
      const [result] = await closeBin(await agentExchange(trader), [entry], data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
      if (result?.error) throw new Error(result.error);
      refreshPositions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    setError(null);
    loadMarkets()
      .then((markets) => {
        if (!live) return;
        setData(markets);
        loadAccountDesk(trader.address).then((desk) => live && setPositions(desk.positions.filter((p) => p.coin === symbol))).catch(() => {});
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    loadMarketView(symbol, trader.address)
      .then((view) => {
        if (!live) return;
        setSnapshot(view.snapshot);
        setDepth(view.depth);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [symbol, trader.address]);

  useEffect(() => {
    const target = data?.markets.get(symbol);
    if (!target) return;
    let live = true;
    setCandles(null);
    loadCandles(target.name, range)
      .then((next) => live && setCandles(next))
      .catch(() => live && setCandles([]));
    return () => {
      live = false;
    };
  }, [data, symbol, range]);

  const market = data?.markets.get(symbol) ?? null;
    const rangeChange =
    candles && candles.length >= 2 ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100 : null;
  const dayChange = snapshot?.change24hPct ?? null;

  const stats: { label: string; value: string }[] = [
    { label: "24h volume", value: snapshot ? compact(snapshot.volume24hUsd) : "—" },
    { label: "Open interest", value: snapshot ? compact(snapshot.openInterestUsd) : "—" },
    { label: "Spread", value: snapshot ? `${snapshot.spreadBps.toFixed(1)} bps` : "—" },
    { label: "Funding now", value: snapshot ? `${snapshot.funding.nowAprPct.toFixed(1)}% a year` : "—" },
    { label: "Funding avg 7d", value: snapshot ? `${snapshot.funding.meanAprPct.toFixed(1)}% a year` : "—" },
    { label: "Fees maker · taker", value: snapshot ? `${snapshot.makerFeeBps.toFixed(1)} · ${snapshot.takerFeeBps.toFixed(1)} bps` : "—" },
    { label: "Bids within 25 bps", value: depth ? compact(depth.bidUsdWithin25Bps) : "—" },
    { label: "Asks within 25 bps", value: depth ? compact(depth.askUsdWithin25Bps) : "—" },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <RoundButton glyph="←" label="Back" light onPress={onBack} />
          <Text style={styles.title}>{displaySymbol(symbol)}</Text>
          <Tag label={market?.dex ? `${market.dex} perp` : "Hyperliquid perp"} dot={tone.violet} />
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <ToneCard>
          <View style={styles.head}>
            <AssetMark symbol={symbol} size={48} />
            <View style={styles.flex}>
              <Text style={styles.name}>{displaySymbol(symbol)}</Text>
              <Text style={styles.onColorMuted}>Perpetual · USDC margin</Text>
            </View>
            <Text style={styles.price}>{market ? px(market.markPx) : "—"}</Text>
          </View>
          <View style={styles.tags}>
            {dayChange !== null && (
              <View style={styles.changeTag}>
                <Text style={[styles.changeText, { color: dayChange >= 0 ? dark.green : dark.red }]}>
                  {dayChange >= 0 ? "▲" : "▼"} {Math.abs(dayChange).toFixed(2)}% today
                </Text>
              </View>
            )}
            {rangeChange !== null && (
              <View style={styles.changeTag}>
                <Text style={[styles.changeText, { color: rangeChange >= 0 ? dark.green : dark.red }]}>
                  {rangeChange >= 0 ? "▲" : "▼"} {Math.abs(rangeChange).toFixed(2)}% over {range.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          {candles === null ? (
            <View style={styles.chartEmpty}>
              <ActivityIndicator color={tone.ink} />
            </View>
          ) : candles.length < 2 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.onColorMuted}>No trades in this range yet.</Text>
            </View>
          ) : (
            <LineChart values={candles.map((c) => c.close)} height={200} color={candles[candles.length - 1].close >= candles[0].open ? dark.green : dark.red} label={(i) => `${stamp(candles[i].time, range)} · ${px(candles[i].close)}`} />
          )}
          <View style={styles.ranges}>
            {rangeKeys.map((key) => (
              <Pressable key={key} onPress={() => setRange(key)} style={[styles.range, range === key && styles.rangeActive]}>
                <Text style={[styles.rangeLabel, range === key && styles.rangeLabelActive]}>{key.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </ToneCard>

        {data !== null && <OrderTicket trader={trader} data={data} symbol={symbol} onOpened={refreshPositions} />}

        {positions.map((entry) => {
          const long = entry.size >= 0;
          return (
            <ToneCard key={`${entry.dex}:${entry.coin}`}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>YOUR {long ? "LONG" : "SHORT"}</Text>
                  <Text style={styles.muted}>
                    {Math.abs(entry.size)} {displaySymbol(entry.coin)} · entry {px(entry.entryPx)} · margin {usd(entry.marginUsed)}
                  </Text>
                </View>
                <Text style={[styles.pnl, { color: entry.unrealizedPnl >= 0 ? dark.green : dark.red }]}>{usd(entry.unrealizedPnl)}</Text>
              </View>
              <Pressable disabled={busy} onPress={() => void close(entry)} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
                <Text style={styles.manageLabel}>Close position</Text>
              </Pressable>
            </ToneCard>
          );
        })}

        <ToneCard>
          <Text style={styles.sectionTitle}>MARKET DETAILS</Text>
          <View style={styles.grid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.muted}>Positive funding means longs pay shorts. Figures come from Hyperliquid testnet.</Text>
        </ToneCard>

        <Pressable onPress={() => onStrategies(symbol)} style={({ pressed }) => [styles.strategy, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>TEST A STRATEGY ON {displaySymbol(symbol)}</Text>
            <Text style={styles.muted}>See what breakout, DCA, grid or trailing stop would have done.</Text>
          </View>
          <Text style={styles.chevron}>↗</Text>
        </Pressable>
      </ScrollView>

      <TabBar active="trade" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  title: { flex: 1, fontFamily: family.semibold, fontSize: 30, letterSpacing: -1.2, color: dark.ink },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { fontFamily: family.semibold, fontSize: 20, letterSpacing: -0.6, color: dark.ink },
  onColorMuted: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  price: { fontFamily: family.medium, fontSize: 26, letterSpacing: -1, color: dark.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  changeTag: { paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: 999, backgroundColor: tone.raised },
  changeText: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  chartEmpty: { height: 200, alignItems: "center", justifyContent: "center" },
  ranges: { flexDirection: "row", gap: space.xs },
  range: { flex: 1, minHeight: touch, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: tone.raised },
  rangeActive: { backgroundColor: tone.paper },
  rangeLabel: { fontFamily: family.medium, fontSize: 12, color: dark.muted },
  rangeLabelActive: { color: tone.ink },
  actions: { flexDirection: "row", gap: space.md },
  action: { flex: 1, minHeight: 56, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: family.semibold, fontSize: 16, color: tone.ink },
  sectionTitle: { fontFamily: family.semibold, fontSize: 15, letterSpacing: -0.2, color: dark.ink },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  pnl: { fontFamily: family.semibold, fontSize: 18 },
  manage: { minHeight: touch, borderRadius: 999, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" },
  manageLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { width: "48%", flexGrow: 1, padding: space.md, borderRadius: 18, backgroundColor: tone.raised, gap: 4 },
  statLabel: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  statValue: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  strategy: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: 28, backgroundColor: tone.card },
  chevron: { fontFamily: family.semibold, fontSize: 22, color: dark.ink },
});
