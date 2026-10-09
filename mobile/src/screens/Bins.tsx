import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bins, type Bin } from "shared";
import { AssetMark } from "../components/AssetMark";
import { Ranks } from "../components/Ranks";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { ArrowBadge, ScreenTitle, SelectPill, Tag, tone } from "../components/ui";
import { displaySymbol, loadMarkets, type MarketData } from "../lib/market";
import { dark, family, space, touch } from "../theme";

const fills = [tone.butter, tone.coral, tone.violet, tone.lime, tone.sky, tone.peach];

type BinsProps = {
  onOpen: (bin: Bin, data: MarketData) => void;
  onComplete: () => void;
  onSelectTab: (key: TabKey) => void;
  onOpenAsset: (symbol: string) => void;
};

export function Bins({ onOpen, onComplete, onSelectTab, onOpenAsset }: BinsProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([bins[0].id, bins[1].id]);
  const [view, setView] = useState<"bins" | "ranks">("bins");

  useEffect(() => {
    let live = true;
    loadMarkets().then((result) => live && setData(result)).catch(() => live && setError("Markets are unavailable right now."));
    return () => {
      live = false;
    };
  }, []);

  function toggle(bin: Bin) {
    setSelected((current) => (current.includes(bin.id) ? current.filter((id) => id !== bin.id) : [...current, bin.id]));
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + tabBarHeight + (view === "bins" ? 112 : space.xl) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenTitle title={view === "bins" ? "Bins" : "Ranks"} />
        <View style={styles.pills}>
          <SelectPill label="Bins" active={view === "bins"} onPress={() => setView("bins")} />
          <SelectPill label="Ranks" active={view === "ranks"} onPress={() => setView("ranks")} />
        </View>

        {view === "ranks" ? (
          <Ranks onOpenAsset={onOpenAsset} />
        ) : (
          <>
            <Text style={styles.intro}>Each bin is a theme traded as a basket of Hyperliquid perps. Tap ↗ to open a bin, or tap any asset to trade it alone.</Text>
            {error !== null ? (
              <Text style={styles.error}>{error}</Text>
            ) : data === null ? (
              <View style={styles.loading}>
                <ActivityIndicator color={dark.ink} />
                <Text style={styles.muted}>Loading markets</Text>
              </View>
            ) : (
              bins.map((bin, index) => {
                const active = selected.includes(bin.id);
                const lead = bin.legs[0];
                const price = data.markets.get(lead.symbol)?.markPx;
                return (
                  <View key={bin.id} style={styles.card}>
                    <View style={[styles.accent, { backgroundColor: fills[index % fills.length] }]} />
                    <View style={styles.cardHead}>
                      <Text style={styles.name}>{bin.name}</Text>
                      <ArrowBadge label={`Open ${bin.name}`} onPress={() => onOpen(bin, data)} />
                    </View>
                    <Text style={styles.thesis}>{bin.thesis}</Text>
                    <Text style={styles.label}>WHAT IT HOLDS · TAP TO TRADE</Text>
                    <View style={styles.legs}>
                      {bin.legs.map((leg) => (
                        <Pressable
                          key={`${leg.symbol}-${leg.direction}`}
                          onPress={() => onOpenAsset(leg.symbol)}
                          accessibilityRole="button"
                          accessibilityLabel={`Trade ${displaySymbol(leg.symbol)}`}
                          style={({ pressed }) => [styles.leg, pressed && styles.pressed]}
                        >
                          <AssetMark symbol={leg.symbol} size={22} />
                          <Text style={styles.legText}>
                            {leg.direction === "long" ? "Long" : "Short"} {displaySymbol(leg.symbol)} {(leg.weightBps / 100).toFixed(0)}%
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.cardFoot}>
                      <Text style={styles.price}>
                        {displaySymbol(lead.symbol)} {price === undefined ? "—" : `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                      </Text>
                      <Pressable
                        onPress={() => toggle(bin)}
                        accessibilityLabel={active ? `Remove ${bin.name}` : `Keep ${bin.name}`}
                        style={({ pressed }) => [styles.add, active && styles.addActive, pressed && styles.pressed]}
                      >
                        <Text style={[styles.addLabel, active && styles.addLabelActive]}>{active ? "✓ Kept close" : "+ Keep close"}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {view === "bins" && (
        <View style={[styles.footer, { bottom: tabBarHeight + insets.bottom }]}>
          <Pressable onPress={onComplete} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>Keep {selected.length} bin{selected.length === 1 ? "" : "s"} close</Text>
          </Pressable>
        </View>
      )}
      <TabBar active="bins" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  pills: { flexDirection: "row", gap: space.sm },
  intro: { fontFamily: family.regular, fontSize: 14, lineHeight: 21, color: dark.muted },
  muted: { fontFamily: family.regular, fontSize: 13, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  loading: { paddingVertical: space.block, alignItems: "center", gap: space.md },
  card: { borderRadius: 28, padding: space.lg, paddingTop: space.xl, gap: space.md, backgroundColor: tone.card, overflow: "hidden" },
  accent: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { flex: 1, fontFamily: family.semibold, fontSize: 24, letterSpacing: -0.8, color: dark.ink },
  thesis: { fontFamily: family.regular, fontSize: 14, lineHeight: 21, color: dark.ink, opacity: 0.8 },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  legs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  leg: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: touch, paddingLeft: space.sm, paddingRight: space.md, borderRadius: 999, backgroundColor: tone.raised },
  legText: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  price: { flex: 1, fontFamily: family.medium, fontSize: 15, color: dark.ink },
  add: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" },
  addActive: { backgroundColor: tone.paper },
  addLabel: { fontFamily: family.semibold, fontSize: 13, color: dark.ink },
  addLabelActive: { color: tone.ink },
  pressed: { opacity: 0.75 },
  footer: { position: "absolute", left: 0, right: 0, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: dark.paper },
  primary: { minHeight: 56, borderRadius: 999, backgroundColor: tone.coral, alignItems: "center", justifyContent: "center" },
  primaryLabel: { fontFamily: family.semibold, fontSize: 16, color: tone.ink },
});
