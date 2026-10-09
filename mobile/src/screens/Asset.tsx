import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { perpl, summarizeDepth, type DepthSummary, type MarketSnapshot, type TradingAccount } from "shared";
import { AssetMark } from "../components/AssetMark";
import { LineChart } from "../components/LineChart";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { OrderTicket } from "../components/OrderTicket";
import { RoundButton, Tag, ToneCard, tone } from "../components/ui";
import { toolbox } from "../lib/bots";
import { flowText, loadPulses, stanceLabel } from "../lib/nansen";
import {
  candleRanges,
  loadCandles,
  closePosition,
  loadMarkets,
  loadOpenPositions,
  type Candle,
  type CandleRangeKey,
  type MarketData,
  type OpenPosition,
} from "../lib/perpl";
import { dark, family, space, touch } from "../theme";

const rangeKeys = Object.keys(candleRanges) as CandleRangeKey[];

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

function stamp(time: number, range: CandleRangeKey): string {
  const date = new Date(time);
  return candleRanges[range].spanMs <= 86_400_000
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
  const [range, setRange] = useState<CandleRangeKey>("1d");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [depth, setDepth] = useState<DepthSummary | null>(null);
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshPositions(markets: MarketData) {
    loadOpenPositions(trader.address, markets)
      .then((held) => setPositions(held.filter((p) => p.market.symbol === symbol)))
      .catch(() => {});
  }

  async function close(entry: OpenPosition) {
    if (!data) return;
    setBusy(true);
    try {
      await closePosition(trader, entry);
      refreshPositions(data);
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
        loadOpenPositions(trader.address, markets).then((held) => live && setPositions(held.filter((p) => p.market.symbol === symbol))).catch(() => {});
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    toolbox
      .getSnapshot(symbol)
      .then(({ snapshot: next }) => live && setSnapshot(next))
      .catch(() => {});
    toolbox
      .getBook(symbol)
      .then((book) => {
        const mid = book.bids[0] && book.asks[0] ? (book.bids[0].price + book.asks[0].price) / 2 : 0;
        if (live && mid > 0) setDepth(summarizeDepth(book, mid));
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
    loadCandles(target, range)
      .then((next) => live && setCandles(next))
      .catch(() => live && setCandles([]));
    return () => {
      live = false;
    };
  }, [data, symbol, range]);

  const market = data?.markets.get(symbol) ?? null;
  const cap = data?.maxLeverage.get(symbol) ?? snapshot?.maxLeverage ?? null;
  const rangeChange =
    candles && candles.length >= 2 ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100 : null;
  const dayChange = snapshot?.change24hPct ?? null;

  const [smart, setSmart] = useState<Awaited<ReturnType<typeof loadPulses>>>(null);
  useEffect(() => {
    let live = true;
    loadPulses([symbol]).then((next) => live && setSmart(next));
    return () => {
      live = false;
    };
  }, [symbol]);
  const pulse = smart?.get(symbol.toUpperCase());

  const stats: { label: string; value: string }[] = [
    { label: "24h volume", value: snapshot ? compact(snapshot.volume24hUsd) : "—" },
    { label: "Open interest", value: snapshot ? compact(snapshot.openInterestUsd) : "—" },
    { label: "Spread", value: snapshot ? `${snapshot.spreadBps.toFixed(1)} bps` : "—" },
    { label: "Funding now", value: snapshot ? `${snapshot.funding.nowAprPct.toFixed(1)}% a year` : "—" },
    { label: "Funding avg 7d", value: snapshot ? `${snapshot.funding.meanAprPct.toFixed(1)}% a year` : "—" },
    { label: "Fees maker · taker", value: snapshot ? `${snapshot.makerFeeBps.toFixed(1)} · ${snapshot.takerFeeBps.toFixed(1)} bps` : "—" },
    { label: "Bids within 25 bps", value: depth ? compact(depth.bidUsdWithin25Bps) : "—" },
    { label: "Asks within 25 bps", value: depth ? compact(depth.askUsdWithin25Bps) : "—" },
    ...(pulse && pulse.tokens.length > 0
      ? [
          { label: "Smart money 7d (Nansen)", value: `${stanceLabel(pulse.stance)} ${flowText(pulse.flow7dUsd)}` },
          { label: "Smart traders", value: String(pulse.traders) },
        ]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <RoundButton glyph="←" label="Back" light onPress={onBack} />
          <Text style={styles.title}>{symbol}</Text>
          <Tag label="Perpl perp" dot={tone.violet} />
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <ToneCard>
          <View style={styles.head}>
            <AssetMark symbol={symbol} size={48} />
            <View style={styles.flex}>
              <Text style={styles.name}>{market?.name ?? symbol}</Text>
              <Text style={styles.onColorMuted}>Perpetual · AUSD margin</Text>
            </View>
            <Text style={styles.price}>{market ? px(market.mark) : "—"}</Text>
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

        {data !== null && <OrderTicket trader={trader} data={data} symbol={symbol} onOpened={() => refreshPositions(data)} />}

        {positions.map((entry) => {
          const long = entry.position.positionType === perpl.OrderType.OpenLong;
          return (
            <ToneCard key={entry.market.perpId}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>YOUR {long ? "LONG" : "SHORT"}</Text>
                  <Text style={styles.muted}>
                    {entry.position.lots} lots · entry {px(entry.position.entryPrice)} · margin {usd(entry.position.deposit)}
                  </Text>
                </View>
                <Text style={[styles.pnl, { color: entry.position.pnl >= 0 ? dark.green : dark.red }]}>{usd(entry.position.pnl)}</Text>
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
          <Text style={styles.muted}>Positive funding means longs pay shorts. Figures come from Perpl on Monad testnet.</Text>
        </ToneCard>

        <Pressable onPress={() => onStrategies(symbol)} style={({ pressed }) => [styles.strategy, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>TEST A STRATEGY ON {symbol}</Text>
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
