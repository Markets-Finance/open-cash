import { createHlInfo, getAccount, getSpotBalances, suppliedUsdc, type HlNetwork } from "shared";
import { isAddress } from "viem";

const dexes = ["", "xyz"];

export async function walletView(net: HlNetwork, input: string) {
  if (!isAddress(input)) return { error: "Enter a valid address." as const };
  const address = input as `0x${string}`;
  const info = createHlInfo(net);
  const [accounts, spot, lent, fills, role] = await Promise.all([
    Promise.all(dexes.map((dex) => getAccount(info, address, dex))),
    getSpotBalances(info, address),
    suppliedUsdc(info, address),
    info.userFills({ user: address }),
    info.userRole({ user: address }),
  ]);
  if (role.role === "missing") return { found: false as const, network: net, address };
  const positions = accounts.flatMap((account) =>
    account.positions.map((p) => {
      const mark = Math.abs(p.size) > 0 ? Math.abs(p.positionValue / p.size) : 0;
      return {
        ...p,
        markPx: mark,
        liquidationDistancePct: p.liquidationPx && mark > 0 ? (Math.abs(mark - p.liquidationPx) / mark) * 100 : null,
      };
    }),
  );
  const perpFills = fills.filter((f) => !f.coin.startsWith("@") && !f.coin.startsWith("#") && !f.coin.includes("/"));
  const closes = perpFills.filter((f) => Number(f.closedPnl) !== 0);
  const realizedUsd = perpFills.reduce((sum, f) => sum + Number(f.closedPnl), 0);
  const feesUsd = fills.reduce((sum, f) => sum + Number(f.fee), 0);
  return {
    found: true as const,
    network: net,
    address,
    perpEquityUsd: accounts.reduce((sum, a) => sum + a.equity, 0),
    withdrawableUsd: accounts.reduce((sum, a) => sum + a.withdrawable, 0),
    spot: spot.map((b) => ({ coin: b.coin, total: b.total })),
    lentUsdc: lent,
    unrealizedPnlUsd: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
    positions,
    recentFills: {
      count: fills.length,
      fromMs: fills.length > 0 ? Math.min(...fills.map((f) => f.time)) : null,
      volumeUsd: fills.reduce((sum, f) => sum + Number(f.px) * Number(f.sz), 0),
      realizedPnlUsd: realizedUsd,
      feesUsd,
      netUsd: realizedUsd - feesUsd,
      closingFills: closes.length,
      winRatePct: closes.length > 0 ? (closes.filter((f) => Number(f.closedPnl) > 0).length / closes.length) * 100 : null,
      liquidations: perpFills.filter((f) => f.liquidation).length,
      makerSharePct: fills.length > 0 ? (fills.filter((f) => !f.crossed).length / fills.length) * 100 : null,
    },
  };
}
