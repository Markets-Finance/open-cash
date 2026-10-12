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
  "JPY", "EUR", "GBP", "KRW", "PURRDAT",
]);

const fmp = (ticker: string) => `https://financialmodelingprep.com/image-stock/${ticker}.png`;
const site = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const flag = (country: string) => `https://flagcdn.com/w160/${country}.png`;
const parqet = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png&size=128`;
const emoji = (code: string) => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`;

const fallbacks: Record<string, string> = {
  SKHX: fmp("000660.KS"), SKHY: fmp("000660.KS"), SMSN: fmp("005930.KS"), SOFTBANK: fmp("9984.T"),
  IBIDEN: fmp("4062.T"), AMEC: fmp("688012.SS"), HYUNDAI: site("hyundai.com"), KIOXIA: site("kioxia.com"),
  GIGADEV: site("gigadevice.com"), UNITREE: site("unitree.com"), MINIMAX: site("minimax.io"), ZHIPU: site("zhipuai.cn"),
  SHEIN: site("shein.com"), OURA: site("ouraring.com"), CATL: site("catl.com"), RELIANCE: site("ril.com"),
  CAMBRICON: site("cambricon.com"), YMTC: site("ymtc.com"), INNOLIGHT: site("innolight.com"),
  HIMS: site("hims.com"), MRVL: site("marvell.com"), ZM: site("zoom.us"), BB: site("blackberry.com"),
  NOK: site("nokia.com"), IREN: site("iren.com"), SOXL: site("direxion.com"), IBM: parqet("IBM"), SMH: parqet("SMH"),
  XLE: site("ssga.com"), XBI: site("ssga.com"), SP500: site("spglobal.com"), XYZ100: site("nasdaq.com"), VIX: site("cboe.com"),
  EWJ: flag("jp"), EWY: flag("kr"), EWT: flag("tw"), EWZ: flag("br"), KR200: flag("kr"), JP225: flag("jp"),
  NIFTY: flag("in"), IBOV: flag("br"), DXY: flag("us"), JPY: flag("jp"), EUR: flag("eu"), GBP: flag("gb"), KRW: flag("kr"),
  CORN: emoji("1f33d"), WHEAT: emoji("1f33e"), COPPER: emoji("1f949"), NATGAS: emoji("1f525"), TTF: emoji("1f525"), HO: emoji("26fd"),
  H100: fmp("NVDA"), PURRDAT: "https://app.hyperliquid.xyz/coins/PURR.svg", IO: site("io.net"),
};

export function assetLogoSources(symbol: string): string[] {
  const stock = symbol.includes(":");
  const name = symbol.split(":").pop() ?? symbol;
  const venue = stock ? symbol : name.replace(/^k(?=[A-Z])/, "");
  const sources = [`https://app.hyperliquid.xyz/coins/${venue}.svg`];
  const backup = fallbacks[name];
  if (backup) sources.push(backup);
  else if (!stock) sources.push(`https://assets.coincap.io/assets/icons/${venue.toLowerCase()}@2x.png`);
  else if (!nonEquity.has(name)) sources.push(fmp(name));
  return sources;
}
