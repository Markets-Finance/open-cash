import type { FastifyInstance } from "fastify";
import { createPublicClient, createWalletClient, http, isAddress, isHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import {
  bridgeConfig,
  depositPermitTypedData,
  encodeBatchedDeposit,
  minDepositUsdc,
  toUsdcUnits,
  usdcPermitAbi,
  type HlNetwork,
} from "shared";

const chains = { mainnet: arbitrum, testnet: arbitrumSepolia };
const rpcs = {
  mainnet: process.env.ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
  testnet: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
};
const relayCooldownMs = 60_000;
const lastRelay = new Map<string, number>();

function allowedNetwork(network: string): network is HlNetwork {
  if (network === "testnet") return true;
  return network === "mainnet" && process.env.RELAYER_ALLOW_MAINNET === "true";
}

function clients(network: HlNetwork) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  const publicClient = createPublicClient({ chain: chains[network], transport: http(rpcs[network]) });
  if (!key) return { publicClient, walletClient: null };
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: chains[network], transport: http(rpcs[network]) });
  return { publicClient, walletClient };
}

export function registerDepositRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { network: string; owner: string } }>("/deposit/permit-params", async (request, reply) => {
    const { network, owner } = request.query;
    if (!allowedNetwork(network)) return reply.status(400).send({ error: "network not enabled" });
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner address" });
    const config = bridgeConfig[network];
    const { publicClient } = clients(network);
    const [nonce, balance] = await Promise.all([
      publicClient.readContract({ address: config.usdc, abi: usdcPermitAbi, functionName: "nonces", args: [owner] }),
      publicClient.readContract({ address: config.usdc, abi: usdcPermitAbi, functionName: "balanceOf", args: [owner] }),
    ]);
    return {
      chainId: config.chainId,
      bridge: config.bridge,
      usdc: config.usdc,
      nonce: nonce.toString(),
      balanceUsdc: Number(balance) / 1e6,
      minDepositUsdc,
    };
  });

  app.post<{
    Body: { network: string; user: string; usd: string; deadline: string; signature: string };
  }>("/deposit/relay", async (request, reply) => {
    const { network, user, usd, deadline, signature } = request.body;
    if (!allowedNetwork(network)) return reply.status(400).send({ error: "network not enabled" });
    if (!isAddress(user)) return reply.status(400).send({ error: "invalid user address" });
    if (!isHex(signature)) return reply.status(400).send({ error: "invalid signature" });
    const amount = BigInt(usd);
    const expiry = BigInt(deadline);
    if (amount < toUsdcUnits(minDepositUsdc)) {
      return reply.status(400).send({ error: `minimum deposit is ${minDepositUsdc} USDC` });
    }
    if (expiry <= BigInt(Math.floor(Date.now() / 1000))) return reply.status(400).send({ error: "permit expired" });
    const now = Date.now();
    if (now - (lastRelay.get(user.toLowerCase()) ?? 0) < relayCooldownMs) {
      return reply.status(429).send({ error: "one deposit per minute" });
    }
    const { publicClient, walletClient } = clients(network);
    const config = bridgeConfig[network];
    const [nonce, balance] = await Promise.all([
      publicClient.readContract({ address: config.usdc, abi: usdcPermitAbi, functionName: "nonces", args: [user] }),
      publicClient.readContract({ address: config.usdc, abi: usdcPermitAbi, functionName: "balanceOf", args: [user] }),
    ]);
    if (balance < amount) return reply.status(400).send({ error: "USDC balance is below the deposit amount" });
    const typedData = depositPermitTypedData({ network, owner: user, usd: amount, nonce, deadline: expiry });
    const valid = await verifyTypedData({ ...typedData, address: user, signature });
    if (!valid) return reply.status(400).send({ error: "permit signature does not match the user and current nonce" });
    if (!walletClient) return reply.status(503).send({ error: "relayer not configured" });
    const data = encodeBatchedDeposit([{ user, usd: amount, deadline: expiry, signature }]);
    lastRelay.set(user.toLowerCase(), now);
    const hash = await walletClient.sendTransaction({ to: config.bridge, data });
    return { hash };
  });
}
