export type FolderIconKind = "terminal" | "bins" | "limits";

export type FolderPage = {
  label: string;
  title: string;
  description: string;
  facts: [label: string, value: string][];
  caption: string;
  icon: FolderIconKind;
};

export const folderPages: FolderPage[] = [
  {
    label: "THE TERMINAL",
    title: "Every market.\nOne terminal.",
    description:
      "Trade Monad perps and assets on Perpl from your phone or the web, with one AUSD margin balance behind every position.",
    facts: [
      ["NETWORK", "Monad"],
      ["MARKETS", "Perpl perps"],
      ["MARGIN", "AUSD"],
      ["DIRECTION", "Long / Short"],
    ],
    caption: "A clearer view of your next move.",
    icon: "terminal",
  },
  {
    label: "THEMES AND STRATEGIES",
    title: "Pick a theme.\nOr a rule.",
    description:
      "Group markets that move together into a bin, run a rule-based strategy, or tell the agent a trade in one line and get a card back.",
    facts: [
      ["THEMES", "Bins by narrative"],
      ["RULES", "Plain strategies"],
      ["AGENT", "Drafts from one line"],
      ["TESTING", "Real history, fake money"],
    ],
    caption: "A bigger picture. A single trade.",
    icon: "bins",
  },
  {
    label: "YOUR LIMITS",
    title: "Test first.\nCap the spend.",
    description:
      "Replay on real Perpl history, practise with fake money, then run under a hard spending cap. Your passkey signs every call.",
    facts: [
      ["SPENDING", "Hard cap"],
      ["SIGNING", "Your passkey"],
      ["CUSTODY", "Your control"],
      ["ACCESS", "Phone + web"],
    ],
    caption: "Built around your control.",
    icon: "limits",
  },
];

export const steps = [
  {
    name: "Pick",
    position: "issue",
    insert: "ONE THEME",
    glyph: "▦",
    description:
      "Choose a theme or a rule-based strategy, or tell the agent a trade in one line. A bin groups markets that move together; a strategy follows plain rules.",
  },
  {
    name: "Test",
    position: "verify",
    insert: "REAL HISTORY",
    glyph: "↻",
    description:
      "Replay it on real Perpl history, then let it trade fake money. See the worst dip and the exits before any real funds are at stake.",
  },
  {
    name: "Cap",
    position: "collateral",
    insert: "HARD LIMIT",
    glyph: "$",
    description:
      "Run it under a hard spending cap you set, so a strategy can never spend more than you allow.",
  },
  {
    name: "Rank",
    position: "settlement",
    insert: "ON-CHAIN",
    glyph: "↗",
    description:
      "A public leaderboard ranks traders on real on-chain results. Verified users can copy the strategy behind a rank.",
  },
] as const;

export type FeatureVisual = "bin" | "activity" | "agent" | "paper" | "cap" | "rank" | "signal" | "passkey";

export const features: { id: string; visual: FeatureVisual; title: string; text: string }[] = [
  {
    id: "bins",
    visual: "bin",
    title: "The narrative is the instrument.",
    text: "A bin groups markets that move together, like AI, energy or a theme in the headlines, into one position with a size per leg. Enter or rebalance the whole bin in one tap, on live prices.",
  },
  {
    id: "strategies",
    visual: "activity",
    title: "Rules, not hunches.",
    text: "Pick a rule-based strategy such as a Donchian breakout, regular buying, a grid or a trailing stop. Each one is a short set of rules you can read.",
  },
  {
    id: "agent",
    visual: "agent",
    title: "Describe it in one line.",
    text: "Type a trade the way you would say it: long MON, short BTC, 2x, $100, stop 8%. The agent drafts a strategy card with the legs, the stop and the risk checks. It only drafts. You approve every trade.",
  },
  {
    id: "test",
    visual: "paper",
    title: "Test before you risk a cent.",
    text: "Replay a strategy on real Perpl history, then let it trade fake money alongside the live market.",
  },
  {
    id: "cap",
    visual: "cap",
    title: "A hard cap on every run.",
    text: "Set the most a strategy may spend before it starts. Leverage is capped to your deposit, and margin is isolated per position.",
  },
  {
    id: "rank",
    visual: "rank",
    title: "A leaderboard you can follow.",
    text: "Traders are ranked on real on-chain results from Perpl. Verified users can copy the strategy behind a rank.",
  },
  {
    id: "signal",
    visual: "signal",
    title: "Let smart money confirm it.",
    text: "Turn on the optional Nansen signal and a card only opens when smart-money flows agree with its legs. Leave it off and nothing changes.",
  },
  {
    id: "keys",
    visual: "passkey",
    title: "Your keys. Your call.",
    text: "Your passkey signs every call. OpenCash never holds withdrawal power.",
  },
];

export const agentRows = [
  ["You", "long MON, short BTC, 2x, $100, stop 8%"],
  ["Card", "2 legs, stop 8%, $100 margin"],
  ["Checks", "Spread, slippage, liquidation distance"],
] as const;

export const strategyRows = ["Donchian breakout", "Regular buying", "Grid", "Trailing stop"] as const;

export const surfaces = [
  {
    tab: "Bins",
    audience: "FOR ANYONE WITH A VIEW",
    label: "THEMATIC BINS / ONE POSITION",
    facts: [
      ["Composition", "Markets that move together"],
      ["Pricing", "Each leg live off the Perpl order book"],
      ["Rebalance", "When you choose, never on a schedule"],
    ],
  },
  {
    tab: "Strategies",
    audience: "FOR RULE-BASED TRADERS",
    label: "STRATEGIES / TEST THEN RUN",
    facts: [
      ["Templates", "Breakout, regular buying, grid, trailing stop"],
      ["Testing", "Real Perpl history, then fake money"],
      ["Limits", "A hard spending cap per run"],
    ],
  },
  {
    tab: "Agent",
    audience: "FOR ANYONE WHO WANTS A HEAD START",
    label: "AGENT / DRAFT, CHECK, APPROVE",
    facts: [
      ["Input", "One line, like “long MON short BTC 2x $100”"],
      ["Output", "A card with legs, a stop and risk checks"],
      ["Control", "It drafts. You approve."],
    ],
  },
  {
    tab: "Leaderboard",
    audience: "FOR TRADERS AND FOLLOWERS",
    label: "LEADERBOARD / COPY",
    facts: [
      ["Ranked on", "Real on-chain results"],
      ["Copying", "For verified users"],
      ["Venue", "Perpl order book, Monad"],
    ],
  },
] as const;

export const phone = {
  markets: [
    ["B", "BTC", "Bitcoin"],
    ["E", "ETH", "Ethereum"],
    ["M", "MON", "Monad"],
  ],
} as const;

export const demoSteps = [
  {
    name: "Pick a bin",
    description: "Start with a theme: a bin pools markets that move together into one position.",
    next: "Test it",
  },
  {
    name: "Test it",
    description: "Replay it on real Perpl history, then on fake money. Nothing real is spent.",
    next: "Set the cap",
  },
  {
    name: "Set the cap",
    description: "Choose the most it may spend. The cap is yours and does not move on its own.",
    next: "Run it",
  },
  {
    name: "Run it",
    description: "It runs inside the cap. Your passkey signs the setup; OpenCash never holds withdrawal power.",
    next: "Start again",
  },
] as const;
