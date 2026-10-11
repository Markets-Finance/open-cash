import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cancelOrder, checkTrigger, closeBin, maxOrderNotionalUsd, placeTrigger, triggerKindOf, triggerPriceFor, updateIsolatedMargin, type HlDesk, type HlMarket, type HlPosition, type TradingAccount, type TriggerKind } from "shared";
import { agentExchange } from "../lib/hl";
import { displaySymbol, loadMarkets } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { ToneCard } from "./ui";

const closeShares = [0.25, 0.5, 0.75, 1];
const marginSteps = [5, 10, 25];
const triggerPresets: Record<TriggerKind, number[]> = { sl: [5, 10, 20], tp: [5, 10, 25] };

function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function px(value: number): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

type Sheet = "close" | "margin" | "protect" | "grow";

type Props = {
  trader: TradingAccount;
  position: HlPosition;
  market: HlMarket | null;
  desk: HlDesk | null;
  onChanged: () => void;
  onAdd: (side: "long" | "short") => void;
};

export function PositionPanel({ trader, position, market, desk, onChanged, onAdd }: Props) {
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [amount, setAmount] = useState("");
  const [history, setHistory] = useState(false);
  const [prices, setPrices] = useState<Record<TriggerKind, string>>({ sl: "", tp: "" });
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const long = position.size >= 0;
  const mark = market?.markPx ?? position.entryPx;
  const roe = position.marginUsed > 0 ? (position.unrealizedPnl / position.marginUsed) * 100 : 0;
  const away = position.liquidationPx === null ? null : (Math.abs(mark - position.liquidationPx) / mark) * 100;
  const orders = (desk?.orders ?? []).filter((o) => o.coin === position.coin);
  const fills = (desk?.fills ?? []).filter((f) => f.coin === position.coin).slice(0, 5);

  async function act(label: string, run: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setStatus({ text: label, failed: false });
    try {
      setStatus({ text: await run(), failed: false });
      onChanged();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  const close = (fraction: number) =>
    act(fraction === 1 ? "Closing the position…" : `Closing ${fraction * 100}%…`, async () => {
      const { markets } = await loadMarkets(true);
      const part = fraction === 1 ? position : { ...position, size: position.size * fraction };
      const [result] = await closeBin(await agentExchange(trader), [part], markets, { maxNotionalUsd: maxOrderNotionalUsd });
      if (result?.error) throw new Error(result.error);
      return fraction === 1 ? "Position closed." : `Closed ${fraction * 100}% of the position.`;
    });

  const margin = (amount: number) =>
    act(amount > 0 ? `Adding $${amount} margin…` : `Removing $${-amount} margin…`, async () => {
      if (!market) throw new Error("Market data is not loaded yet.");
      await updateIsolatedMargin(await agentExchange(trader), market.assetId, long, amount);
      return amount > 0 ? `Added $${amount} margin. Liquidation moved further away.` : `Removed $${-amount} margin.`;
    });

  const setTrigger = (kind: TriggerKind) =>
    act(kind === "sl" ? "Placing the stop…" : "Placing the target…", async () => {
      if (!market) throw new Error("Market data is not loaded yet.");
      const price = Number(prices[kind]);
      const exchange = await agentExchange(trader);
      const existing = orders.filter((o) => triggerKindOf(o) === kind);
      await placeTrigger(exchange, { assetId: market.assetId, szDecimals: market.szDecimals, position, markPx: mark, kind, triggerPx: price, maxNotionalUsd: maxOrderNotionalUsd });
      for (const old of existing) await cancelOrder(exchange, market.assetId, old.oid);
      return kind === "sl" ? `Stop set at ${px(price)}. It closes the whole position if the price gets there.` : `Target set at ${px(price)}. It closes the whole position and takes the profit.`;
    });

  const cancel = (oid: number) =>
    act("Cancelling the order…", async () => {
      if (!market) throw new Error("Market data is not loaded yet.");
      await cancelOrder(await agentExchange(trader), market.assetId, oid);
      return "Order cancelled.";
    });

  const sign = position.unrealizedPnl >= 0 ? "+" : "−";
  const tabs: [Sheet, string][] = [["close", "Close"], ["margin", "Margin"], ["protect", "Stop & target"], ["grow", "Add more"]];
  const shownTabs = tabs.filter(([key]) => key !== "margin" || position.leverageType === "isolated");
  const facts: [string, string, boolean?][] = [
    ["Entry", px(position.entryPx)],
    ["Now", px(mark)],
    ["Liquidates at", position.liquidationPx === null ? "—" : `${px(position.liquidationPx)}${away === null ? "" : ` · ${away.toFixed(0)}% away`}`, away !== null && away < 8],
    ["Margin", usd(position.marginUsed)],
  ];
  const marginAmount = Number(amount);

  return (
    <ToneCard>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Text style={[styles.side, long ? styles.sideLong : styles.sideShort]}>{long ? "Long" : "Short"} {position.leverage}x</Text>
          <Text style={styles.coin}>{displaySymbol(position.coin)}</Text>
          <Text style={styles.muted}>{position.leverageType} · {Math.abs(position.size)} · {usd(Math.abs(position.positionValue))}</Text>
        </View>
        <View style={styles.headRight}>
          <Text style={[styles.pnl, position.unrealizedPnl >= 0 ? styles.good : styles.bad]}>{sign}{usd(Math.abs(position.unrealizedPnl))}</Text>
          <Text style={styles.muted}>{roe.toFixed(1)}%</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {facts.map(([label, value, warn]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, warn && styles.bad]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.chips}>
        {shownTabs.map(([key, label]) => (
          <Pressable key={key} onPress={() => setSheet(sheet === key ? null : key)} style={({ pressed }) => [styles.chip, sheet === key && styles.chipOn, pressed && styles.pressed]}>
            <Text style={[styles.chipLabel, sheet === key && styles.chipLabelOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {sheet === "close" && (
        <View style={styles.sheet}>
          <Text style={styles.muted}>Closes at the market price right now.</Text>
          <View style={styles.chips}>
            {closeShares.map((share) => (
              <Pressable key={share} disabled={busy} onPress={() => void close(share)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Text style={styles.chipLabel}>{share === 1 ? "Close all" : `${share * 100}%`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {sheet === "margin" && (
        <View style={styles.sheet}>
          <Text style={styles.muted}>Margin is the money backing this trade. Adding more pushes liquidation further away. Taking out brings it closer.</Text>
          <View style={styles.chips}>
            {marginSteps.map((step) => (
              <Pressable key={step} onPress={() => setAmount(String(step))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Text style={styles.chipLabel}>${step}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.triggerRow}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount in $" placeholderTextColor={dark.muted} style={styles.triggerInput} />
            <Pressable disabled={busy || !(marginAmount > 0)} onPress={() => void margin(marginAmount)} style={({ pressed }) => [styles.chip, styles.setChip, (busy || !(marginAmount > 0)) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.chipLabel}>Add</Text>
            </Pressable>
            <Pressable disabled={busy || !(marginAmount > 0)} onPress={() => void margin(-marginAmount)} style={({ pressed }) => [styles.chip, (busy || !(marginAmount > 0)) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.chipLabel}>Take out</Text>
            </Pressable>
          </View>
        </View>
      )}

      {sheet === "protect" && (
        <View style={styles.sheet}>
          {(["sl", "tp"] as const).map((kind) => {
            const price = Number(prices[kind]);
            const check = price > 0 ? checkTrigger(position, mark, kind, price) : null;
            const active = orders.filter((o) => triggerKindOf(o) === kind);
            return (
              <View key={kind} style={styles.triggerBox}>
                <Text style={styles.sheetTitle}>{kind === "sl" ? "Stop-loss" : "Take profit"}</Text>
                <Text style={styles.muted}>{kind === "sl" ? "Closes the trade if the price moves against you." : "Closes the trade and keeps the profit."}</Text>
                {active.map((o) => (
                  <View key={o.oid} style={styles.orderRow}>
                    <Text style={styles.muted}>Active at {px(o.triggerPx)}</Text>
                    <Pressable disabled={busy} onPress={() => void cancel(o.oid)}>
                      <Text style={styles.link}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <View style={styles.chips}>
                  {triggerPresets[kind].map((pct) => (
                    <Pressable key={pct} onPress={() => setPrices((current) => ({ ...current, [kind]: String(Number(triggerPriceFor(mark, long, kind, pct).toPrecision(6))) }))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                      <Text style={styles.chipLabel}>{pct}% {kind === "sl" ? (long ? "below" : "above") : long ? "above" : "below"}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.triggerRow}>
                  <TextInput
                    value={prices[kind]}
                    onChangeText={(text) => setPrices((current) => ({ ...current, [kind]: text }))}
                    keyboardType="decimal-pad"
                    placeholder={`Price (now ${px(mark)})`}
                    placeholderTextColor={dark.muted}
                    style={styles.triggerInput}
                  />
                  <Pressable disabled={busy || !check?.ok} onPress={() => void setTrigger(kind)} style={({ pressed }) => [styles.chip, styles.setChip, (busy || !check?.ok) && styles.disabled, pressed && styles.pressed]}>
                    <Text style={styles.chipLabel}>Set</Text>
                  </Pressable>
                </View>
                {check !== null && <Text style={check.ok ? styles.muted : styles.error}>{check.ok ? `If it is hit you ${check.resultUsd >= 0 ? "make" : "lose"} about ${usd(Math.abs(check.resultUsd))} on this position.` : check.reason}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {sheet === "grow" && (
        <View style={styles.sheet}>
          <Text style={styles.muted}>Make the trade bigger, or open the other side to offset it.</Text>
          <View style={styles.chips}>
            <Pressable onPress={() => onAdd(long ? "long" : "short")} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Text style={styles.chipLabel}>Add to this {long ? "long" : "short"}</Text>
            </Pressable>
            <Pressable onPress={() => onAdd(long ? "short" : "long")} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Text style={styles.chipLabel}>Hedge with a {long ? "short" : "long"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status !== null && <Text style={status.failed ? styles.error : styles.muted}>{status.text}</Text>}

      <Pressable onPress={() => setHistory(!history)} hitSlop={8}>
        <Text style={styles.link}>{history ? "Hide orders and history" : "Orders and history"}</Text>
      </Pressable>
      {history && (
        <>
          <Text style={styles.label}>OPEN ORDERS</Text>
          {orders.length === 0 ? <Text style={styles.muted}>No resting orders.</Text> : orders.map((o) => (
            <View key={o.oid} style={styles.orderRow}>
              <Text style={styles.muted}>{o.isTrigger ? (triggerKindOf(o) === "sl" ? "Stop" : triggerKindOf(o) === "tp" ? "Target" : o.orderType) : o.isBuy ? "Buy" : "Sell"} {o.size} at {px(o.isTrigger ? o.triggerPx : o.price)}{o.reduceOnly ? " · reduce only" : ""}</Text>
              <Pressable disabled={busy} onPress={() => void cancel(o.oid)}>
                <Text style={styles.link}>Cancel</Text>
              </Pressable>
            </View>
          ))}
          <Text style={styles.label}>RECENT FILLS</Text>
          {fills.length === 0 ? <Text style={styles.muted}>No fills yet.</Text> : fills.map((f) => (
            <Text key={`${f.time}-${f.dir}-${f.price}`} style={styles.muted}>
              {ago(f.time)} · {f.dir} {f.size} at {px(f.price)}{f.dir.toLowerCase().startsWith("close") ? ` · ${f.closedPnl >= 0 ? "+" : "−"}${usd(Math.abs(f.closedPnl))}` : ""}
            </Text>
          ))}
        </>
      )}
    </ToneCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md },
  headLeft: { gap: 4 },
  headRight: { alignItems: "flex-end", gap: 2 },
  side: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden", fontFamily: family.semibold, fontSize: 12 },
  sideLong: { backgroundColor: "rgba(190, 245, 130, 0.18)", color: dark.green },
  sideShort: { backgroundColor: "rgba(239, 91, 91, 0.18)", color: dark.red },
  coin: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.6, color: dark.ink },
  pnl: { fontFamily: family.semibold, fontSize: 24, letterSpacing: -0.6 },
  chipOn: { backgroundColor: dark.ink },
  chipLabelOn: { color: "#000000" },
  sheet: { gap: space.sm, padding: space.md, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)" },
  sheetTitle: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { width: "47%", flexGrow: 1, padding: space.md, borderRadius: 18, backgroundColor: "#29312e", gap: 4 },
  statLabel: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  statValue: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  good: { color: dark.green },
  bad: { color: dark.red },
  label: { marginTop: space.sm, fontFamily: family.medium, fontSize: 11, letterSpacing: 1.1, color: dark.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: { minHeight: touch - 6, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "#29312e", justifyContent: "center" },
  chipLabel: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  pressed: { opacity: 0.75 },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  orderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  link: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  triggerBox: { gap: space.xs },
  triggerRow: { flexDirection: "row", gap: space.xs, alignItems: "center" },
  triggerInput: { flex: 1, fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch - 6, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  setChip: { backgroundColor: "#3b4540" },
  disabled: { opacity: 0.4 },
});
