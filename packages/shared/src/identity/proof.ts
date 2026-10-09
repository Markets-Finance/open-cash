import type { Address, Hex } from "viem";

export type LinkChallenge = {
  id: string;
  address: Address;
  handle: string;
  nonce: string;
  expiresAt: number;
};

export type VerifiedLink = {
  address: Address;
  handle: string;
  tweetId: string;
  verifiedAt: number;
};

const handlePattern = /^[a-z0-9_]{1,15}$/;
const statusPattern = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d{5,25})(?:[/?#].*)?$/;
const signaturePattern = /0x[0-9a-fA-F]{130}/;

export function normalizeHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return handlePattern.test(handle) ? handle : null;
}

export function linkMessage(challenge: Omit<LinkChallenge, "id">): string {
  return [
    "Link this address to my X account on OpenCash.",
    `Address: ${challenge.address.toLowerCase()}`,
    `X handle: @${challenge.handle}`,
    `Nonce: ${challenge.nonce}`,
    `Expires: ${new Date(challenge.expiresAt).toISOString()}`,
  ].join("\n");
}

export function tweetText(challenge: LinkChallenge, signature: Hex): string {
  return `Verifying @${challenge.handle} on OpenCash\n${challenge.address}\nproof:${signature}`;
}

export function parseTweetUrl(url: string): { id: string } | null {
  const match = url.trim().match(statusPattern);
  return match ? { id: match[1] } : null;
}

export function extractSignature(text: string): Hex | null {
  const match = text.match(signaturePattern);
  return match ? (match[0] as Hex) : null;
}
