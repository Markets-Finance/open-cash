import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as templates from "shared";
import { defaultLimits, maxLiveLeverage } from "shared";
import { addPaper, loadPapers, loadSeries } from "../lib/lab";
import { toolbox } from "../lib/bots";
import { hlNetwork } from "../lib/hl";
import { liveAct, reviewLive, type Preflight } from "../lib/live";
import { dark, family, space, touch } from "../theme";
import { AssetMark } from "./AssetMark";
import { meta, money, pct, tints } from "./labShared";
import { PreflightView } from "./LiveBots";
import { MarketPicker } from "./MarketPicker";
import { SelectPill, tone } from "./ui";

type Stage = "simulate" | "paper" | "live";

const frames = [
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "1d", value: 86400 },
];

const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dailyChanges(equity: templates.EquityPoint[], days = 7): { label: string; change: number }[] {
  const closes = new Map<string, { time: number; equity: number }>();
  for (const point of equity) closes.set(new Date(point.time).toDateString(), point);
  const ordered = [...closes.values()];
  return ordered.slice(-days).map((point, i, list) => {
    const index = ordered.length - list.length + i;
    const previous = index > 0 ? ordered[index - 1]!.equity : equity[0]!.equity;
    return { label: weekday[new Date(point.time).getDay()]!, change: point.equity - previous };
  });
}

function Stepper({ spec, value, onChange }: { spec: templates.ParamSpec; value: number; onChange: (next: number) => void }) {
  if (spec.options) {
    return (
      <View style={styles.param}>
        <Text style={styles.paramLabel}>{spec.label}</Text>
        <View style={styles.optionRow}>
          {spec.options.map((option) => (
            <SelectPill key={option.value} label={option.label} active={option.value === value} onPress={() => onChange(option.value)} />
          ))}
        </View>
      </View>
    );
  }
  const move = (direction: number) => onChange(Math.min(spec.max, Math.max(spec.min, Math.round((value + direction * spec.step) * 100) / 100)));
  return (
    <View style={styles.param}>
      <Text style={styles.paramLabel}>{spec.label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => move(-1)} style={styles.stepBtn} accessibilityLabel={`Decrease ${spec.label}`}>
          <Text style={styles.stepGlyph}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>
          {value}
          {spec.unit ? ` ${spec.unit}` : ""}
        </Text>
        <Pressable onPress={() => move(1)} style={styles.stepBtn} accessibilityLabel={`Increase ${spec.label}`}>
          <Text style={styles.stepGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WeekBars({ result }: { result: templates.SimResult }) {
  const days = result.equity.length > 1 ? dailyChanges(result.equity) : [];
  if (days.length === 0) return null;
  const peak = Math.max(...days.map((d) => Math.abs(d.change)), 0.01);
  return (
    <View style={styles.week}>
      <View style={styles.chart}>
        <View style={styles.zero} />
        {days.map((day, i) => {
          const height = 4 + (Math.abs(day.change) / peak) * 52;
          const up = day.change >= 0;
          return (
            <View key={`${day.label}-${i}`} style={styles.barSlot}>
              <View style={styles.half}>{up && <View style={[styles.bar, styles.barUp, { height }]} />}</View>
              <View style={[styles.half, styles.halfDown]}>{!up && <View style={[styles.bar, styles.barDown, { height }]} />}</View>
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {days.map((day, i) => (
          <View key={`${day.label}-l-${i}`} style={styles.barSlot}>
            <Text style={styles.dayLabel}>{day.label}</Text>
            <Text style={[styles.dayValue, { color: day.change >= 0 ? dark.green : dark.red }]}>
              {day.change >= 0 ? "+" : "−"}${Math.abs(day.change).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StrategyLab({ onOpenAsset, initialSymbol, onLive }: { onOpenAsset: (symbol: string) => void; initialSymbol?: string | null; onLive?: () => void }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState(3600);
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<templates.Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<templates.TemplateId>("donchian");
  const [params, setParams] = useState<Record<string, templates.Params>>({});
  const [allocation, setAllocation] = useState(100);
  const [stage, setStage] = useState<Stage>("simulate");
  const [note, setNote] = useState<string | null>(null);
  const [liveLeverage, setLiveLeverage] = useState(2);
  const [review, setReview] = useState<{ id: string; preflight: Preflight } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  useEffect(() => {
    void loadPapers();
    toolbox
      .getMarkets()
      .then((markets) => {
        const names = markets.map((m) => m.name);
        setSymbols(names);
        setSymbol(initialSymbol && names.includes(initialSymbol) ? initialSymbol : names.includes("BTC") ? "BTC" : (names[0] ?? ""));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!symbol) return;
    setError(null);
    loadSeries(symbol, resolution, days).then(setSeries).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [symbol, resolution, days]);

  const paramsFor = useCallback((template: templates.Template) => params[template.id] ?? template.defaults, [params]);
  const run = (template: templates.Template) => (series ? templates.runTemplate(template, paramsFor(template), series, allocation) : null);

  const template = templates.templateById(selected);
  const result = run(template);
  const fill = tints[meta[selected].tint];
  const others = templates.library.filter((entry) => entry.id !== selected);

  function startPaper() {
    if (!series) return;
    addPaper(templates.paperFromBot(`${template.name} · ${series.market.name}`, template.id, series.market.name, series.resolution, { ...paramsFor(template) }, allocation, Date.now()));
    setNote("Paper bot started. It is below.");
  }

  async function startReview() {
    if (!series) return;
    setLiveBusy(true);
    setNote(null);
    try {
      setReview(
        await reviewLive({
          templateId: template.id,
          symbol: series.market.name,
          resolution: series.resolution,
          params: { ...paramsFor(template) },
          allocationUsd: allocation,
          leverage: liveLeverage,
        }),
      );
      onLive?.();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setLiveBusy(false);
    }
  }

  async function goLive() {
    if (!review) return;
    setLiveBusy(true);
    try {
      await liveAct(review.id, "enable");
      setReview(null);
      setNote("Live. Track it, pause it or stop it under Live strategies below.");
      onLive?.();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setLiveBusy(false);
    }
  }

  async function discardReview() {
    if (!review) return;
    setLiveBusy(true);
    try {
      await liveAct(review.id, "remove");
      setReview(null);
      setNote("Discarded.");
      onLive?.();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setLiveBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable onPress={() => symbol && onOpenAsset(symbol)} accessibilityRole="button" style={styles.tradeLink}>
          <Text style={styles.tradeLinkText}>Trade {symbol || "market"} ↗</Text>
        </Pressable>
        <View style={styles.frames}>
          {frames.map((frame) => (
            <SelectPill key={frame.value} label={frame.label} active={resolution === frame.value} onPress={() => setResolution(frame.value)} />
          ))}
          {([30, 90, 180, 365] as const).map((value) => (
            <SelectPill key={`d${value}`} label={value === 365 ? "1Y" : `${value}D`} active={days === value} onPress={() => setDays(value)} />
          ))}
        </View>
      </View>

      <MarketPicker symbols={symbols} value={symbol} onChange={setSymbol} />

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {series === null && error === null && <Text style={styles.muted}>Loading Hyperliquid history.</Text>}

      {series !== null && result && (
        <>
          <View style={styles.list}>
            {templates.library.map((entry, index) => {
              const m = run(entry)!.metrics;
              const active = entry.id === selected;
              const info = meta[entry.id];
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    setSelected(entry.id);
                    setNote(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.row, index > 0 && styles.rowDivider, active && { backgroundColor: tone.raised }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: tints[info.tint] }]}>
                    <Text style={styles.rowGlyph}>{info.glyph}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{entry.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {info.tag}
                    </Text>
                  </View>
                  <Text style={[styles.rowResult, { color: m.returnPct >= 0 ? dark.green : dark.red }]}>
                    {m.returnPct >= 0 ? "▲" : "▼"} {Math.abs(m.returnPct).toFixed(1)}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.muted}>Result over the last {days} days of {series.market.name} on Hyperliquid (real prices), after fees and funding. Tap one to see how it works.</Text>

          <View style={styles.detail}>
            <View style={[styles.accent, { backgroundColor: fill }]} />
            <Text style={styles.detailName}>{template.name}</Text>
            <Text style={styles.blurb}>{template.blurb}</Text>

            <Text style={styles.label}>30-DAY RESULT</Text>
            <Text style={[styles.big, { color: result.metrics.returnPct >= 0 ? dark.green : dark.red }]}>{pct(result.metrics.returnPct)}</Text>
            <Text style={styles.summary}>
              ${allocation} would have become ${(allocation + result.metrics.netPnlUsd).toFixed(2)}. Just holding {series.market.name} returned {pct(result.metrics.holdReturnPct)}.
            </Text>

            <Text style={styles.label}>DAY BY DAY, LAST 7 DAYS</Text>
            <WeekBars result={result} />

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Profit after costs</Text>
                <Text style={styles.metricValue}>{money(result.metrics.netPnlUsd)}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Biggest drop</Text>
                <Text style={styles.metricValue}>{result.metrics.maxDrawdownPct.toFixed(1)}%</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Winning trades</Text>
                <Text style={styles.metricValue}>
                  {result.metrics.winRatePct === null ? "None yet" : `${result.metrics.winRatePct.toFixed(0)}% of ${result.metrics.closingFills}`}
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Fees and funding</Text>
                <Text style={styles.metricValue}>{money(-result.metrics.feesUsd + result.metrics.fundingUsd)}</Text>
              </View>
            </View>
            {result.metrics.liquidated && <Text style={styles.warn}>These settings would have been liquidated.</Text>}

            <Text style={styles.label}>SETTINGS</Text>
            {template.params.map((spec) => (
              <Stepper
                key={spec.key}
                spec={spec}
                value={paramsFor(template)[spec.key] ?? spec.min}
                onChange={(next) => setParams((prev) => ({ ...prev, [template.id]: { ...paramsFor(template), [spec.key]: next } }))}
              />
            ))}
            <Stepper
              spec={{ key: "allocation", label: "Most it can use", min: 10, max: defaultLimits.maxMarginUsd, step: 10, unit: "USD" }}
              value={allocation}
              onChange={setAllocation}
            />

            <Text style={styles.label}>RUN IT</Text>
            <View style={styles.optionRow}>
              {(["simulate", "paper", "live"] as Stage[]).map((key) => (
                <SelectPill key={key} label={key === "simulate" ? "Test on history" : key === "paper" ? "Fake money" : "Real money"} active={stage === key} onPress={() => setStage(key)} />
              ))}
            </View>
            {stage === "simulate" && <Text style={styles.muted}>You are looking at it. Change a setting and the result above updates.</Text>}
            {stage === "paper" && (
              <>
                <Text style={styles.muted}>Runs on live prices with pretend money. It acts when each candle closes.</Text>
                <Pressable onPress={startPaper} style={({ pressed }) => [styles.primary, { backgroundColor: fill }, pressed && styles.pressed]}>
                  <Text style={styles.primaryLabel}>Start with fake money</Text>
                </Pressable>
              </>
            )}
            {stage === "live" && (
              <>
                <Text style={styles.muted}>
                  Real orders on Hyperliquid {hlNetwork}, sized by the most it can use, up to the leverage below. The server acts when each candle closes and places a stop on the exchange after every entry. Pause or stop it any time below.
                </Text>
                <Stepper spec={{ key: "leverage", label: "Leverage", min: 1, max: maxLiveLeverage, step: 1, unit: "x" }} value={liveLeverage} onChange={setLiveLeverage} />
                {review === null ? (
                  <Pressable disabled={liveBusy} onPress={startReview} style={({ pressed }) => [styles.primary, { backgroundColor: fill }, (pressed || liveBusy) && styles.pressed]}>
                    <Text style={styles.primaryLabel}>{liveBusy ? "Checking…" : "Review with a dry run"}</Text>
                  </Pressable>
                ) : (
                  <>
                    <PreflightView preflight={review.preflight} />
                    <Pressable disabled={liveBusy || !review.preflight.ready} onPress={goLive} style={({ pressed }) => [styles.primary, { backgroundColor: fill }, (pressed || liveBusy || !review.preflight.ready) && styles.pressed]}>
                      <Text style={styles.primaryLabel}>{review.preflight.ready ? "Go live" : "Fix the checks above first"}</Text>
                    </Pressable>
                    <Pressable disabled={liveBusy} onPress={discardReview} style={styles.tradeLink}>
                      <Text style={styles.tradeLinkText}>Discard</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
            {note !== null && <Text style={styles.note}>{note}</Text>}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: dark.ink },
  tradeLink: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.raised, justifyContent: "center" },
  tradeLinkText: { fontFamily: family.semibold, fontSize: 13, color: dark.ink },
  frames: { flexDirection: "row", gap: space.xs },
  chips: { gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: touch, borderRadius: 999, backgroundColor: tone.card },
  chipActive: { backgroundColor: tone.paper },
  chipLabel: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  chipLabelActive: { color: tone.ink },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 12, color: dark.red },
  list: { borderRadius: 28, backgroundColor: tone.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 68 },
  rowDivider: { borderTopWidth: 1, borderTopColor: dark.surfaceLine },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowGlyph: { fontFamily: family.semibold, fontSize: 16, color: tone.ink },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: family.semibold, fontSize: 16, color: dark.ink },
  rowSub: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  rowResult: { fontFamily: family.semibold, fontSize: 16 },
  detail: { borderRadius: 28, padding: space.lg, paddingTop: space.xl, gap: space.md, backgroundColor: tone.card, overflow: "hidden" },
  accent: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  detailName: { fontFamily: family.semibold, fontSize: 26, letterSpacing: -0.9, color: dark.ink },
  blurb: { fontFamily: family.regular, fontSize: 14, lineHeight: 21, color: dark.muted },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted, marginTop: space.sm },
  big: { fontFamily: family.medium, fontSize: 56, lineHeight: 60, letterSpacing: -2.5 },
  summary: { fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: dark.ink },
  warn: { fontFamily: family.medium, fontSize: 13, color: dark.red },
  note: { fontFamily: family.medium, fontSize: 13, color: dark.green },
  week: { gap: space.sm },
  chart: { height: 120, flexDirection: "row", gap: space.xs },
  zero: { position: "absolute", left: 0, right: 0, top: 60, height: 1, backgroundColor: dark.line },
  barSlot: { flex: 1, alignItems: "center" },
  half: { height: 60, alignSelf: "stretch", justifyContent: "flex-end" },
  halfDown: { justifyContent: "flex-start" },
  bar: { alignSelf: "stretch", marginHorizontal: 3 },
  barUp: { backgroundColor: dark.green, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barDown: { backgroundColor: dark.red, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  labels: { flexDirection: "row", gap: space.xs },
  dayLabel: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  dayValue: { fontFamily: family.regular, fontSize: 10 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  metric: { width: "48%", flexGrow: 1, padding: space.md, borderRadius: 18, backgroundColor: tone.raised, gap: 4 },
  metricLabel: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  metricValue: { fontFamily: family.semibold, fontSize: 17, color: dark.ink },
  param: { gap: space.xs },
  paramLabel: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 999, backgroundColor: tone.raised },
  stepBtn: { width: touch + space.sm, height: touch + space.sm, alignItems: "center", justifyContent: "center" },
  stepGlyph: { fontFamily: family.medium, fontSize: 22, color: dark.ink },
  stepValue: { fontFamily: family.medium, fontSize: 15, color: dark.ink },
  primary: { minHeight: touch + space.md, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  primaryLabel: { fontFamily: family.semibold, fontSize: 15, color: tone.ink },
  pressed: { opacity: 0.75 },
});
