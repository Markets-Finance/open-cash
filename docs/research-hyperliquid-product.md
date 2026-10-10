# What to build on Hyperliquid — product research

Compiled 2026-10-03, branch `hood`. Web-sourced (search summaries and a few fetched pages);
figures are as reported by the cited source and **not re-verified on-chain** unless marked.
Builds on `research-hyperliquid.md`, `research-track1-market-structure.md` (Dreamcash teardown)
and the decisions in memory (leverage + bins, phone and web, no agent, no SIP).

---

## 1. Where we start from (memory)

- **binsx** (user's words, 2026-09-23, Monad): *"go from idea to trade in one click… thematic
  baskets… this trade-off between convenience and control is what binsx solves for."* The product
  sells narrative; the mechanism is a key that can trade but never withdraw.
- **hood pivot** (2026-10-02): Hyperliquid only. USP = leverage + bins, phone and web. Bins were
  last defined as *mirrors of institutions and large traders with public execution*.
- **Rejected already** (vault): better mobile perp venue, permissionless perp factory, options /
  vol perps, permissionless index perps ("stupid idea"), Quantum Markets.
- **Lens** (memory): retail leverage is lottery-ticket behaviour; narrative and novelty beat
  execution quality; loss aversion favours defined risk; visible activity is a liquidity input.

## 2. The market as it is now

### Frontends: a distribution race we can't win head-on
- 300+ apps have integrated builder codes; **$80M** paid to builders for 12.4M users and $253B
  volume. Top 10 by revenue: Phantom $20.6M, Based $15.1M, PVP $7.9M, MetaMask $6.5M, Insilico
  $3.3M, Infinex $2.7M, Axiom $2.3M, Tread.Fi $2.0M, Dreamcash $1.7M, Mass $1.4M (May 2026).
- New distribution giants are now *inside* Hyperliquid: **Coinbase's Base App** (up to 50x, 290+
  markets), MetaMask Perps, Phantom, OpenSea (hinted), Luno. Hyperliquid's own Android app shipped
  April 2026.
- Takeaway: a generic "Hyperliquid on your phone" app is a reskin competing with wallets that
  already own the user. **The product has to be a reason to trade, not a place to trade.**

### HIP-3 (equities, commodities, indices) is where the growth is
- HIP-3 went from ~2% of Hyperliquid perp volume at the start of 2026 to **~50%** by September.
  286 perp markets: 178 crypto + 108 trade.xyz (equities, commodities, indices, FX).
- Arrakis (Dec 2025–Mar 2026, 175,703 wallets, $161.4B):
  - Volume is concentrated: SILVER $78.6B, XYZ100 $40.1B, oil $34.1B, TSLA $2.2B.
  - **Retail share doubles on weekends** (12.1% → 28.4%) when CME is closed; stat-arb vanishes.
  - Retail median hold **83 minutes**; retail liquidation rate **21.4%**.
  - Frontend routing on HIP-3: Phantom $867M / 6,569 wallets; Dreamcash $568M / 1,278.
- Takeaway: retail comes to Hyperliquid to trade **macro and stocks when TradFi is shut** —
  a story-driven, time-boxed behaviour, exactly the lens's "narrative beats spread".

### Copy trading: crowded, and the value doesn't transfer well
- Already shipping: Dexly (iOS/Android, copy), Perpex (Android, copy + grid bots), HyperDash
  Copytrade ("Copy Score"), pvp.trade (Telegram, counter-trade friends), Hypercopy (browser),
  CopyLiquid (AI copy, launched Aug 2026), several open-source copy bots, native vaults.
- Native vaults: 10% performance fee; vault TVL fell from a **$604M peak to ~$184M** after
  manipulation attempts and flat stretches.
- A 90-day multi-exchange study (not Hyperliquid-specific): **97% of lead traders were profitable
  personally, but only 43.6% delivered positive returns to their followers**; 48.5% of copiers
  were profitable. Causes: lag/slippage, fees, different execution.
- Our own pulls (2026-10-02): the leaderboard has no names, the biggest wallets hold no perps,
  and many top-ROI accounts are a single concentrated position (a hot streak, not a strategy).
- Takeaway: **"mirror a whale" is a feature five apps already have, and its core promise is
  weak.** If bins stay leader-based, the differentiator has to be the thing nobody shows:
  what *followers* actually made.

### Baskets exist but are small
- **Pear Protocol** (pair and basket trading routed to Hyperliquid): Q1 2026 volume $249.6M,
  **$143K** quarterly fees, 6,646 active wallets; ~$979M cumulative on Hyperliquid by May 2026.
  Pro-leaning UI, crypto pairs.
- **S&P 2.0** (live 2026-07-08): native crypto *index* perps priced from validator-published
  medians. Crypto-only, index not theme.
- Takeaway: basket demand is real but modest when sold as a *trading tool*. Nobody sells it as a
  *story* across asset classes (stocks + commodities + crypto + outcomes) on a phone.

### HIP-4 outcome markets are young
- Live 2026-05-02; ~$100M first-month volume; 18 daily BTC binaries in the first two weeks.
- Builders can add up to 50% on top of the base fee, charged only on close/settle. One frontend
  (Outcomexyz) carried >10x the next at **zero** builder fee.
- Takeaway: too small to build on alone; useful as a *leg* inside a narrative bin later.

### The user we'd be serving loses money
- 74–86% of Hyperliquid traders are in loss (three analyses); small accounts worst: only 15.3%
  of $0–100 accounts win, and 27.2% of traders lost >85% of capital in 30 days.
- Takeaway: leverage is the draw, but an app whose users blow up churns. **Defined-risk leverage
  is a product feature, not a disclaimer.**

## 3. Product options

| # | Product | Bet on which behaviour | Evidence for | Evidence against |
|---|---|---|---|---|
| A | **Narrative bins** — one-tap themed trades across HIP-3 stocks/commodities + crypto (+ HIP-4 later): "AI capex", "Fed cuts", "oil shock", "weekend Nasdaq", each with long/short legs and one leverage dial | Narrative beats spread; more things to bet on | HIP-3 at ~50% of volume; nobody sells cross-asset themes on a phone; matches binsx wording | Pear shows baskets-as-a-tool stay small; partial fills across thin HIP-3 books |
| B | **Weekend / after-hours desk** — markets closed elsewhere, with "what moved and why" | Time-boxed, news-driven retail flow | Retail share doubles on weekends (12% → 28%) | Narrow if standalone; relies on trade.xyz liquidity |
| C | **Leader bins (current definition)** — mirror large traders, scaled, approve each change | Social proof, "smart money" | Data is public and live; we already built the reads | 5+ apps already do it; only ~44% of profitable leaders make followers money; no identities on the leaderboard |
| C′ | **Leader bins, done differently** — cohort bins (aggregate positioning of a filtered group, not one whale) + a *follower-outcome* score | Same, with less single-leader variance | Answers the documented failure | Still crowded; needs a backtest to prove followers win |
| D | **Defined-risk leverage** — every bin has a max loss, isolated margin per bin, auto-close at the cap | Loss aversion; retail fear of liquidation | 21% retail liquidation rate; 27% lose >85% in 30 days | Lower leverage per user may mean lower fees per user |

## 4. Recommendation (a hypothesis to test, not a decision)

**A + B as the product, D as the safety layer, C′ as one bin source rather than the definition.**

> OpenCash: trade the story, not the ticker — one-tap themed bins across stocks, commodities and
> crypto on Hyperliquid, 24/7 including weekends, with a max loss you choose before you tap.

Why this over leader-mirroring as the core:
- It's the only option nobody in the 300-app field is clearly doing.
- It rides the measured growth (HIP-3, weekends) instead of the crowded feature (copy).
- It keeps everything already built: leverage, the order path, builder fees, the trade UI.
- Leader data still appears, as a "smart money is long this theme" signal and as one bin type.

Revenue check: at 5 bps builder fee, $10M/month of bin volume ≈ $5K/month; Dreamcash-scale
($568M HIP-3 routed in ~4 months) would be ≈ $70K/month. Illustrative, not modelled.

## 5. What would change my mind / next checks

1. **Execution of a multi-leg bin on HIP-3 depth.** Pull `l2Book` for the top 20 `xyz` markets
   and measure what a $100 and $1,000 bin would cost in spread + slippage. If thin books make
   bins expensive, A narrows to the liquid core (SP500, XYZ100, silver, gold, oil, BTC, ETH).
2. **Follower-outcome backtest for C′.** Replay 90 days of `userFills` for 50 filtered leaders
   with a 2–10 s lag and our fees; if followers lose, leader bins are a signal, not a product.
3. **Weekend demand on our own markets.** Volume and wallet counts by weekday vs weekend for
   `xyz` markets from the API.
4. **Theme sourcing.** Who writes the bins — us (curated), an algorithm on live data, or
   creators (status motive from the lens)? Undecided.
5. **Regulatory framing** of themed equity-perp bins for retail. Not researched.

## Sources

- [Hyperliquid builder leaderboard (CoinGecko)](https://www.coingecko.com/research/publications/top-hyperliquid-builders)
- [Builder program tops $64M (The Currency Analytics)](https://thecurrencyanalytics.com/altcoins/hyperliquid-builder-program-tops-64m-as-phantom-and-based-lead-revenue-race-261485)
- [Who is trading on HIP-3 (Arrakis)](https://arrakis.finance/blog/who-is-trading-on-hip3)
- [HIP-3 near 50% of perp volume (The Block)](https://www.theblock.co/post/408064/hyperliquid-hip-3-markets-surge-50-perp-volume-onchain-stock-trading-grows)
- [Base App Hyperliquid perps (Yahoo Finance)](https://finance.yahoo.com/markets/crypto/articles/app-unveils-hyperliquid-powered-perps-191158790.html)
- [Awesome Hyperliquid copy trading (GemachDAO)](https://github.com/GemachDAO/awesome-hyperliquid-copy-trading)
- [CopyLiquid launch (GlobeNewswire)](https://www.globenewswire.com/news-release/2026/08/26/3351316/0/en/hyperliquid-news-copyliquid-set-to-launch-the-first-copy-trading-platform-on-hyperliquid.html)
- [Is copy trading profitable? 90-day study (YieldFund)](https://yieldfund.com/is-copy-trading-profitable-a-90-day-multi-exchange-study)
- [Hyperliquid vault strategies 2026 (Eco)](https://eco.com/support/en/articles/15197987-hyperliquid-vault-strategies-2026-hlp-and-user-vaults-explained)
- [Pear Protocol Q1 2026 report (Pine Analytics)](https://pineanalytics.substack.com/p/pear-protocol-q1-2026-quarterly-report)
- [S&P 2.0 launch (Crypto Briefing)](https://cryptobriefing.com/hyperliquid-sp-2-crypto-index-perps/)
- [HIP-4 builder fees and frontends (Arrakis on X)](https://x.com/ArrakisFinance/article/2057491856938946940)
- [86% of Hyperliquid traders losing (BeInCrypto)](https://beincrypto.com/hyperliquid-traders-profitability/)
- [10,000 Hyperliquid traders analysed (Medium)](https://medium.com/@envyprotocol/i-analyzed-10-000-hyperliquid-traders-the-results-are-brutal-a29adcca8c2a)
- [Liquid on Hyperliquid (Privy)](https://privy.io/blog/redefining-mobile-trading-with-liquid)

---

## 6. Data pulls, 2026-10-04 (mainnet, read-only, Sunday)

Scripts kept outside the repo (session scratchpad); method described here so it can be rerun.

### 6a. Smart-money cohort positioning

Filter on the 47k-row leaderboard: equity $200K–$200M, all-time PnL ≥ $500K, 30-day PnL > 0,
30-day volume ≥ $1M, 30-day ROI ≤ 300% (drops hot streaks) → **807 wallets**. Took the top 120 by
all-time PnL, read main + `xyz` positions, kept those with live positions, effective leverage
≤ 15x and ≤ 60 positions → **75 traders**.

| Finding | Number |
|---|---|
| Median equity | $10.7M |
| Median positions held | 3 |
| **Median effective leverage** | **0.9x** |
| Median share of book in the largest position | 63% |
| Single-position traders | 21 of 75 |
| Holding at least one `xyz` (HIP-3) position | 34 of 75 |

Where they agree (holders long / short): ZEC 13/4, **xyz:SKHX 8/1**, XRP 0/7 short, AAVE 5/1,
**xyz:SNDK 5/1**, **xyz:NVDA 5/2**, **xyz:DRAM 4/2**, **xyz:MU 4/2**, HYPE 18/10.
Where they don't: BTC 11/13, SOL 7/6, XYZ100 3/4, SUI 3/3.

**A theme emerges from the data on its own: memory/AI semis (SK hynix, SanDisk, DRAM, Micron,
Nvidia) — net long across the cohort.** That is a "smart-money theme" bin nobody had to write.

### 6b. How fast the cohort changes

`userFillsByTime`, last 7 days, same 75 traders:

| Finding | Number |
|---|---|
| Active trading days out of 7 | median **2** |
| New coins opened in 7 days | median **1** |
| Current positions opened or added to in the last 7 days | median **29%** |
| No fills at all in 7 days | 12 of 75 |
| Memory-semis theme positions touched in the last 7 days | 8 of 34 (26 older than a week) |

Positioning moves on a days-to-weeks clock, not seconds. A bin built from cohort positioning
would rebalance roughly weekly, so follower lag — the thing that breaks copy trading — barely
matters here.

### 6c. Entry cost on mainnet books

Cost vs mid for a market buy, in bps (spread in first column):

| Market | Spread | $20 | $200 | $2,000 | $20,000 |
|---|---|---|---|---|---|
| xyz:SKHX | 0.7 | 0.4 | 0.4 | 1.0 | 2.1 |
| xyz:SNDK | 0.6 | 0.3 | 0.3 | 0.3 | 1.2 |
| xyz:DRAM | 0.5 | 0.2 | 0.2 | 0.3 | 1.8 |
| xyz:MU | 0.9 | 0.5 | 0.5 | 0.5 | 1.8 |
| xyz:NVDA | 0.4 | 0.2 | 0.2 | 0.2 | 0.7 |
| xyz:SP500 | 0.4 | 0.2 | 0.2 | 0.2 | 0.2 |
| xyz:XYZ100 | 0.3 | 0.2 | 0.2 | 0.2 | 0.4 |
| xyz:GOLD | 0.2 | 0.2 | 0.6 | 0.8 | 0.9 |
| xyz:SILVER | 0.2 | 0.1 | 0.1 | 0.1 | 0.6 |
| BTC | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| ETH | 0.4 | 0.2 | 0.2 | 0.2 | 0.2 |
| HYPE | 0.1 | 0.1 | 0.1 | 0.2 | 2.0 |

Mainnet HIP-3 books are deep: **≤ 2 bps to enter $20K per leg** even on a Sunday. Fees (≈ 4.5 bps
main, ≈ 9 bps HIP-3, plus our builder fee) cost more than slippage. The thin books seen in testnet
work were a testnet artefact. Execution cost is **not** a reason to avoid multi-leg bins.

### 6d. What this changes

- **The synthesis holds up**: cohort positioning produces coherent themes (memory semis) with
  clear agreement on some names and none on others, and it moves slowly enough to rebalance weekly.
- **Single-leader bins look worse**: 21 of 75 top traders hold one position and the median trader
  has 63% of the book in one name — mirroring one person is mostly mirroring one bet.
- **Leverage tension**: the cohort runs ~1x. "Smart money at 10x" is not what smart money does.
  The leverage dial is ours to offer, but the honest framing is "their theme, your leverage", with
  the max-loss cap doing the protecting.
- **Minimum order**: $10 per leg means a 5-leg bin needs ≥ $50 notional (e.g. $17 of margin at 3x).

Caveats: one snapshot; survivorship bias (filtered on past profit); n = 75; leaderboard PnL may
include spot/HYPE gains; no consent from the traders whose aggregate positioning is shown.

## 7. 90-day backtest of smart-money bins (run 2026-10-05)

**Question:** would a follower of a weekly-rebuilt "smart-money theme" bin have made money, after
fees, lag and funding?

### Method
- Window: 90 days to 2026-10-05 (12 weekly rebuilds), mainnet, read-only.
- Candidate pool: top 220 leaderboard wallets by all-time PnL with $200K–$200M equity. 69 dropped as
  high-frequency (fill history exceeds the API's 10,000-fill reach) → **151 usable**.
- **Clean group (no hindsight):** ranked by all-time PnL *minus* PnL realised inside the window,
  i.e. track record before the test began. At each rebuild, the top 30 of them holding positions.
- **Hindsight group (for comparison only):** the original filters, which use the last 30 days —
  results that leak the future.
- Positions at each rebuild read from fill `startPosition` (validated: 39 of 47 end-of-window
  positions match the live account; the rest likely changed by liquidation/ADL/transfers).
- Bin: each trader's positions scaled by their gross exposure, averaged across the group; keep coins
  held by ≥ 3 traders; top 5 by net agreement; weights normalised.
- Follower enters 1 hour after each rebuild; costs = taker fee (4.5 bps main / 9 bps HIP-3) +
  5 bps builder fee + 1 bp slippage per unit of turnover; hourly funding charged.

### Results

| Strategy | 1x | 3x | Max drawdown (1x / 3x) |
|---|---|---|---|
| **Clean smart-money bin** | **+22.1%** | +46.6% | 17.9% / 47.3% |
| Clean, no entry lag | +21.0% | — | 18.0% |
| Clean, ≥ 2 holders instead of 3 | **−2.2%** | — | 14.4% |
| Hindsight group (biased) | +65.3% | +206.0% | 22.9% / 55.9% |
| Hold BTC | +31.1% | +92.9% | — |
| Hold ETH | +47.1% | +140.6% | — |
| Hold xyz:SP500 | +2.2% | +6.5% | — |

What the clean bin actually held: long HYPE, BTC, ETH (and a sliver of ZEC) almost every week.
Only ~20 traders in the pool held positions at any time. **No stock or commodity leg ever made the
cut**, even when loosened to ≥ 2 holders.

### What it says
1. **No edge without hindsight.** The honest version (+22%) lost to simply holding BTC (+31%) or
   ETH (+47%), at both 1x and 3x, with deeper drawdowns at 3x. It is crypto beta in a basket.
2. **Hindsight inflates it ~3x.** The same method on traders chosen with knowledge of the window
   shows +65% — the number a marketing page would show, and it is not real.
3. **Fragile.** Changing one threshold (3 → 2 required holders) moved the result from +22% to −2%.
4. **Lag is not the problem.** Entering 1 hour late made no difference; the problem is the signal.
5. **The memory-semis theme from 2026-10-04 did not reproduce** in the clean group's history —
   it came from the hindsight-filtered snapshot.

### Consequence for the product
- **Do not sell bins on "follow smart money and make what they make".** The data does not support
  it, and the hindsight version would mislead users.
- Smart-money positioning can still be shown as **context** ("12 large traders are long this"), not
  as the engine or a return promise.
- The bin's value has to come from **convenience and narrative** (one tap into a theme across
  stocks, commodities and crypto) and **risk control** (max loss), not alpha.

### Limits
90 days, one market regime (crypto up), small active pool (~20), leaderboard all-time PnL as the
only pre-window skill measure, coarse liquidation check (none occurred at 1x/3x), HIP-4 outcome
contracts and spot excluded. Scripts and raw data are in the session scratchpad (`bt/`), not the repo.

## 8. A trading primitive OpenCash can launch (researched 2026-10-05)

### Constraints
- **Not allowed by our own record** (vault `rejected-directions`): better venue, perp factory,
  options/vol perps, permissionless index perps.
- **Not affordable**: deploying a HIP-3 perp market needs 500K HYPE staked; a HIP-4 outcome market
  needs 1M HYPE. So the primitive can't be a new Hyperliquid market.
- **What a third party *can* launch**: HyperEVM contracts that read HyperCore through precompiles
  and act on it through **CoreWriter**. Actions available to a contract: limit order (1), vault
  transfer (2), spot send (6), USD class transfer (7), add API wallet (9), cancel by oid/cloid
  (10/11), **approve builder fee (12)**, send asset across dexes (13), borrow/lend (15),
  **outcome operation on HIP-4 (17)**. Orders and vault transfers are **delayed a few seconds** and
  **non-atomic**: the EVM transaction succeeds even if the Core action later fails.
- Prior art on HyperEVM: ERC-4626 vault tokens are an established pattern (Liminal delta-neutral
  yield tokens, Hyperbeat vaults incl. HIP-3 liquidity strategies, Kinetiq kHYPE, Felix feUSD;
  open-source `hypervault` tokenises HyperCore vaults). **No themed, multi-leg, leveraged
  position token was found.**

### Candidates

| # | Primitive | What the user holds | Feasible without stake | Rejection check | Main risk |
|---|---|---|---|---|---|
| P1 | **Bin token** — an ERC-20 on HyperEVM backed by a contract that holds a multi-leg position on HyperCore (main + `xyz`) via CoreWriter; mint/redeem with USDC; NAV from precompiles | One token = one theme | Yes | Not a new market, no new oracle, not an index perp — real positions on existing books | Non-atomic CoreWriter accounting; contract risk |
| P2 | **Constant-leverage bin token** — P1 at fixed 2x/3x; the contract rebalances to target leverage, so the holder can't be liquidated | "3x AI chips" as one token, no margin calls | Yes | Leveraged-token shape, not options | Volatility decay in choppy markets; user confusion (Binance delisted FTX leveraged tokens in 2020 citing it, then launched its own) |
| P3 | **Protected leverage** — perp plus a HIP-4 binary as a floor (contract can trade outcomes via action 17) | Leverage with a bought floor | Partly — HIP-4 markets are mostly daily BTC binaries | Options-adjacent; closest to a rejected line | Narrow market set; complexity |
| P4 | **Capped-loss position** — gap risk taken by an OpenCash backstop vault for a premium | Leverage with a guaranteed stop | Yes | It *is* a barrier option sold by us — effectively rejected | We become the counterparty |

### Recommendation: P1 with P2 as its leverage mode — "Bin Tokens"

> A theme you hold as one token — 1x, 2x or 3x — that can't be liquidated, minted and redeemed for
> USDC, backed by real positions on Hyperliquid's books.

Why this one:
- It **is** the USP (leverage + bins) turned into an object, not a UI over someone else's venue.
- **Pooling fixes the $10-per-leg minimum.** A user with $5 can hold a 5-leg theme because the
  contract trades in aggregate.
- **No liquidation for the holder** speaks to the measured pain (74–86% of traders lose; 27% lose
  > 85% in 30 days) and to loss aversion in the psychology lens.
- **Composable**: a token can be sent, used as collateral in HyperEVM lending, or traded on a DEX;
  creators can launch bins (status motive) without us writing every theme.
- **Revenue**: mint/redeem fee + builder fee on every rebalance order (the contract approves our
  builder via action 12) + optional management fee.
- Nobody on HyperEVM is doing themed multi-leg leveraged tokens (as far as this search found).

What would kill it:
1. **Decay.** Constant leverage loses in sideways chop. Needs a simulation on real hourly data for
   real theme legs before any build.
2. **CoreWriter mechanics.** Delayed, non-atomic orders make NAV, mint and redeem accounting hard;
   a mint priced before its orders fill invites arbitrage against other holders.
3. **Regulation.** A token giving leveraged exposure to US equities looks like an unregistered ETF
   or security-based swap. Needs legal review before mainnet.
4. **Contract risk.** Pooled user funds in a new contract need an audit.

### Next research steps
1. **Decay simulation** (data in hand): 90 days of hourly prices for 3–5 theme baskets; compare
   1x/2x/3x constant-leverage tokens (daily and threshold rebalancing) vs holding the perps at the
   same leverage, after fees and funding.
2. **CoreWriter feasibility on testnet**: a minimal contract that mints a share, opens two legs via
   CoreWriter, reads NAV via precompile, and redeems — measure the delay and failure behaviour.
3. **Legal framing** of tokenised equity-perp exposure (out of scope for data work; flag to a lawyer).

### Sources
- [Interacting with HyperCore (Hyperliquid docs)](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore)
- [CoreWriter: what builders need to know (HypeRPC)](https://hyperpc.app/blog/hyperliquid-corewriter)
- [hypervault — ERC-4626 vault over HyperCore](https://github.com/adamocallaghan/hypervault)
- [HyperEVM yield strategies (Hyperliquid Guide)](https://hyperliquidguide.com/ecosystem/hyperevm-yield-strategies)
- [Top HyperEVM projects 2026 (Datawallet)](https://www.datawallet.com/crypto/top-hyperevm-projects)
- [Binance delists FTX leveraged tokens (Crypto Briefing)](https://cryptobriefing.com/binance-delists-leveraged-tokens-cites-user-confusion/)
- [Binance launches its own leveraged tokens (BeInCrypto)](https://beincrypto.com/binance-launches-its-own-leveraged-tokens-after-delisting-ftxs-version/)

## 9. Reference check — HLH Seoul 2025 winners (2026-10-05)

User-supplied list, cross-checked against WuBlockchain / BlockBeats / Bitget write-ups:

| Place | Project | Prize | What it is (per write-ups) |
|---|---|---|---|
| 1 | Hyperliquid Copilot (Wildmeta) | 12,000 USDC | AI agent: strategy → execution |
| 2 | EdgeScan | 8,000 USDC | Security scanner for Hyperliquid/HyperEVM — one write-up instead says "visual portfolio mapper"; sources disagree |
| 3 | HODL Bot | 6,000 USDC | Telegram group bot, long-term + risk management, unifies spot/perp/EVM |
| 4 | Hyper Homo | 4,000 USDC | Vault system for **private strategy monetization** (the pasted list says "social copy-trading") |
| 5 | STIBS | 3,000 USDC | **Social trading and discovery** (the pasted list says "yield smoothing") |

Places 4 and 5 differ between the pasted list and the published write-ups; treat both descriptions
as unconfirmed until checked against the project repos.

What it says about OpenCash's primitive:
- Judges rewarded **execution help** (copilot, bots), **safety** (scanner, risk-managed bots) and
  **strategy distribution** (vaults, social). None of the 13 winners is a tokenised, themed,
  leveraged position — Bin Tokens would not be a repeat.
- The risk-management thread (HODL Bot; STIBS if it is yield smoothing) supports leading Bin Tokens
  with **"can't be liquidated"** rather than with returns.
- Copy/social keeps appearing (Hyper Homo, STIBS) — consistent with §2: crowded.

Upcoming: **HYPE Singapore 2026, Oct 6–7 2026** (TOKEN2049 week), reported $50K+ prizes, 150+ devs,
mission "ship what only Hyperliquid makes possible … new primitives". Tracks not yet published in
what was found; the event pages returned 404. Unverified beyond search summaries.

## 10. Beyond bins — AI, bots, interface, risk (researched 2026-10-05)

### What already exists (so it is not unique)

| Category | Who | Evidence |
|---|---|---|
| Autonomous AI trading agent | **Senpi** (Telegram chat agent, 31 tools, memory; coach/copilot/autonomous), Wildmeta Copilot (HLH 1st place), Coinbase AI tools (June 2026) | Senpi: >$100M volume since Jan 2026, "fastest-growing Hyperliquid consumer app", claims 40% user win rate |
| AI trading performance | **Alpha Arena** (frontier LLMs, $10K each, real USDC on Hyperliquid) | Lost ~1/3 of capital; 6 of 32 rounds profitable; one model made 158 trades, another 1,418 on identical instructions. ">80% of retail bot users lose" |
| Bots / algos | 3Commas, WunderTrading, Gainium, Finestel, Bitsgap, Hummingbot, goodcryptoX, open-source grid/DCA bots | Grid, DCA, TWAP, funding arb all covered; native HL lacks grid/DCA but third parties fill it |
| Swipe / gamified UI | Polyswipe (Polymarket), NFA Club, Swipe app | Exists in prediction markets and spot, not found for HL perps |
| Chart order entry | TradingView mobile (drag order lines, place from price scale) | Solved |
| Copy / social | see §2, §9 | Crowded |

### Where the gaps are (things only Hyperliquid makes possible, or nobody does there)

**G1. Weekend / Monday-gap trading — only possible on Hyperliquid (24/7 stock, index, commodity perps).**
- Retail share of HIP-3 volume doubles on weekends (12% → 28%).
- Weekend prices predict the Monday reopen for **indices and commodities**: TradeXYZ's pre-open price was
  closer to the reopen than Friday's close in 78.4% of 199 symbol-weekends (median error 92.8 → 38.4 bps);
  one market maker saw a 90% direction hit rate on gold, silver and NQ; another source: weekend drift
  retained through Monday (correlation 0.855). **But not single stocks**: across 23 equity markets the
  weekend mid beat the oracle open only 50.7% of the time.
- Primitive: a **time-boxed "gap position"** — opened over the weekend, auto-closes at the TradFi reopen —
  plus a weekend desk ("what moved while Wall Street was closed"). No competitor found.
- Caveat: weekend prices already price most of the gap, so this is **access and narrative, not alpha**.

**G2. Guardrails — leverage you can't blow up.**
- 74–86% of Hyperliquid traders lose; 27% lose > 85% in 30 days (§2).
- Prop firms (Topstep) enforce daily loss limits; opt-in cool-off timers after losses are an established
  behavioural-finance pattern against revenge trading. (Corrected in §12: Senpi already ships these.)
- Primitive: **pre-committed risk rules the app enforces**: daily loss limit, cool-off after a loss,
  leverage cap by tier and deposit (already decided), max loss per position or bin, auto-reduce at the
  limit. Enforceable because orders go through our agent key (and, on-chain, through a CoreWriter contract).

**G3. AI as translator, not trader — headline → defined-risk trade.**
- Autonomous AI trading is crowded (Senpi) and loses money when the model decides (Alpha Arena).
- The open lane: the user brings the view; AI turns a headline or a sentence ("oil spikes if Iran…")
  into a **structured trade across HL markets** (stocks, commodities, crypto, outcomes) with legs,
  size, leverage and a max loss, shown before one tap. The AI never trades on its own.
- Fits the psychology lens (narrative beats spread) and HIP-3's breadth. Model provider default per
  user rules: NVIDIA NIM (`openai/gpt-oss-20b`).

**G4. Bin Tokens** (§8) — the on-chain container: a theme at 1x–3x, no holder liquidation, pooled so small
accounts clear the $10-per-leg minimum.

### Not recommended
Grid/DCA bots (crowded, third parties own it), autonomous AI agent (Senpi; poor results), copy trading
(crowded; weak for followers, §7), swipe UI alone (a skin, not a reason to trade).

### How they fit together

> **OpenCash: trade the news, any hour, with a max loss.**
> A headline (G3) becomes a bin (G4), tradable on weekends when nothing else is open (G1), under rules
> you set that the app enforces (G2).

Only G1 is impossible elsewhere; G2 and G3 are the parts users feel; G4 is the on-chain primitive.

### Next checks
1. Weekend data on our own markets: HIP-3 volume and wallet counts by hour of week from the API.
2. Guardrail demand: how often HL traders get liquidated soon after a loss (revenge-trading signature)
   — from `userFills` of the 151-trader pool or a broader sample.
3. Headline→trade prototype quality: 20 real headlines, model proposals scored for correct markets,
   sensible legs and risk (offline, no orders).

### Sources
- [Senpi launch (The Defiant)](https://thedefiant.io/news/press-releases/senpi-launches-the-first-personal-trading-agents-for-hyperliquid)
- [AI bots auditioning for Wall Street are mostly losing](https://www.unionleader.com/news/business/ai-bots-auditioning-for-wall-street-trading-are-mostly-losing/article_47ea31e4-e4b3-4c68-814a-1dee364fb9a2.html)
- [AI trading bots in 2026 (Babypips)](https://www.babypips.com/news/explainer-ai-trading-bots-what-they-can-and-cant-do-2026-05-09)
- [Top Hyperliquid trading bots 2026 (Chainstack)](https://chainstack.com/hyperliquid-trading-bots-2026/)
- [Best Hyperliquid bots compared (Finestel)](https://finestel.com/blog/best-hyperliquid-bots-compared/)
- [Polyswipe](https://polymark.et/product/polyswipe)
- [Weekend price discovery (Messari)](https://messari.io/report/weekend-trading-evidence-of-price-discovery-in-hyperliquid-s-weekend-markets)
- [Weekend price discovery in 24/7 markets (0xArchive)](https://0xarchive.io/blog/hyperliquid-weekend-price-discovery-in-24-7-markets)
- [What weekend on-chain prices say about Monday (Insider Monkey)](https://www.insidermonkey.com/news/what-weekend-on-chain-prices-say-about-monday-and-what-they-dont-1842401/)
- [Daily loss limit (Topstep)](https://www.topstep.com/blog/what-is-a-daily-loss-limit)
- [Behavioural design in trading apps](https://openwebsolutions.in/blog/behavioral-design-trading-apps-ux-patterns/)

## 11. "Stay exposed to the upside, with a floor underneath" (2026-10-06)

User direction: a product where the user keeps upside exposure while a floor limits the loss.

### Building blocks on Hyperliquid
- **Yield for the safe part**: HyperCore native borrow/lend went live 2026-09-18 ($269M borrowed on day
  one). Stablecoin **borrow** rate = 5% flat below 80% utilisation (`0.05 + 4.75·max(0, util − 0.8)`); the
  **lend** rate is lower and variable (not measured here — simulation assumes 4%). Portfolio-margin
  accounts also earn yield on idle borrowable assets. A contract can lend via CoreWriter action 15.
- **A hard cap on the risky part**: an isolated-margin perp can never lose more than its margin.
- **No options needed.** Option-based floors elsewhere mostly died: 9 of 13 DeFi structured-product
  protocols adjusted or discontinued (Ribbon merged into Aevo; Cega, Thetanuts changed course). Options are
  also on our rejected list.

Two ways to build a floor from those blocks:
1. **Barbell**: put *F%* in USDC earning yield, the rest as an isolated perp "sleeve". Worst case = the
   sleeve goes to zero, so the floor is ≈ *F%* plus interest — **a hard floor**, no rebalancing.
2. **CPPI** (Black & Jones 1987): keep exposure = *m* × (value − floor), rebalanced; more upside early, but
   exposure shrinks after losses ("cash-lock") and fast moves between rebalances can break the floor.

### Simulation (two years of Hyperliquid data, rolling 90-day windows)
4-hour candles and actual hourly funding from 2024-09 (BTC, ETH) and 2024-12 (HYPE) to 2026-10; 96/96/83
windows, stepped weekly; $100 start; costs 10.5 bps per unit traded (taker + builder + slippage); funding
charged; liquidation checked against 4-hour lows; safe part earns 4%/yr.

Unprotected baseline:

| | BTC | ETH | HYPE |
|---|---|---|---|
| Perp 1x — windows ending below $90 | 49% | 52% | 34% |
| Perp 3x — windows ending below $90 | 54% | 57% | 41% |
| Perp 1x — worst 90 days | $67.5 | $45.6 | $42.1 |

Floored (every floored strategy ended **at or above its floor in 100% of windows**):

| Strategy | Floor | Upside participation | Upside capture (median, up-windows) BTC / ETH / HYPE | Ended above $100 BTC / ETH / HYPE |
|---|---|---|---|---|
| 95/5, sleeve 10x | $95.9 | 0.5x | 52% / −5% / −6% | 35% / 20% / 22% |
| 95/5, sleeve 20x | $95.9 | 1.0x | −11% / −8% / −7% | 17% / 12% / 11% |
| **90/10, sleeve 5x** | **$90.9** | **0.5x** | **53% / 51% / 51%** | **42% / 34% / 42%** |
| 90/10, sleeve 10x | $90.9 | 1.0x | 101% / −12% / −13% | 35% / 20% / 22% |
| **80/20, sleeve 5x** | **$80.8** | **1.0x** | **102% / 100% / 100%** | **42% / 34% / 42%** |
| CPPI floor 90, m=4 | ~$91 | dynamic | 35% / 31% / 6% | — |
| CPPI floor 90, m=8 | ~$91 | dynamic | 25% / 18% / −15% | — |

### What it says
1. **The floor holds.** Barbell floors are mechanical (isolated margin), so no window broke them. Unprotected
   1x ended below $90 in about half of all 90-day windows.
2. **Sleeve leverage must stay ≤ ~5x.** At 10–20x the sleeve is knocked out by an ordinary 5–10% dip
   *before* the rally, so on ETH and HYPE you keep the floor and miss the upside (negative capture). At 5x the
   sleeve survives normal volatility and captures its full participation (~51% at 0.5x, ~100% at 1x).
3. **The trade-off is one dial**: floor depth buys upside. With a 5x sleeve,
   participation ≈ (100 − floor) × 5 / 100 → **90% floor = 0.5x upside; 80% floor = 1x upside.**
4. **CPPI loses to the barbell here**: it cash-locks after early losses (low capture) and, rebalanced every
   4 hours, briefly breached the floor intrabar in 0–41% of windows. Faster rebalancing would help but costs
   more. The barbell is simpler, cheaper and has a harder floor.

### Product shape: "Floor"
> Pick your floor. Keep the upside. — "You can't end below $90. You get half of every move up."

- The user picks a floor (e.g. 80/90/95%) and a market or bin; the app splits the deposit into lent USDC
  plus an isolated 5x sleeve and shows: worst case, participation, and the yield that funds it.
- Works for a single market, a bin (sleeve = bin legs) and, later, a **floored Bin Token** (contract holds
  the loan + sleeve via CoreWriter) — no volatility decay, unlike constant-leverage tokens (§8).
- Revenue: builder fee on sleeve orders; optional spread on yield or a small management fee.
- Not an option: no premium, no counterparty writing protection, no new market — just lending + isolated
  margin, both native to Hyperliquid.

### Limits and checks still open
- The lend rate on HyperCore was assumed (4%); measure the real rate and its swings.
- Weekend gaps on `xyz` legs: isolated margin still caps loss, but sleeve knock-outs may be more frequent;
  not simulated (data was BTC/ETH/HYPE only).
- 4-hour candles understate intrabar wicks; a 1-minute rerun would show more sleeve knock-outs at higher
  leverage. Two years, three assets; one market regime per asset.
- Legal framing of "floor" language (could read as a guarantee) needs review.

### Sources
- [HyperCore borrow and lend explained](https://hyperliquidguide.com/guides/trading/hypercore-borrow-lend)
- [Hyperliquid launches lending (Forklog)](https://forklog.com/en/hyperliquid-launches-lending-and-borrowing-service/)
- [Users borrow $269M on day one (Yahoo Finance)](https://finance.yahoo.com/markets/crypto/articles/hyperliquid-users-borrow-269-million-092820203.html)
- [Portfolio margin (Hyperliquid docs)](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- [CPPI introduction (Quantpedia)](https://quantpedia.com/introduction-to-cppi-constant-proportion-portfolio-insurance/)
- [Risks in CPPI products (Delta Quants)](http://www.deltaquants.com/Introduction-to-risks-in-CPPI-products)
- [Crypto structured products come of age (Risk.net)](https://www.risk.net/our-take/7955057/crypto-structured-products-come-of-age)
- [Structured products in crypto (Premia)](https://blog.premia.blue/p/structured-products-in-crypto)

## 12. Taken ideas as inspiration (2026-10-06)

User direction: products already on the market are fine as inspiration — borrow what works.

### Correction to §10
§10 said guardrails were "not found in any Hyperliquid app". **That was wrong.** Senpi ships five guard
rails — daily loss halt, drawdown halt, consecutive-loss cooldown, per-asset cooldown, max entries per
day — enforced "fail-closed" (if risk state can't be read, nothing opens), plus a "two-phase dynamic
stop-loss" with a defending floor and profit-locking tiers. Guardrails are **proven demand, not a gap**.
What Senpi's floor is not: it is stop-based, so a fast move can gap through it. The §11 barbell floor is
mechanical (lent USDC + isolated margin) and cannot be gapped below.

### What to borrow, from whom

| Source | What they do well | How OpenCash uses it |
|---|---|---|
| **Senpi** (AI agent) | Guard rails, fail-closed; strategies validated before real money; audit trail; "did I sell too early?" coaching; isolated sub-wallet per strategy; MCP for Claude/ChatGPT | Guardrails as the account-level floor; **one isolated sub-account per Floor/bin** so a sleeve can't touch the floor; post-trade coaching against the floor ("your floor saved $X"); backtest a bin before money goes in |
| **Pear** (pairs/baskets) | One-click multi-leg entry; TP/SL on the **ratio**, not each leg; ratio charts; custom weights; cross margin across legs; TWAP for size | Bins get **one chart for the whole basket**, TP/SL on basket value, adjustable weights; TWAP for large bin entries |
| **Polyswipe** (prediction markets) | Swipe right = yes, left = no, up = skip; feed filtered by interests; leaderboards; tiered referrals | **Swipe a feed of themes/headlines**: right = take it with your default floor, left = take the other side, up = skip. Interest-filtered feed; referral tiers |
| **Liquid** (mobile HL app) | Email sign-up in seconds; yield on idle balance; curated news; voice AI planned | Idle balance always earning (it *is* the floor's yield source); news next to markets feeds the AI translator |
| **Dreamcash** (§1, earlier teardown) | Gasless permit deposit; builder fee on routed flow; USDT0 collateral wedge | Gasless deposit; builder fee on every sleeve order |
| **Pear's Agent Pear / Senpi Quant Desk / HyperDash** | Signals, smart-money radar, trader scoring | **Context only** ("12 large traders are long this theme") — §7 showed it is not an engine |
| **Hyper Homo** (HLH #4) | Monetising private strategies via vaults | Creator bins later: a creator publishes a theme, earns a share of the builder fee |

### Resulting product sketch
> **OpenCash — leverage with a floor.**
1. **Feed** (Polyswipe + Liquid news): themes and headlines; swipe right to take one with your floor.
2. **Floor positions** (§11, ours): pick a floor, get upside participation; lent USDC + isolated ≤5x sleeve,
   each in its own sub-account (Senpi).
3. **Bins** (Pear): the sleeve can be a basket — one chart, basket-level TP/SL, adjustable weights.
4. **Guardrails** (Senpi): daily loss halt, cooldown after losses, leverage by tier; fail-closed.
5. **AI translator** (Senpi tools, Liquid voice later): headline → proposed floored bin; the user approves.
6. **Coaching** (Senpi): what the floor saved, what the user would have made unfloored.

What is ours and not borrowed: the **mechanical floor** (barbell on native lending + isolated margin) and
putting a floor under every theme. Everything else is a proven pattern rearranged around it.

Sources: [Senpi capabilities](https://senpi.ai/capabilities), [Pear Protocol](https://www.pear.garden/),
[Polyswipe](https://polymark.et/product/polyswipe), [Liquid on Hyperliquid (Privy)](https://privy.io/blog/redefining-mobile-trading-with-liquid).

## 13. Floor — real lending rate and stocks/commodities (2026-10-06)

### Real USDC lending rate (`allBorrowLendReserveStates`, live read)
| Reserve | Supply (lend) APY | Borrow APY | Utilisation | Supplied | Borrowed |
|---|---|---|---|---|---|
| USDC (0) | **3.47%** | 5.00% | 77.2% | $541.6M | $418.1M |
| USDT0 (268) | 2.30% | 5.00% | 51.2% | $2.77M | $1.42M |
| USDH (360) | 0.49% | 5.00% | 11.0% | $0.17M | $0.02M |

Point-in-time only (the API has no rate history). At 3.47% the 90-day floor on $90 is $90.76 instead of
$90.88 at the assumed 4% — immaterial. Above 80% utilisation borrow cost rises steeply
(`0.05 + 4.75·(u − 0.8)`), which would lift the supply rate.

### Hourly simulation including HIP-3 markets
Data: 1-hour candles and funding, **2026-03-12 → 2026-10-06** (the API only keeps the latest 5,000 hourly
candles). 17 rolling 90-day windows per market, stepped weekly (overlapping, so not independent).
Floor checked against hourly lows. Yield 3.47%. Costs 10.5 bps per unit traded on crypto, 15 bps on `xyz`.
"KO" = the sleeve was liquidated (user ends at the floor). "Capture" = median share of the 1x move kept in
windows where 1x gained > 5%.

| Market | 1x unfloored: windows < $90 / worst | 90/10 @5x KO · capture | 80/20 @5x KO · capture | 90/10 @3x KO · capture | 80/20 @3x KO · capture |
|---|---|---|---|---|---|
| BTC | 59% / $77.6 | 41% · 52% | 41% · 102% | 0% · 33% | 0% · 63% |
| ETH | 65% / $75.8 | 71% · 51% | 71% · 100% | 29% · 32% | 29% · 61% |
| HYPE | 0% / $101.8 | 24% · 51% | 24% · 100% | 0% · 32% | 0% · 61% |
| xyz:SP500 | 0% / $100.4 | 0% · 56% | 0% · 105% | 0% · 37% | 0% · 66% |
| xyz:XYZ100 | 0% / $93.9 | 0% · 54% | 0% · 103% | 0% · 34% | 0% · 64% |
| xyz:GOLD | 47% / $79.8 | 6% · 63% | 6% · 111% | 0% · 43% | 0% · 72% |
| xyz:SILVER | 65% / $70.0 | 71% · 56% | 71% · 105% | 6% · 36% | 6% · 65% |
| xyz:CL (oil) | 53% / $76.1 | 76% · 51% | 76% · 101% | 12% · 32% | 12% · 62% |
| xyz:NVDA | 0% / $90.7 | 0% · 56% | 0% · 105% | 0% · 37% | 0% · 66% |
| xyz:TSLA | 47% / $72.5 | 53% · 55% | 53% · 104% | 6% · 36% | 6% · 65% |

**The floor held in every window on every market**, stocks and commodities included. Of all sleeve
knock-outs across the ten markets, **5 happened on a weekend** (ETH 2, HYPE 2, oil 1); weekend gaps were not a
special problem in this sample.

### What it says
1. **The dial holds on hourly data and on HIP-3**: capture ≈ participation everywhere — 90/10@5x keeps
   ~50–60% of up-moves, 80/20@5x ~100–110%, 3x sleeves ~0.3x / ~0.6x.
2. **Knock-outs happen mostly in losing windows**, which is the floor doing its job — capture in winning
   windows stayed at full participation at 5x. In this period (crypto, silver and oil fell), 5x sleeves
   were knocked out in 41–76% of windows on BTC, ETH, silver, oil and TSLA, so many users would sit at their
   floor for the rest of the window.
3. **3x sleeves almost never knock out** (0–29%) but give up participation. The choice is "lower
   leverage, survives" vs "5x, more upside per dollar of sleeve".
4. **Unfloored 1x lost more than 10% in about half the windows** on BTC, ETH, gold, silver, oil and TSLA, and
   up to 30% (silver). That is the case for the product.

### Product implications
- Default: a **5x sleeve** with the floor chosen by the user; offer 3x as "steadier".
- When a sleeve is knocked out the user is parked at the floor with lent USDC earning 3.47%. The product needs
  a clear **re-arm** step (start a new sleeve from the floor, which lowers the floor) — a UX decision, not a
  mechanism problem.
- Equity and index perps (SP500, XYZ100, NVDA) were the calmest underlyings in this period: 0% knock-outs at
  5x. A floored stock bin is a natural first product.

### Limits
Seven months, one regime; 17 overlapping windows per market; hourly lows can still miss intra-hour wicks;
lend rate is a single reading; isolated-margin liquidation modelled as price ≤ entry × (1 − 1/lev + 0.5%).

## 14. Bin Token decay simulation (2026-10-10)

The vault's open question for Bin Tokens (§8): do constant-leverage theme tokens bleed too much to
be worth launching? Simulated on real data, read-only, no orders.

### Method
- **Data:** Hyperliquid mainnet 1-hour candles and actual hourly funding for every leg of 7 bins,
  2026-03-16 → 2026-10-10 (≈208 days; memory-chips 159 days because `xyz:DRAM` lists later,
  global-indices 184 days because of `xyz:JP225`). Legs aligned on common hours.
- **Token:** start each period with exposure = L × value, split by the bin's weights; rebalance back
  to L × value daily (24 h) or weekly (168 h). Funding charged hourly on each leg's exposure.
- **Hold:** same L × weights opened once and held (no rebalance), funding charged.
- **Costs:** taker + 1 bp slippage on every unit traded (main 5.5 bps, xyz 10 bps), on entry, every
  rebalance and exit. No builder fee.
- **Decay drag** = token return − L × (1x hold return), in bps, over rolling 30-day windows stepped
  weekly (19–26 windows per bin).
- **Chop vs trend:** each window's efficiency ratio (net basket move ÷ sum of hourly moves); bottom
  third = chop, top third = trend.
- **Wipe:** token value ≤ 0 within a window (a 3x token without protection is wiped by a −33% basket
  move inside one rebalance period).

### Results (median drag per 30 days, bps; negative = token underperforms L × basket)

| Bin | Rebal | 2x drag (chop / trend) | 3x drag (chop / trend) | 3x worst 30d drawdown | Full period 3x token vs 3x hold |
|---|---|---|---|---|---|
| us-large-cap | daily | −10 (−14 / +42) | −33 (−40 / +132) | 18% | +63.0% vs +58.3% |
| global-indices | daily | −13 (−34 / +4) | −36 (−105 / +7) | 21% | +62.3% vs +57.9% |
| metals | daily | −45 (−59 / +48) | −139 (−216 / +164) | 47% | −62.7% vs −70.1% |
| oil-shock | daily | +25 (−22 / +99) | −98 (−197 / +313) | 49% | −17.6% vs −6.8% |
| crypto-majors | daily | −32 (−100 / +250) | −111 (−327 / +709) | 69% | +4.3% vs +36.8% |
| ai-compute | daily | −53 (−203 / +581) | −263 (−850 / +1827) | 56% | +249.6% vs +247.3% |
| memory-chips | daily | −182 (−807 / +296) | −487 (−2416 / +1220) | 87% | −33.1% vs +85.3% |

Weekly rebalancing roughly halves the median drag on index and metals bins (e.g. us-large-cap 3x
−22 bps, metals 3x −25 bps) but makes the worst windows worse (metals 3x worst −1148 bps vs −446).

**No 3x token was wiped** in any window of any bin: no basket fell 33% inside a single day or week
in this period.

### What it says
1. **The textbook shape holds on real HL data**: constant leverage loses in chop and gains in trends,
   and the size of both scales with the basket's volatility.
2. **Index bins are fine.** us-large-cap and global-indices lose 0.1–0.4% a month at 3x and beat a
   held 3x position over the full period (+63% vs +58%). Drawdowns stay near 20%.
3. **Volatile theme bins are not.** memory-chips at 3x lost 33% while holding the same 3x basket
   made 85%; its chop windows cost 24% a month. crypto-majors 3x made 4% vs 37% held.
   ai-compute broke even only because it trended hard.
4. **Wipe-out risk is not the problem; drag and drawdown are.** The 3x tokens survived, but sat 50–87%
   below peak on the volatile bins, which retail holders experience as a loss.

### Go / no-go
- **Go, narrowly:** constant-leverage Bin Tokens on **index and large-cap bins at 2x–3x**, rebalanced
  weekly (less fee drag), with the drag disclosed.
- **No-go:** constant leverage on **single-sector or crypto bins** (memory-chips, ai-compute,
  crypto-majors) and on commodities above 2x. For those, the **floor structure** (§11, §13) is the better
  leveraged product: it caps the loss instead of bleeding in chop.
- **Product implication:** Bin Tokens and floors are complements: tokens for calm index exposure,
  floors for the narrative bins people actually want to bet on.

### Limits
One ~7-month regime; 19–26 overlapping windows per bin; hourly closes (intra-hour wicks ignored); held
positions counted as wiped only at zero equity (real liquidation happens earlier, which flatters the
hold baseline at 3x); no builder fee; weights and leverage as in the catalog; slippage flat at 1 bp
(fine for these books at small size, optimistic at scale). Scripts and data in the session scratchpad
(`decay/`), not the repo.
