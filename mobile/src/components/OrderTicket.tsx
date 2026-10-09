import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { estimateExecution, liquidationDistancePct, slippageWarnBps, type MarketSnapshot, type perpl, type TradingAccount } from "shared";
import { toolbox } from "../lib/bots";
import { loadAccount, loadSpendableBalance, openBin, singleLegBin, sizeBinFor, type MarketData } from "../lib/perpl";
import { dark, family, space, touch, track } from "../theme";
import { LeverageSlider, riskColor } from "./LeverageSlider";
import { CardTitle, ToneCard, tone } from "./ui";

type Direction = "long" | "short";
type Status = { text: string; failed: boolean } | null;

const quickShares = [0.25, 0.5, 0.75, 1];

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function CostRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.costRow}>
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={[styles.costValue, warn === true && styles.costWarn]}>{value}</Text>
    </View>
  );
}

type OrderTicketProps = {
  trader: TradingAccount;
  data: MarketData;
  symbol: string;
  initialDirection?: Direction;
  onOpened: () => void;
};

export function OrderTicket({ trader, data, symbol, initialDirection, onOpened }: OrderTicketProps) {
  const [direction, setDirection] = useState<Direction>(initialDirection ?? "long");
  const [leverage, setLeverage] = useState(3);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [book, setBook] = useState<perpl.Book | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [available, setAvailable] = useState<number | null>(null);
  const [maintenance, setMaintenance] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadSpendableBalance(trader.address), loadAccount(trader.address)])
      .then(([wallet, account]) => live && setAvailable(wallet + (account?.balance ?? 0)))
      .catch(() => live && setAvailable(null));
    return () => {
      live = false;
    };
  }, [trader.address]);

  useEffect(() => {
    let live = true;
    setMaintenance(null);
    toolbox.getMarket(symbol).then((next) => live && setMaintenance(next.maintenanceLeverage)).catch(() => {});
    return () => {
      live = false;
    };
  }, [symbol]);

  useEffect(() => {
    let live = true;
    setBook(null);
    setSnapshot(null);
    toolbox.getBook(symbol).then((next) => live && setBook(next)).catch(() => {});
    toolbox.getSnapshot(symbol).then(({ snapshot: next }) => live && setSnapshot(next)).catch(() => {});
    return () => {
      live = false;
    };
  }, [symbol]);

  const market = data.markets.get(symbol) ?? null;
  const cap = data.maxLeverage.get(symbol) ?? leverage;
  const margin = Number(amount) || 0;

  const preview = useMemo(() => {
    if (!market || margin <= 0) return null;
    return sizeBinFor(singleLegBin(symbol, direction, Math.min(leverage, cap)), margin, data);
  }, [data, market, symbol, direction, leverage, cap, margin]);

  const leg = preview?.sized.legs[0] ?? null;
  const level = Math.min(leverage, cap);
  const accent = direction === "long" ? tone.lime : tone.coral;

  const estimate = useMemo(() => {
    if (!book || !snapshot || !leg) return null;
    return estimateExecution({
      book,
      side: direction === "long" ? "buy" : "sell",
      notionalUsd: leg.notional,
      takerFeeBps: snapshot.takerFeeBps,
      fundingAprPct: snapshot.funding.nowAprPct,
    });
  }, [book, snapshot, leg, direction]);

  const risky = estimate !== null && (estimate.slippageBps === null || estimate.slippageBps > slippageWarnBps);

  useEffect(() => setConfirmed(false), [symbol, direction, amount, leverage]);

  async function submit() {
    if (!preview || !leg) return;
    if (risky && !confirmed) {
      setConfirmed(true);
      return;
    }
    setBusy(true);
    setStatus({ text: "Sending…", failed: false });
    try {
      await openBin(trader, preview.sized, data, (step) =>
        setStatus({ text: step === "orders" ? "Opening position…" : "Funding account…", failed: false }),
      );
      setStatus({ text: `${direction === "long" ? "Long" : "Short"} ${symbol} is open.`, failed: false });
      setAmount("");
      onOpened();
    } catch (error) {
      setStatus({ text: errorText(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  const blocked = busy
    ? "Working…"
    : margin <= 0
      ? "Enter an amount"
      : !leg
        ? (preview?.issues[0]?.detail ?? "Size is below one lot")
        : null;

  return (
    <ToneCard>
      <CardTitle>Open a position</CardTitle>
      <View style={styles.sides}>
        {(["long", "short"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setDirection(key)}
            accessibilityRole="button"
            style={[styles.side, direction === key && { backgroundColor: key === "long" ? tone.lime : tone.coral }]}
          >
            <Text style={[styles.sideLabel, direction === key && styles.sideLabelOn]}>{key === "long" ? "Long" : "Short"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.box}>
        <View style={styles.boxHead}>
          <Text style={styles.fieldLabel}>MARGIN</Text>
          <Text style={styles.available}>{available === null ? "Available —" : `Available ${usd(available)}`}</Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={dark.muted}
            style={styles.input}
          />
          <Text style={styles.unit}>AUSD</Text>
        </View>
        <View style={styles.quick}>
          {quickShares.map((share) => (
            <Pressable
              key={share}
              disabled={!(available !== null && available > 0)}
              onPress={() => setAmount((Math.floor((available ?? 0) * share * 100) / 100).toString())}
              style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
            >
              <Text style={styles.quickLabel}>{share === 1 ? "Max" : `${share * 100}%`}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.box}>
        <View style={styles.boxHead}>
          <Text style={styles.fieldLabel}>LEVERAGE</Text>
          <Text style={[styles.levValue, { color: riskColor(level, cap) }]}>{level}x</Text>
        </View>
        <LeverageSlider value={level} max={cap} onChange={setLeverage} />
        {maintenance !== null && (
          <Text style={styles.muted}>
            About a {liquidationDistancePct(level, maintenance).toFixed(1)}% move against you liquidates this position.
          </Text>
        )}
      </View>

      {leg !== null && (
        <Text style={styles.muted}>
          {leg.lots} {symbol} · {usd(leg.notional)} position
        </Text>
      )}
      {estimate !== null && (
        <View style={styles.cost}>
          <CostRow label="Slippage" value={estimate.slippageBps === null ? "Beyond the book" : `${estimate.slippageBps.toFixed(1)} bps · ${usd(estimate.slippageUsd ?? 0)}`} warn={risky} />
          <CostRow label="Spread" value={`${estimate.spreadBps.toFixed(1)} bps`} />
          <CostRow label="Taker fee" value={usd(estimate.feeUsd)} />
          <CostRow label="Funding a day" value={`${estimate.fundingDailyUsd >= 0 ? "pay" : "earn"} ${usd(Math.abs(estimate.fundingDailyUsd))}`} />
          {risky && (
            <Text style={styles.warn}>
              Thin book for this size. Up to {usd(estimate.maxSizeUsd)} fills within {slippageWarnBps} bps.
            </Text>
          )}
        </View>
      )}
      <Pressable
        disabled={blocked !== null}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: accent },
          blocked !== null && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.primaryLabel}>
          {blocked ?? (risky && confirmed ? "Tap again to accept slippage" : `${direction === "long" ? "Long" : "Short"} ${symbol}`)}
        </Text>
      </Pressable>
      {status !== null && <Text style={status.failed ? styles.error : styles.muted}>{status.text}</Text>}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  sides: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 999, backgroundColor: tone.raised },
  side: { flex: 1, minHeight: touch, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sideLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.muted },
  sideLabelOn: { color: tone.ink },
  box: { gap: space.sm, padding: space.md, borderRadius: 20, backgroundColor: tone.raised },
  boxHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  currency: { fontFamily: family.light, fontSize: 30, color: dark.muted },
  unit: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  available: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  quick: { flexDirection: "row", gap: space.xs },
  quickChip: { flex: 1, minHeight: 34, borderRadius: 999, backgroundColor: tone.card, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  levValue: { fontFamily: family.semibold, fontSize: 24, letterSpacing: -0.5 },
  cost: { gap: space.xs },
  costRow: { flexDirection: "row", justifyContent: "space-between" },
  costLabel: { fontFamily: family.regular, fontSize: 13, color: dark.muted },
  costValue: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  costWarn: { color: dark.red },
  warn: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.red },
  fieldLabel: { fontFamily: family.medium, fontSize: 11, letterSpacing: track(11, 0.12), color: dark.muted },
  input: { flex: 1, fontFamily: family.light, fontSize: 38, letterSpacing: track(38, -0.04), color: dark.ink, padding: 0 },
  primary: { minHeight: touch + space.md, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  primaryLabel: { fontFamily: family.semibold, fontSize: 15, color: tone.ink },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
});
