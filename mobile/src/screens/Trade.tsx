import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { liquidityGrade, perpl, slippageBps, type LiquidityGrade, type TradingAccount } from "shared";
import { toolbox } from "../lib/bots";
import { AssetMark } from "../components/AssetMark";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { Insights } from "../components/Insights";
import { ScreenTitle, Switcher, Tag, ToneCard, tone } from "../components/ui";
import { closePosition, loadMarkets, loadOpenPositions, type MarketData, type OpenPosition } from "../lib/perpl";
import { dark, family, space, touch } from "../theme";

function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

const gradeColor: Record<LiquidityGrade, string> = { deep: tone.lime, okay: tone.butter, thin: tone.coral };

type TradeProps = {
  trader: TradingAccount;
  onOpenAsset: (symbol: string) => void;
  onSelectTab: (key: TabKey) => void;
};

export function Trade({ trader, onOpenAsset, onSelectTab }: TradeProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MarketData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [positions, setPositions] = useState<OpenPosition[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"assets" | "insights">("assets");
  const [grades, setGrades] = useState<Record<string, LiquidityGrade>>({});

  const refreshPositions = useCallback(
    (markets: MarketData) => {
      loadOpenPositions(trader.address, markets)
        .then(setPositions)
        .catch(() => setPositions([]));
    },
    [trader.address],
  );

  useEffect(() => {
    let live = true;
    loadMarkets()
      .then((next) => {
        if (!live) return;
        setData(next);
        refreshPositions(next);
      })
      .catch((error) => live && setLoadError(error instanceof Error ? error.message : String(error)));
    return () => {
      live = false;
    };
  }, [refreshPositions]);

  useEffect(() => {
    if (!data) return;
    let live = true;
    for (const m of data.markets.values()) {
      if (m.numOrders === 0) continue;
      toolbox
        .getBook(m.symbol)
        .then((book) => {
          if (!live || !book.bids[0] || !book.asks[0]) return;
          const mid = (book.bids[0].price + book.asks[0].price) / 2;
          const buy = slippageBps(book, "buy", 1000, mid);
          const sell = slippageBps(book, "sell", 1000, mid);
          const grade = liquidityGrade(buy === null || sell === null ? null : Math.max(buy, sell));
          setGrades((current) => ({ ...current, [m.symbol]: grade }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [data]);

  const tradable = useMemo(() => [...(data?.markets.values() ?? [])].filter((m) => m.numOrders > 0), [data]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === "" ? tradable : tradable.filter((m) => m.symbol.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
  }, [tradable, query]);

  async function close(entry: OpenPosition) {
    if (!data) return;
    setBusy(true);
    setStatus("Closing…");
    try {
      await closePosition(trader, entry);
      setStatus(`${entry.market.symbol} closed.`);
      refreshPositions(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenTitle title="Trade" right={<Tag label="Monad Testnet" dot={dark.green} />} />

        <Switcher
          items={[
            { key: "assets", label: "Assets", dot: tone.butter },
            { key: "insights", label: "Insights", dot: tone.violet },
          ]}
          value={view}
          onChange={setView}
        />

        {view === "insights" ? (
          <Insights onOpenAsset={onOpenAsset} />
        ) : (
          <>
        <View style={styles.search}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search assets"
            placeholderTextColor={dark.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query !== "" && (
            <Pressable onPress={() => setQuery("")} hitSlop={12} accessibilityLabel="Clear search">
              <Text style={styles.searchClear}>×</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.muted}>
          Tap an asset to see its chart, funding and details, and to open a position. Dot: liquidity for a $1,000 order (green deep, yellow okay, red thin).
        </Text>

        {loadError !== null && <Text style={styles.error}>{loadError}</Text>}
        {data === null && loadError === null && <ActivityIndicator color={dark.ink} />}

        <View style={styles.grid}>
          {shown.map((m) => (
            <Pressable
              key={m.symbol}
              onPress={() => onOpenAsset(m.symbol)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${m.symbol}`}
              style={({ pressed }) => [styles.assetCell, pressed && styles.pressed]}
            >
              <AssetMark symbol={m.symbol} size={28} />
              <View style={styles.assetCellText}>
                <View style={styles.assetCellTop}>
                  <Text style={styles.assetCellLabel} numberOfLines={1}>{m.symbol}</Text>
                  {grades[m.symbol] !== undefined && <View style={[styles.grade, { backgroundColor: gradeColor[grades[m.symbol]] }]} />}
                </View>
                <Text style={styles.assetCellPrice} numberOfLines={1}>{px(m.mark)}</Text>
              </View>
            </Pressable>
          ))}
          {data !== null && shown.length === 0 && <Text style={styles.muted}>No asset matches “{query}”.</Text>}
        </View>

        <Text style={styles.section}>OPEN POSITIONS</Text>
        {status !== null && <Text style={styles.muted}>{status}</Text>}
        {positions === null ? (
          <ActivityIndicator color={dark.ink} />
        ) : positions.length === 0 ? (
          <Text style={styles.muted}>No open positions on Monad testnet for this address.</Text>
        ) : (
          positions.map((entry) => {
            const long = entry.position.positionType === perpl.OrderType.OpenLong;
            return (
              <ToneCard key={entry.market.perpId}>
                <Pressable onPress={() => onOpenAsset(entry.market.symbol)} style={styles.positionHead}>
                  <AssetMark symbol={entry.market.symbol} size={36} />
                  <Text style={styles.positionTitle}>
                    {long ? "LONG" : "SHORT"} {entry.market.symbol} ↗
                  </Text>
                  <Text style={[styles.pnl, { color: entry.position.pnl >= 0 ? dark.green : dark.red }]}>{usd(entry.position.pnl)}</Text>
                </Pressable>
                <View style={styles.tags}>
                  <Tag label={`${entry.position.lots} lots`} dot={long ? dark.green : dark.red} />
                  <Tag label={`Entry ${px(entry.position.entryPrice)}`} />
                  <Tag label={`Margin ${usd(entry.position.deposit)}`} />
                </View>
                <Pressable disabled={busy} onPress={() => void close(entry)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <Text style={styles.closeLabel}>Close position</Text>
                </Pressable>
              </ToneCard>
            );
          })
        )}
          </>
        )}
      </ScrollView>

      <TabBar active="trade" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: touch + space.sm, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.card },
  searchGlyph: { fontFamily: family.medium, fontSize: 20, color: dark.muted },
  searchInput: { flex: 1, fontFamily: family.regular, fontSize: 15, color: dark.ink, paddingVertical: 0 },
  searchClear: { fontFamily: family.medium, fontSize: 24, color: dark.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  assetCell: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 64, paddingHorizontal: space.md, borderRadius: 20, backgroundColor: tone.card },
  assetCellText: { flex: 1, minWidth: 0, gap: 2 },
  assetCellTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  assetCellLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  grade: { width: 8, height: 8, borderRadius: 4 },
  assetCellPrice: { fontFamily: family.medium, fontSize: 12, color: dark.muted },
  positionHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  positionTitle: { flex: 1, fontFamily: family.semibold, fontSize: 18, letterSpacing: -0.5, color: dark.ink },
  pnl: { fontFamily: family.semibold, fontSize: 16 },
  closeButton: { minHeight: touch, borderRadius: 999, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" },
  closeLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  section: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: dark.ink },
  pressed: { opacity: 0.75 },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
});
