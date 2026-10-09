import { chartRanges, type Candle, type ChartRangeKey } from "shared";
import { info } from "../hl";

export async function getCandles(coin: string, range: ChartRangeKey): Promise<Candle[]> {
  const { interval, spanMs } = chartRanges[range];
  const rows = await info.candleSnapshot({ coin, interval, startTime: Date.now() - spanMs });
  return rows.map((c) => ({ time: c.t, open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) }));
}
