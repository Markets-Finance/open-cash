import { tweetText, type LinkChallenge, type VerifiedLink } from "shared";
import { errorText, query, say } from "./dom";
import { requireTrader } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export async function initIdentity() {
  const trader = requireTrader();
  const status = query("[data-x-status]");
  const step = query("[data-x-step]");
  const text = query<HTMLTextAreaElement>("[data-x-text]");
  const postLink = query<HTMLAnchorElement>("[data-x-post]");
  const urlInput = query<HTMLInputElement>("[data-x-url]");
  const handleInput = query<HTMLInputElement>("[data-x-handle]");
  let challenge: LinkChallenge | null = null;

  const existing = await fetch(`${backend}/identity?address=${trader.address}`).then((r) => (r.ok ? (r.json() as Promise<VerifiedLink>) : null)).catch(() => null);
  if (existing) say(status, `Verified as @${existing.handle}.`);

  query<HTMLFormElement>("[data-x-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const issued = await post<{ challenge: LinkChallenge; message: string }>("/identity/challenge", {
        address: trader.address,
        handle: handleInput.value,
      });
      challenge = issued.challenge;
      const signature = await trader.account.signMessage({ message: issued.message });
      const body = tweetText(challenge, signature);
      text.value = body;
      postLink.href = `https://x.com/intent/post?text=${encodeURIComponent(body)}`;
      step.hidden = false;
      say(status, "Post it, then paste the link below. Expires in 15 minutes.");
    } catch (error) {
      say(status, errorText(error), "error");
    }
  });

  query<HTMLButtonElement>("[data-x-verify]").addEventListener("click", async () => {
    if (!challenge) return;
    try {
      const link = await post<VerifiedLink>("/identity/verify", { challengeId: challenge.id, tweetUrl: urlInput.value });
      step.hidden = true;
      say(status, `Verified as @${link.handle}.`);
    } catch (error) {
      say(status, errorText(error), "error");
    }
  });
}
