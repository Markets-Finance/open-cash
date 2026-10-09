import { liquidityGrade, slippageBps, type LiquidityGrade } from "shared";
import { errorText, esc, markForSymbol, px, query } from "./dom";
import { displaySymbol, getMarketView, type MarketData } from "./market";

const enrichCount = 40;

type Row = {
  symbol: string;
  name: string;
  mark: number;
  changePct: number;
  volume: number;
  openInterest: number;
  spreadBps: number;
  maxLeverage: number;
  fundingApr: number | null;
  depth25: number | null;
  grade: LiquidityGrade | null;
};

type SortKey = "symbol" | "mark" | "changePct" | "volume" | "openInterest" | "fundingApr" | "spreadBps" | "maxLeverage" | "depth25";
type Filter = "all" | "gainers" | "losers" | "volume" | "funding" | "tight" | "deep";

const referenceUsd = 1000;

const filters: { key: Filter; label: string; sort: SortKey; dir: 1 | -1 }[] = [
  { key: "all", label: "All markets", sort: "volume", dir: -1 },
  { key: "gainers", label: "Top gainers", sort: "changePct", dir: -1 },
  { key: "losers", label: "Top losers", sort: "changePct", dir: 1 },
  { key: "volume", label: "Most volume", sort: "volume", dir: -1 },
  { key: "funding", label: "Highest funding", sort: "fundingApr", dir: -1 },
  { key: "tight", label: "Tightest spread", sort: "spreadBps", dir: 1 },
  { key: "deep", label: "Deepest book", sort: "depth25", dir: -1 },
];

const columns: { key: SortKey; label: string; align?: "right"; hint?: string }[] = [
  { key: "symbol", label: "Asset" },
  { key: "mark", label: "Price", align: "right" },
  { key: "changePct", label: "24h", align: "right" },
  { key: "volume", label: "24h volume", align: "right" },
  { key: "openInterest", label: "Open interest", align: "right" },
  { key: "fundingApr", label: "Funding a year", align: "right" },
  { key: "spreadBps", label: "Spread", align: "right" },
  { key: "depth25", label: "Liquidity", align: "right", hint: "Grade: cost of a $1,000 market order. Amount: book within 25 bps, smaller side." },
  { key: "maxLeverage", label: "Max lev", align: "right" },
];

function compact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
}

function tone(value: number): string {
  return value >= 0 ? "up" : "down";
}

export function initBoard(data: MarketData, onOpen: (symbol: string, side?: "long" | "short") => void) {
  const table = query("[data-board-table]");
  const bar = query("[data-board-filters]");
  const widgets = {
    volume: query("[data-widget-volume]"),
    gauge: query("[data-widget-funding]"),
    gainers: query("[data-widget-gainers]"),
    carry: query("[data-widget-carry]"),
  };

  let rows: Row[] = [];
  let filter: Filter = "all";
  let sort: SortKey = "volume";
  let dir: 1 | -1 = -1;
  let needle = "";

  bar.innerHTML = filters
    .map((f) => `<button type="button" class="chip${f.key === filter ? " chip--active" : ""}" data-filter="${f.key}">${f.label}</button>`)
    .join("");
  bar.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-filter]");
    if (!button) return;
    const next = filters.find((f) => f.key === button.dataset.filter)!;
    filter = next.key;
    sort = next.sort;
    dir = next.dir;
    bar.querySelectorAll<HTMLElement>("[data-filter]").forEach((el) => el.classList.toggle("chip--active", el === button));
    paintTable();
  });

  table.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const head = target.closest<HTMLElement>("[data-sort]");
    if (head) {
      const key = head.dataset.sort as SortKey;
      dir = sort === key ? ((dir * -1) as 1 | -1) : key === "symbol" ? 1 : -1;
      sort = key;
      paintTable();
      return;
    }
    const side = target.closest<HTMLElement>("[data-board-side]");
    const row = target.closest<HTMLElement>("[data-board-row]");
    if (row) onOpen(row.dataset.boardRow!, side ? (side.dataset.boardSide as "long" | "short") : undefined);
  });

  function visible(): Row[] {
    const list = rows.filter((row) => needle === "" || row.symbol.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle));
    return list.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      const left = a[sort] ?? Number.NEGATIVE_INFINITY;
      const right = b[sort] ?? Number.NEGATIVE_INFINITY;
      return (left - right) * dir;
    });
  }

  function paintTable() {
    const list = visible();
    const head = columns
      .map((c) => {
        const active = c.key === sort;
        return `<th class="${c.align === "right" ? "is-right" : ""}"${c.hint ? ` title="${c.hint}"` : ""}><button type="button" class="sort-btn${active ? " sort-btn--on" : ""}" data-sort="${c.key}">${c.label}<span aria-hidden="true">${active ? (dir === 1 ? " ↑" : " ↓") : ""}</span></button></th>`;
      })
      .join("");
    const body = list
      .map(
        (row) => `
        <tr class="board-row" data-board-row="${esc(row.symbol)}" tabindex="0">
          <td><div class="cell-identity">${markForSymbol(row.symbol)}<span class="cell-stack"><b>${esc(displaySymbol(row.symbol))}</b><small>${esc(row.name)}</small></span></div></td>
          <td class="is-right">${px(row.mark)}</td>
          <td class="is-right"><span class="delta delta--${tone(row.changePct)}">${pct(row.changePct)}</span></td>
          <td class="is-right">${compact(row.volume)}</td>
          <td class="is-right">${compact(row.openInterest)}</td>
          <td class="is-right">${row.fundingApr === null ? "…" : `<span class="delta delta--${tone(-row.fundingApr)}">${pct(row.fundingApr, 1)}</span>`}</td>
          <td class="is-right">${row.spreadBps.toFixed(1)} bps</td>
          <td class="is-right">${row.depth25 === null || row.grade === null ? "…" : `<span class="grade grade--${row.grade}">${row.grade}</span> ${compact(row.depth25)}`}</td>
          <td class="is-right">${row.maxLeverage}x</td>
          <td class="is-right"><span class="board-actions"><button type="button" class="mini-btn mini-btn--long" data-board-side="long">Long</button><button type="button" class="mini-btn mini-btn--short" data-board-side="short">Short</button></span></td>
        </tr>`,
      )
      .join("");
    table.innerHTML = `<table class="data-table board-table"><thead><tr>${head}<th></th></tr></thead><tbody>${body || `<tr><td colspan="10" class="empty">No asset matches “${esc(needle)}”.</td></tr>`}</tbody></table>`;
  }

  function list(items: Row[], value: (row: Row) => string, toneOf: (row: Row) => string): string {
    return items
      .map(
        (row, index) => `<button type="button" class="mini-row" data-open-asset="${esc(row.symbol)}"><span class="mini-row__rank">#${index + 1}</span>${markForSymbol(row.symbol)}<span class="mini-row__name"><b>${esc(displaySymbol(row.symbol))}</b><small>${esc(row.name)}</small></span><span class="mini-row__px">${px(row.mark)}</span><span class="delta delta--${toneOf(row)}">${value(row)}</span></button>`,
      )
      .join("");
  }

  function paintWidgets() {
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    const totalOi = rows.reduce((sum, row) => sum + row.openInterest, 0);
    const top = [...rows].sort((a, b) => b.volume - a.volume).slice(0, 5);
    widgets.volume.innerHTML = `
      <span class="widget__label">Hyperliquid market</span>
      <b class="widget__big">${compact(totalVolume)}</b>
      <small class="widget__sub">24h volume · ${compact(totalOi)} open interest</small>
      <div class="share">${top.map((row, i) => `<i style="flex:${Math.max(row.volume, 1)}" class="share__bit share__bit--${i}" title="${esc(displaySymbol(row.symbol))}"></i>`).join("")}</div>
      <div class="share-legend">${top.map((row, i) => `<span><i class="share__bit share__bit--${i}"></i>${esc(displaySymbol(row.symbol))} ${totalVolume ? Math.round((row.volume / totalVolume) * 100) : 0}%</span>`).join("")}</div>`;

    const known = rows.filter((row) => row.fundingApr !== null);
    if (known.length === 0) {
      widgets.gauge.innerHTML = `<span class="widget__label">Funding pulse</span><small class="widget__sub">Loading funding…</small>`;
    } else {
      const positive = known.filter((row) => (row.fundingApr ?? 0) > 0).length;
      const share = Math.round((positive / known.length) * 100);
      const average = known.reduce((sum, row) => sum + (row.fundingApr ?? 0), 0) / known.length;
      widgets.gauge.innerHTML = `
        <span class="widget__label">Funding pulse</span>
        <div class="gauge" style="--share:${share}"><span>${share}%</span></div>
        <small class="widget__sub">${share}% of markets have longs paying shorts · average ${pct(average, 1)} a year</small>`;
    }

    widgets.gainers.innerHTML = `<span class="widget__label">Top gainers · 24h</span>${list([...rows].sort((a, b) => b.changePct - a.changePct).slice(0, 4), (row) => pct(row.changePct), (row) => tone(row.changePct))}`;
    widgets.carry.innerHTML = `<span class="widget__label">Highest funding · a year</span>${
      known.length === 0
        ? `<small class="widget__sub">Loading funding…</small>`
        : list([...known].sort((a, b) => (b.fundingApr ?? 0) - (a.fundingApr ?? 0)).slice(0, 4), (row) => pct(row.fundingApr ?? 0, 1), (row) => tone(-(row.fundingApr ?? 0)))
    }`;
  }

  function paint() {
    paintWidgets();
    paintTable();
  }

  async function load() {
    try {
      rows = [...data.markets.values()]
        .filter((market) => market.dayNtlVlm > 0)
        .map((market) => ({
          symbol: market.name,
          name: market.dex ? `${market.dex} · HIP-3 perp` : "Perp",
          mark: market.markPx,
          changePct: market.prevDayPx > 0 ? ((market.markPx - market.prevDayPx) / market.prevDayPx) * 100 : 0,
          volume: market.dayNtlVlm,
          openInterest: market.openInterest * market.markPx,
          spreadBps: 0,
          maxLeverage: market.maxLeverage,
          fundingApr: market.funding * 24 * 365 * 100,
          depth25: null,
          grade: null,
        }));
      paint();
      const top = [...rows].sort((a, b) => b.volume - a.volume).slice(0, enrichCount);
      await Promise.all(
        top.map((row) =>
          getMarketView(row.symbol)
            .then(({ snapshot, book, depth }) => {
              row.spreadBps = snapshot.spreadBps;
              row.fundingApr = snapshot.funding.nowAprPct;
              row.depth25 = Math.min(depth.bidUsdWithin25Bps, depth.askUsdWithin25Bps);
              const mid = (book.bids[0].price + book.asks[0].price) / 2;
              const buy = slippageBps(book, "buy", referenceUsd, mid);
              const sell = slippageBps(book, "sell", referenceUsd, mid);
              row.grade = liquidityGrade(buy === null || sell === null ? null : Math.max(buy, sell));
            })
            .catch(() => {}),
        ),
      );
      paint();
    } catch (error) {
      table.innerHTML = `<p class="empty">${esc(errorText(error))}</p>`;
    }
  }

  void load();
  return {
    setSearch(term: string) {
      needle = term;
      paintTable();
    },
    reload: load,
  };
}
