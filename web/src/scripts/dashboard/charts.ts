import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "shared";

export type ChartOverlay = {
  lines: { price: number; title: string; color: string; dashed?: boolean }[];
};

const palette = { text: "#c3cbc7", grid: "rgba(255,255,255,0.05)", up: "#3ecf8e", down: "#ef5b5b", line: "#7165ed" };

function baseChart(container: HTMLElement): IChartApi {
  return createChart(container, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: palette.text, fontFamily: "DM Sans, system-ui, sans-serif", fontSize: 12 },
    grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
    timeScale: { borderVisible: false, timeVisible: true },
  });
}

export function drawCandles(container: HTMLElement, candles: Candle[], emptyMessage: string, overlay?: ChartOverlay) {
  container.innerHTML = "";
  if (candles.length < 2) {
    container.innerHTML = `<div class="chart-empty">${emptyMessage}</div>`;
    return;
  }
  const chart = baseChart(container);
  const series = chart.addSeries(CandlestickSeries, {
    upColor: palette.up,
    downColor: palette.down,
    wickUpColor: palette.up,
    wickDownColor: palette.down,
    borderVisible: false,
    autoscaleInfoProvider: overlay
      ? (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: { above: number; below: number } } | null) => {
          const base = original();
          if (!base || !base.priceRange) return base;
          const { minValue: low, maxValue: high } = base.priceRange;
          const reach = (high - low) / 2 + (high + low) * 0.05;
          const mid = (high + low) / 2;
          const prices = overlay.lines.map((l) => l.price).filter((p) => Math.abs(p - mid) <= reach);
          return { ...base, priceRange: { minValue: Math.min(base.priceRange.minValue, ...prices), maxValue: Math.max(base.priceRange.maxValue, ...prices) } };
        }
      : undefined,
  });
  series.setData(
    candles.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  );
  if (overlay) {
    for (const line of overlay.lines) {
      series.createPriceLine({ price: line.price, color: line.color, lineWidth: 2, lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: line.title });
    }
  }
  chart.timeScale().fitContent();
}

export function drawLine(container: HTMLElement, points: { time: number; value: number }[], emptyMessage: string) {
  container.innerHTML = "";
  if (points.length < 2) {
    container.innerHTML = `<div class="chart-empty">${emptyMessage}</div>`;
    return;
  }
  const chart = baseChart(container);
  const series = chart.addSeries(LineSeries, { color: palette.line, lineWidth: 2 });
  series.setData(points.map((p) => ({ time: Math.floor(p.time / 1000) as UTCTimestamp, value: p.value })));
  chart.timeScale().fitContent();
}
