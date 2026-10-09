import { encodeFunctionData, hexToBigInt, parseSignature, type Hex } from "viem";
import type { HlNetwork } from "./client.js";

export const minDepositUsdc = 5;

export const bridgeConfig = {
  mainnet: {
    chainId: 42161,
    bridge: "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  testnet: {
    chainId: 421614,
    bridge: "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89",
    usdc: "0x1baAbB04529D43a73232B713C0FE471f7c7334d5",
    usdcName: "USDC2",
    usdcVersion: "1",
  },
} as const satisfies Record<HlNetwork, {
  chainId: number;
  bridge: `0x${string}`;
  usdc: `0x${string}`;
  usdcName: string;
  usdcVersion: string;
}>;

export const bridgeAbi = [
  {
    type: "function",
    name: "batchedDepositWithPermit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "deposits",
        type: "tuple[]",
        components: [
          { name: "user", type: "address" },
          { name: "usd", type: "uint64" },
          { name: "deadline", type: "uint64" },
          {
            name: "signature",
            type: "tuple",
            components: [
              { name: "r", type: "uint256" },
              { name: "s", type: "uint256" },
              { name: "v", type: "uint8" },
            ],
          },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const usdcPermitAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type SignedDeposit = {
  user: `0x${string}`;
  usd: bigint;
  deadline: bigint;
  signature: Hex;
};

export function toUsdcUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}

export function depositPermitTypedData(input: {
  network: HlNetwork;
  owner: `0x${string}`;
  usd: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  const config = bridgeConfig[input.network];
  if (input.usd < toUsdcUnits(minDepositUsdc)) {
    throw new Error(`Deposits under ${minDepositUsdc} USDC are lost by the bridge`);
  }
  return {
    domain: {
      name: config.usdcName,
      version: config.usdcVersion,
      chainId: config.chainId,
      verifyingContract: config.usdc,
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit" as const,
    message: {
      owner: input.owner,
      spender: config.bridge,
      value: input.usd,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}

export function encodeBatchedDeposit(deposits: SignedDeposit[]): Hex {
  return encodeFunctionData({
    abi: bridgeAbi,
    functionName: "batchedDepositWithPermit",
    args: [
      deposits.map((d) => {
        const sig = parseSignature(d.signature);
        return {
          user: d.user,
          usd: d.usd,
          deadline: d.deadline,
          signature: {
            r: hexToBigInt(sig.r),
            s: hexToBigInt(sig.s),
            v: Number(sig.v ?? BigInt(27 + (sig.yParity ?? 0))),
          },
        };
      }),
    ],
  });
}
