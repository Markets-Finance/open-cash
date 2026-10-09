import { verifyMessage } from "viem";
import { extractSignature, linkMessage, parseTweetUrl, type LinkChallenge } from "shared";

export type Verdict = { ok: true; handle: string; tweetId: string } | { ok: false; reason: string };

type OEmbed = { author_url?: string; html?: string };

const oembed = "https://publish.x.com/oembed";

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function verifyTweetProof(
  challenge: LinkChallenge,
  tweetUrl: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<Verdict> {
  if (now > challenge.expiresAt) return { ok: false, reason: "Challenge expired" };
  const parsed = parseTweetUrl(tweetUrl);
  if (!parsed) return { ok: false, reason: "That is not a tweet link" };

  const canonical = `https://x.com/i/status/${parsed.id}`;
  const response = await fetcher(`${oembed}?url=${encodeURIComponent(canonical)}&omit_script=true`);
  if (response.status === 404) return { ok: false, reason: "Tweet not found or not public" };
  if (!response.ok) return { ok: false, reason: `X returned ${response.status}` };

  const body = (await response.json()) as OEmbed;
  const author = body.author_url?.split("/").filter(Boolean).pop()?.toLowerCase();
  if (author !== challenge.handle) return { ok: false, reason: `Tweet is by @${author ?? "unknown"}, not @${challenge.handle}` };

  const signature = extractSignature(plainText(body.html ?? ""));
  if (!signature) return { ok: false, reason: "No proof found in the tweet" };

  const valid = await verifyMessage({ address: challenge.address, message: linkMessage(challenge), signature });
  if (!valid) return { ok: false, reason: "Signature does not match this address" };

  return { ok: true, handle: challenge.handle, tweetId: parsed.id };
}
