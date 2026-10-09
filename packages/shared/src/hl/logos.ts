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
