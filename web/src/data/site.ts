export const site = {
  name: "OpenCash",
  network: "Hyperliquid testnet",
  dashboardPath: "/dashboard",
  launchEnabled: false,
  description:
    "OpenCash is a web and phone app for trading Hyperliquid perps, stocks and commodities. Pick a theme or a rule-based strategy, test it on real Hyperliquid history and with fake money, then run it under a hard spending cap.",
  shareTitle: "OpenCash — Themes and strategies on Hyperliquid",
  shareDescription:
    "Pick a theme or a rule-based strategy, test it on real Hyperliquid history, then run it under a hard spending cap. On Hyperliquid, on phone and web.",
} as const;

export const navLinks = [
  { href: "#home", label: "Home" },
  { href: "#assets", label: "Bins" },
  { href: "#platform", label: "Platform" },
  { href: "#about", label: "About" },
  { href: "#network", label: "Developers" },
] as const;

export const footerLinks = [
  { href: "#assets", label: "Bins" },
  { href: "#platform", label: "Platform" },
  { href: "#network", label: "Developers" },
  { href: "#about", label: "About OpenCash" },
] as const;
