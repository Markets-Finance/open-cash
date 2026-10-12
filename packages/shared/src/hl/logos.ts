// Robinhood's own registry `logoUrl` turned out to be a red herring — every
// token returns the same generic Robinhood brand mark (verified: identical
// bytes across AAPL/MSFT/NVDA/GOOGL), not a real per-company logo. Financial
// Modeling Prep's image CDN is free, unauthenticated, and keyed directly by
// ticker — verified visually for a real distinct logo across a dozen
// symbols including two ETFs. A handful of tickers may fall back to a
// generic placeholder on their end (confirmed for SLV) rather than a 404,
// so this is a best-effort source, not a guarantee.
export function stockLogoUrl(symbol: string): string {
  return `https://financialmodelingprep.com/image-stock/${symbol}.png`;
}

const nonEquity = new Set([
  "XYZ100", "SP500", "KR200", "JP225", "NIFTY", "IBOV", "DXY", "VIX", "VOL", "H100",
  "GOLD", "SILVER", "PLATINUM", "PALLADIUM", "COPPER", "ALUMINIUM", "URANIUM",
  "CL", "BRENTOIL", "NATGAS", "HO", "TTF", "CORN", "WHEAT",
  "JPY", "EUR", "GBP", "KRW",
]);

export function assetLogoUrl(symbol: string): string | null {
  const name = symbol.split(":").pop() ?? symbol;
  if (!symbol.includes(":")) return `https://assets.coincap.io/assets/icons/${name.toLowerCase()}@2x.png`;
  return nonEquity.has(name) ? null : stockLogoUrl(name);
}
