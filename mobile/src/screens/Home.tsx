import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bins, type HlPosition, type TradingAccount } from "shared";
import { AddressMark } from "../components/AddressMark";
import { GuardBar } from "../components/GuardBar";
import { AssetMark } from "../components/AssetMark";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { ArrowBadge, CardTitle, RoundButton, Tag, ToneCard, tone } from "../components/ui";
import { displaySymbol, loadAccountDesk, loadMarkets, loadSummary, type MarketData } from "../lib/market";
import { dark, family, space, touch, track } from "../theme";

const featuredSymbols = [...new Set(bins.flatMap((bin) => bin.legs.map((leg) => leg.symbol)))];

type HomeProps = {
  trader: TradingAccount;
  name?: string;
  onSelectTab: (key: TabKey) => void;
  onOpenAsset: (symbol: string) => void;
  onDeposit: () => void;
  onSend: () => void;
};

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function money(value: number): { whole: string; cents: string } {
  const [whole, cents] = Math.abs(value)
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");
  return { whole: `${value < 0 ? "−" : ""}$${whole}`, cents: `.${cents}` };
}

export function Home({ trader, name, onSelectTab, onOpenAsset, onDeposit, onSend }: HomeProps) {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof loadSummary>> | null>(null);
  const [positions, setPositions] = useState<HlPosition[] | null>(null);
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadMarkets()
      .then((markets) => {
        if (live) setData(markets);
        loadSummary(trader).then((next) => live && setSummary(next)).catch(() => live && setSummary(null));
        return loadAccountDesk(trader.address, true);
      })
      .then((desk) => live && setPositions(desk.positions))
      .catch((cause) => live && setError(String(cause)));
    return () => {
      live = false;
    };
  }, [trader.address]);

  const listed = data ? featuredSymbols.filter((symbol) => data.markets.has(symbol)) : featuredSymbols;
  const pnl = summary?.unrealizedPnl ?? 0;
  const total = money(summary?.total ?? 0);
  const change = money(Math.abs(pnl));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetRow}>
          <View style={styles.avatar}>
            <AddressMark address={trader.address} variant={0} size={30} />
          </View>
          <Text style={styles.greet} numberOfLines={1}>
            Hi, {name ?? "trader"}!
          </Text>
          <RoundButton glyph="⌕" label="Find a market" light onPress={() => onSelectTab("bins")} />
          <RoundButton glyph="+" label="New trade" fill={tone.coral} onPress={() => onSelectTab("trade")} />
        </View>

        <GuardBar owner={trader.address} />

        <View style={styles.wallet}>
          <View style={styles.walletFace}>
            <View style={[styles.dot, styles.dotTopLeft]} />
            <View style={[styles.dot, styles.dotTopRight]} />
            <View style={[styles.dot, styles.dotBottomLeft]} />
            <View style={[styles.dot, styles.dotBottomRight]} />
            <View style={styles.coinStack}>
              {(summary?.symbols.length ? summary.symbols : listed).slice(0, 4).map((coin: string, index: number) => (
                <View key={coin} style={[styles.walletCoin, index > 0 && styles.walletCoinOverlap]}>
                  <AssetMark symbol={coin} size={28} />
                </View>
              ))}
            </View>
            <Text style={styles.walletBalance} numberOfLines={1} adjustsFontSizeToFit>
              {total.whole}
              <Text style={styles.walletCents}>{total.cents}</Text>
            </Text>
            <Text style={styles.walletChange}>
              {pnl >= 0 ? "+" : "−"} {change.whole}
              {change.cents}
            </Text>
          </View>
          <View style={styles.walletActions}>
            <Pressable style={styles.walletAction} onPress={onDeposit} accessibilityRole="button">
              <Text style={styles.walletIcon}>↓</Text>
              <Text style={styles.walletActionLabel}>Deposit</Text>
            </Pressable>
            <View style={styles.walletDivider} />
            <Pressable style={styles.walletAction} onPress={onSend} accessibilityRole="button">
              <View style={styles.sendIcon}>
                <Text style={styles.walletIcon}>↑</Text>
                <View style={styles.sendBar} />
              </View>
              <Text style={styles.walletActionLabel}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        <ToneCard fill={tone.violet}>
          <View style={styles.cardHead}>
            <View style={styles.headText}>
              <CardTitle onColor>Markets</CardTitle>
              <Text style={styles.onColorMuted}>Tap a market to trade it</Text>
            </View>
            <ArrowBadge dark label="Open Trade" onPress={() => onSelectTab("trade")} />
          </View>
          <View style={styles.marketList}>
            {listed.map((symbol) => {
              const mark = data?.markets.get(symbol)?.markPx;
              const leverage = data?.markets.get(symbol)?.maxLeverage;
              return (
                <Pressable
                  key={symbol}
                  onPress={() => onOpenAsset(symbol)}
                  accessibilityRole="button"
                  accessibilityLabel={`Trade ${displaySymbol(symbol)}`}
                  style={({ pressed }) => [styles.marketRow, pressed && styles.pressed]}
                >
                  <AssetMark symbol={symbol} size={26} />
                  <Text style={styles.marketSymbol}>{displaySymbol(symbol)}</Text>
                  <Text style={styles.marketPrice}>{mark === undefined ? "—" : px(mark)}</Text>
                  <View style={styles.levTag}>
                    <Text style={styles.levText}>{leverage === undefined ? "—" : `${leverage}x`}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ToneCard>

        <View style={styles.quick}>
          <Pressable onPress={() => onSelectTab("bins")} style={({ pressed }) => [styles.quickItem, { backgroundColor: tone.butter }, pressed && styles.pressed]}>
            <Text style={styles.quickTitle}>BINS</Text>
            <Text style={styles.quickSub}>Trade a theme in one tap</Text>
          </Pressable>
          <Pressable onPress={() => onSelectTab("bots")} style={({ pressed }) => [styles.quickItem, { backgroundColor: tone.coral }, pressed && styles.pressed]}>
            <Text style={styles.quickTitle}>BOTS</Text>
            <Text style={styles.quickSub}>Test a strategy first</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>POSITIONS</Text>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : positions === null ? (
          <ActivityIndicator color={dark.ink} />
        ) : positions.length === 0 ? (
          <Text style={styles.muted}>No open positions yet. Open a bin or place a trade.</Text>
        ) : (
          positions.map((position) => (
            <ToneCard key={`${position.dex}:${position.coin}`}>
              <View style={styles.cardHead}>
                <AssetMark symbol={position.coin} size={30} />
                <View style={styles.headText}>
                  <Text style={styles.positionName}>{position.size >= 0 ? "LONG" : "SHORT"} {displaySymbol(position.coin).toUpperCase()}</Text>
                  <Text style={styles.muted}>{position.leverage}x {position.leverageType}</Text>
                </View>
                <ArrowBadge label="Open in Trade" onPress={() => onOpenAsset(position.coin)} />
              </View>
              <View style={styles.tagRow}>
                <Tag label={`Value ${usd(position.marginUsed + position.unrealizedPnl)}`} />
                <Tag label={`PnL ${position.unrealizedPnl >= 0 ? "+" : "−"}${usd(Math.abs(position.unrealizedPnl))}`} dot={position.unrealizedPnl >= 0 ? dark.green : dark.red} />
              </View>
            </ToneCard>
          ))
        )}
      </ScrollView>

      <TabBar active="home" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  pressed: { opacity: 0.75 },
  greetRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: tone.peach, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  greet: { flex: 1, fontFamily: family.medium, fontSize: 17, color: dark.ink },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  headText: { flex: 1, gap: 2 },
  wallet: { padding: space.md, borderRadius: space.xl + space.md, borderWidth: 1, borderColor: dark.surfaceLine, backgroundColor: dark.wallet },
  walletFace: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl, borderRadius: space.xl, backgroundColor: dark.lime },
  dot: { position: "absolute", width: space.sm, height: space.sm, borderRadius: space.xs, backgroundColor: dark.wallet },
  dotTopLeft: { top: space.xl, left: space.xl },
  dotTopRight: { top: space.xl, right: space.xl },
  dotBottomLeft: { bottom: space.xl, left: space.xl },
  dotBottomRight: { bottom: space.xl, right: space.xl },
  coinStack: { flexDirection: "row" },
  walletCoin: { width: space.xxl, height: space.xxl, borderRadius: space.xxl / 2, borderWidth: 2, borderColor: dark.wallet, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  walletCoinOverlap: { marginLeft: -space.xs },
  walletBalance: { fontFamily: family.semibold, fontSize: 56, letterSpacing: track(56, -0.05), color: dark.limeInk, marginTop: space.md },
  walletCents: { fontSize: 30, letterSpacing: track(30, -0.03) },
  walletChange: { fontFamily: family.medium, fontSize: 22, letterSpacing: track(22, -0.02), color: dark.limeInk, marginTop: space.sm },
  walletActions: { flexDirection: "row", alignItems: "center", paddingVertical: space.xl },
  walletAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: touch },
  walletIcon: { fontSize: 24, lineHeight: 28, color: dark.onWallet },
  sendIcon: { alignItems: "center" },
  sendBar: { width: space.lg, height: 2, borderRadius: 1, backgroundColor: dark.onWallet },
  walletActionLabel: { fontFamily: family.medium, fontSize: 24, color: dark.onWallet },
  walletDivider: { width: 1, height: space.section, backgroundColor: dark.line },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  onColorMuted: { fontFamily: family.regular, fontSize: 12, color: "rgba(20, 24, 26, 0.7)" },
  circles: { gap: space.sm },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.85)" },
  circleActive: { backgroundColor: tone.ink },
  focusRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  focusSymbol: { fontFamily: family.semibold, fontSize: 20, color: tone.ink },
  focusPrice: { fontFamily: family.medium, fontSize: 30, letterSpacing: -1, color: tone.ink },
  marketList: { borderRadius: 20, backgroundColor: "rgba(20, 24, 26, 0.12)", paddingHorizontal: space.md },
  marketRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  marketSymbol: { flex: 1, fontFamily: family.semibold, fontSize: 15, color: tone.ink },
  marketPrice: { fontFamily: family.medium, fontSize: 14, color: tone.ink },
  levTag: { paddingVertical: 3, paddingHorizontal: space.sm, borderRadius: 999, backgroundColor: tone.ink },
  levText: { fontFamily: family.medium, fontSize: 11, color: tone.paper },
  quick: { flexDirection: "row", gap: space.md },
  quickItem: { flex: 1, borderRadius: 28, padding: space.lg, gap: space.xs, minHeight: 112, justifyContent: "flex-end" },
  quickTitle: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: tone.ink },
  quickSub: { fontFamily: family.regular, fontSize: 12, color: "rgba(20, 24, 26, 0.75)" },
  section: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: dark.ink },
  positionName: { fontFamily: family.semibold, fontSize: 16, letterSpacing: -0.4, color: dark.ink },
  error: { fontFamily: family.regular, fontSize: 12, color: dark.red },
});
