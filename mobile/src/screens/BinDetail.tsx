import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { closeBin, hlBinInputSource, marketSession, maxOrderNotionalUsd, openBin, planBin, previewFloorBin, weekendCloseAt, weightModes, type Bin, type BinSizingIssue, type SizedBin, type TradingAccount, type WeightMode } from "shared";
import { addBinRecord } from "../lib/binRecords";
import { openFlooredBin } from "../lib/floor";
import { guardOrThrow } from "../lib/guardrails";
import { agentExchange, info, networkLabel, withFundingHint } from "../lib/hl";
import { SelectPill } from "../components/ui";
import { AssetMark, LegStack } from "../components/AssetMark";
import { displaySymbol, loadAccountDesk, type MarketData } from "../lib/market";
import { dark, family, space, track } from "../theme";

type BinDetailProps = {
  bin: Bin;
  data: MarketData;
  balance: number | null;
  trader: TradingAccount;
  onBack: () => void;
  onOpenAsset: (symbol: string) => void;
};

const inputSource = hlBinInputSource(info);

const presets = [10, 25, 50, 100];

export function BinDetail({ bin, data, balance: initialBalance, trader, onBack, onOpenAsset }: BinDetailProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [openedLegs, setOpenedLegs] = useState<string[]>([]);
  const minMargin = Math.ceil(
    Math.max(
      ...bin.legs.map((leg) => 10.05 / ((leg.weightBps / 10000) * Math.min(leg.leverage, data.markets.get(leg.symbol)?.maxLeverage ?? leg.leverage))),
    ) * 1.15,
  );

  function refreshBalance() {
    loadAccountDesk(trader.address, true)
      .then((desk) => setBalance(Math.max(0, desk.equity - desk.positions.reduce((sum, p) => sum + p.marginUsed, 0))))
      .catch(() => {});
  }

  useEffect(refreshBalance, [trader.address]);
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sizing, setSizing] = useState(false);
  const [mode, setMode] = useState<WeightMode>(bin.mode ?? "fixed");
  const [result, setResult] = useState<{ sized: SizedBin; issues: BinSizingIssue[]; usedMode: WeightMode } | null>(null);

  const marginAmount = Number(amount) || 0;
  const [floorPct, setFloorPct] = useState<number | null>(0.8);
  const [timebox, setTimebox] = useState(false);
  const reopen = bin.tags?.includes("weekend") ? weekendCloseAt(bin.legs.map((l) => l.symbol)) : null;
  const floorPreview = floorPct !== null && marginAmount > 0 ? previewFloorBin({ bin, markets: data.markets, amountUsd: marginAmount, floorPct, sleeveLeverage: 3 }) : null;

  useEffect(() => {
    if (marginAmount <= 0) {
      setResult(null);
      return;
    }
    let live = true;
    setSizing(true);
    planBin(inputSource, bin, marginAmount, data.markets, mode)
      .then((next) => live && setResult(next))
      .catch(() => live && setResult(null))
      .finally(() => live && setSizing(false));
    return () => {
      live = false;
    };
  }, [bin, marginAmount, data, mode]);

  async function submitFloored() {
    if (floorPct === null || marginAmount <= 0) return;
    setBusy(true);
    setFailed(false);
    try {
      setStatus("Lending the floor and opening every leg…");
      const records = await openFlooredBin(trader, bin, data.markets, marginAmount, floorPct, 3, timebox && reopen !== null);
      setStatus(`${bin.name} is open with $${records.reduce((sum, r) => sum + r.floorUsd, 0).toFixed(2)} held as the floor.`);
    } catch (error) {
      setFailed(true);
      setStatus(withFundingHint(bin.legs.map((l) => l.symbol), error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
      refreshBalance();
    }
  }

  async function submit() {
    if (floorPct !== null) return submitFloored();
    if (!result) return;
    setBusy(true);
    setFailed(false);
    try {
      await guardOrThrow(trader.address, result.sized.margin);
      const exchange = await agentExchange(trader);
      setStatus("Opening every leg…");
      const results = await openBin(exchange, result.sized, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
      const failedLegs = results.filter((r) => r.error !== null || !(r.filledSize > 0));
      const filled = results.filter((r) => r.error === null && r.filledSize > 0);
      if (failedLegs.length === 0) {
        const openedAt = Date.now();
        await addBinRecord(trader.address, {
          id: `${bin.id}-${openedAt}`,
          binId: bin.id,
          name: bin.name,
          openedAt,
          legs: filled.map((r) => ({ symbol: r.symbol, direction: result.sized.legs.find((l) => l.leg.symbol === r.symbol)?.leg.direction ?? "long", size: r.filledSize })),
        });
        setStatus(`${bin.name} is open: ${filled.map((r) => displaySymbol(r.symbol)).join(", ")}. Manage each leg below, or from Trade.`);
        setOpenedLegs(filled.map((r) => r.symbol));
        setAmount("");
      } else {
        if (filled.length > 0) {
          const open = (await loadAccountDesk(trader.address, true)).positions.filter((p) => filled.some((r) => r.symbol === p.coin));
          await closeBin(exchange, open, data.markets, { maxNotionalUsd: maxOrderNotionalUsd });
        }
        setFailed(true);
        setStatus(`Not opened: ${failedLegs.map((r) => `${displaySymbol(r.symbol)} ${r.error ?? "did not fill"}`).join(" · ")}. Any leg that filled was closed.`);
      }
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      refreshBalance();
    }
  }

  const blocked =
    busy
      ? "Working…"
      : marginAmount <= 0
      ? "Enter an amount"
      : floorPct !== null
        ? floorPreview?.blocked
          ? floorPreview.blocked
          : balance !== null && marginAmount > balance
            ? "Insufficient balance"
            : null
      : sizing
        ? "Pricing…"
        : !result || result.sized.legs.length < bin.legs.length
          ? `Needs at least $${minMargin} for every leg`
          : balance !== null && marginAmount > balance
            ? "Insufficient balance"
            : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconButton}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.heading}>{bin.name}</Text>
        <View style={styles.iconSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 160 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identityRow}>
          <LegStack symbols={bin.legs.map((leg) => leg.symbol)} size={44} />
          <Text style={styles.thesis}>{bin.thesis}</Text>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.fieldLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={dark.muted}
              style={styles.amountInput}
            />
          </View>
          <View style={styles.presets}>
            {presets.map((preset) => (
              <Pressable
                key={preset}
                onPress={() => setAmount(String(preset))}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipLabel}>${preset}</Text>
              </Pressable>
            ))}
          </View>
          {balance !== null ? (
            <Text style={styles.balance}>
              USDC available ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          ) : null}
        </View>

        <View style={styles.modes}>
          {([0.9, 0.8, 0.7] as const).map((value) => (
            <SelectPill key={value} label={`${Math.round(value * 100)}% floor`} active={floorPct === value} onPress={() => setFloorPct(value)} />
          ))}
          <SelectPill label="No floor" active={floorPct === null} onPress={() => setFloorPct(null)} />
        </View>
        {floorPct !== null && (
          <Text style={styles.modeHint}>
            You can't end below ${floorPreview ? floorPreview.floorUsd.toFixed(2) : "0.00"}. Most you can lose ${floorPreview ? floorPreview.maxLossUsd.toFixed(2) : "0.00"}. The rest is traded at 3x.
          </Text>
        )}
        {floorPct !== null && reopen !== null && (
          <Pressable onPress={() => setTimebox(!timebox)}>
            <Text style={styles.modeHint}>
              {timebox ? "☑" : "☐"} Close automatically when the market reopens ({new Date(reopen).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })})
            </Text>
          </Pressable>
        )}
        <View style={styles.modes}>
          {weightModes.map((item) => (
            <SelectPill key={item.key} label={item.label} active={mode === item.key} onPress={() => setMode(item.key)} />
          ))}
        </View>
        <Text style={styles.modeHint}>{weightModes.find((item) => item.key === mode)?.hint}</Text>
        {result !== null && result.usedMode !== mode && (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>Not enough data for {mode} weights, using fixed.</Text>
          </View>
        )}

        {(result?.sized.legs.length ?? 0) > 0 && (
          <View style={styles.legsCard}>
            <Text style={styles.fieldLabel}>Legs</Text>
            {(result?.sized.legs ?? []).map((leg) => (
              <View key={leg.leg.symbol} style={styles.legRow}>
                <AssetMark symbol={leg.leg.symbol} size={34} />
                <View style={styles.legIdentity}>
                  <Text style={styles.legSymbol}>
                    {leg.leg.direction === "long" ? "Long" : "Short"} {displaySymbol(leg.leg.symbol)} · {leg.leverage}x · {(leg.leg.weightBps / 100).toFixed(1)}%
                  </Text>
                  <Text style={styles.legStat}>
                    ${leg.margin.toFixed(2)} margin · ${leg.notional.toFixed(2)} notional
                  </Text>
                </View>
                <Text style={styles.legPrice}>${leg.mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
              </View>
            ))}
          </View>
        )}

        {(result?.issues ?? []).map((issue) => (
          <View key={`${issue.symbol}-${issue.reason}`} style={styles.warnCard}>
            <Text style={styles.warnText}>{issue.detail}</Text>
          </View>
        ))}

        {status !== null ? (
          <Text style={[styles.status, failed && styles.statusFailed]}>{status}</Text>
        ) : null}

        {openedLegs.map((symbol) => (
          <Pressable key={symbol} onPress={() => onOpenAsset(symbol)} style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.8 }]}>
            <AssetMark symbol={symbol} size={28} />
            <Text style={styles.manageText}>{displaySymbol(symbol)}</Text>
            <Text style={styles.manageCta}>Manage ↗</Text>
          </Pressable>
        ))}

        <Text style={styles.footnote}>
          Legs fill one at a time on {networkLabel}. If one fails, the legs that filled are closed.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.totals}>
          <Text style={styles.totalLabel}>Total margin</Text>
          <Text style={styles.totalValue}>${floorPct !== null ? marginAmount.toFixed(2) : (result?.sized.margin ?? 0).toFixed(2)}</Text>
        </View>
        <Pressable
          disabled={blocked !== null}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primaryButton,
            blocked !== null && styles.primaryButtonDisabled,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={dark.onAccent} />
          ) : (
            <Text
              style={[
                styles.primaryLabel,
                blocked !== null && styles.primaryLabelDisabled,
              ]}
            >
              {blocked ?? (floorPct !== null ? `Open ${bin.name} with a floor` : `Open ${bin.name}`)}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  header: {
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontFamily: family.semibold,
    fontSize: 26,
    letterSpacing: -1,
    textTransform: "uppercase",
    color: dark.ink,
  },
  iconSpacer: { width: 54, height: 54 },
  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#f3f4f1",
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontFamily: family.medium, fontSize: 22, color: "#14181a" },
  content: { padding: space.lg, gap: space.lg },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  modeHint: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  identityRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  thesis: {
    flex: 1,
    fontFamily: family.regular,
    fontSize: 13,
    lineHeight: 13 * 1.6,
    color: dark.muted,
  },
  amountCard: {
    padding: space.lg,
    borderRadius: 18,
    backgroundColor: dark.surface,
    gap: space.sm,
  },
  fieldLabel: {
    fontFamily: family.medium,
    fontSize: 11,
    letterSpacing: track(11, 0.12),
    color: dark.muted,
  },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  currency: { fontFamily: family.light, fontSize: 32, color: dark.ink },
  amountInput: {
    flex: 1,
    fontFamily: family.light,
    fontSize: 40,
    letterSpacing: track(40, -0.04),
    color: dark.ink,
    padding: 0,
  },
  presets: { flexDirection: "row", gap: space.sm },
  chip: {
    borderRadius: 999,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: dark.surfaceHover,
  },
  chipPressed: { backgroundColor: dark.surfaceLine },
  chipLabel: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  balance: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  legsCard: {
    padding: space.lg,
    borderRadius: 18,
    backgroundColor: dark.surface,
    gap: space.md,
  },
  legRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  legIdentity: { flex: 1, minWidth: 0 },
  legSymbol: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  legStat: { fontFamily: family.regular, fontSize: 11, color: dark.muted },
  legPrice: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  warnCard: { padding: space.md, borderRadius: 14, backgroundColor: dark.redSoft },
  warnText: {
    fontFamily: family.regular,
    fontSize: 12,
    lineHeight: 12 * 1.6,
    color: dark.red,
  },
  status: { fontFamily: family.regular, fontSize: 13, color: dark.ink },
  statusFailed: { color: dark.red },
  footnote: {
    fontFamily: family.regular,
    fontSize: 11,
    lineHeight: 11 * 1.6,
    color: dark.muted,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    backgroundColor: dark.paper,
    gap: space.sm,
  },
  totals: { flexDirection: "row", alignItems: "baseline" },
  totalLabel: { flex: 1, fontFamily: family.regular, fontSize: 13, color: dark.muted },
  totalValue: {
    fontFamily: family.semibold,
    fontSize: 20,
    letterSpacing: track(20, -0.03),
    color: dark.ink,
  },
  primaryButton: {
    minHeight: 64,
    borderRadius: 33,
    backgroundColor: dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: { backgroundColor: dark.surfaceHover },
  primaryButtonPressed: { opacity: 0.85 },
  primaryLabel: { fontFamily: family.medium, fontSize: 16, color: dark.onAccent },
  primaryLabelDisabled: { color: dark.muted },
  manageRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: 16, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.surfaceLine },
  manageText: { flex: 1, fontFamily: family.semibold, fontSize: 16, color: dark.ink },
  manageCta: { fontFamily: family.semibold, fontSize: 14, color: dark.accent },
});
