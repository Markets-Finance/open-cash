import { depositPermitTypedData, minDepositUsdc, toUsdcUnits, withdrawUsd } from "shared";
import { hlNetwork } from "../hl";
import { mainExchange } from "../hlSession";
import { errorText, esc, query, usd } from "./dom";
import { getDesk } from "./desk";
import { closeModal, openModal } from "./modal";
import { qrSvg } from "./qr";
import { requireTrader } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const permitTtlSeconds = 20 * 60;
const pollMs = 5_000;
const pollTries = 24;
const arbiscan = hlNetwork === "testnet" ? "https://sepolia.arbiscan.io/tx/" : "https://arbiscan.io/tx/";

type PermitParams = { chainId: number; bridge: `0x${string}`; usdc: `0x${string}`; nonce: string; balanceUsdc: number; minDepositUsdc: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

function openDeposit() {
  const trader = requireTrader();
  const panel = openModal(`
    <div class="modal__head"><span class="modal__title">Deposit</span><button type="button" class="modal__close" data-close>×</button></div>
    <p class="quote-line">Step 1: send USDC on Arbitrum${hlNetwork === "testnet" ? " Sepolia" : ""} to your address. Step 2: tap Deposit below and approve with your passkey. We pay the network fee, so you need no ETH.</p>
    <div class="qr-wrap">${qrSvg(trader.address)}</div>
    <p class="account-address">${esc(trader.address)}</p>
    <button type="button" class="btn" data-dep-copy>Copy address</button>
    <div class="stat-grid"><div class="stat"><small>USDC on Arbitrum</small><b data-dep-balance>…</b></div><div class="stat"><small>Minimum</small><b>${minDepositUsdc} USDC</b></div></div>
    <label class="field"><span>Amount (USDC)</span><div class="field-row"><input data-dep-amount type="number" min="${minDepositUsdc}" step="any" placeholder="${minDepositUsdc}" /><button type="button" class="btn" data-dep-max>Max</button></div></label>
    <button type="button" class="btn btn--primary" data-dep-go disabled>Deposit</button>
    <p class="status-line" data-dep-status></p>
    <p class="quote-line">Deposits under ${minDepositUsdc} USDC are lost by the bridge, so the app blocks them. Credit arrives in about a minute.</p>
  `);
  const balanceEl = query("[data-dep-balance]", panel);
  const amountEl = query<HTMLInputElement>("[data-dep-amount]", panel);
  const goEl = query<HTMLButtonElement>("[data-dep-go]", panel);
  const statusEl = query("[data-dep-status]", panel);
  let params: PermitParams | null = null;

  const say = (text: string, tone = "") => {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  };

  function paint() {
    const value = Number(amountEl.value) || 0;
    goEl.disabled = params === null || value < minDepositUsdc || value > params.balanceUsdc;
  }

  async function loadParams() {
    try {
      params = await api<PermitParams>(`/deposit/permit-params?network=${hlNetwork}&owner=${trader.address}`);
      balanceEl.textContent = params.balanceUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch (error) {
      balanceEl.textContent = "—";
      say(errorText(error), "error");
    }
    paint();
  }
  void loadParams();

  amountEl.addEventListener("input", paint);
  query("[data-dep-max]", panel).addEventListener("click", () => {
    amountEl.value = String(Math.floor((params?.balanceUsdc ?? 0) * 100) / 100);
    paint();
  });
  query("[data-dep-copy]", panel).addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(trader.address);
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy address"), 1400);
  });

  goEl.addEventListener("click", async () => {
    if (!params) return;
    goEl.disabled = true;
    try {
      const amount = toUsdcUnits(Number(amountEl.value));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + permitTtlSeconds);
      say("Waiting for your passkey…");
      const typedData = depositPermitTypedData({ network: hlNetwork, owner: trader.address, usd: amount, nonce: BigInt(params.nonce), deadline });
      const signature = await trader.account.signTypedData(typedData);
      say("Sending your deposit…");
      const { hash } = await api<{ hash: string }>("/deposit/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: hlNetwork, user: trader.address, usd: amount.toString(), deadline: deadline.toString(), signature }),
      });
      const before = (await getDesk(true)).equity;
      for (let attempt = 0; attempt < pollTries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const equity = (await getDesk(true)).equity;
        if (equity > before) {
          statusEl.innerHTML = `Deposited. Your account now holds ${usd(equity)}. <a href="${arbiscan}${hash}" target="_blank" rel="noreferrer">View transaction ↗</a>`;
          statusEl.dataset.tone = "";
          amountEl.value = "";
          void loadParams();
          return;
        }
      }
      statusEl.innerHTML = `Sent. It can take a few minutes to show up. <a href="${arbiscan}${hash}" target="_blank" rel="noreferrer">View transaction ↗</a>`;
    } catch (error) {
      say(errorText(error), "error");
    } finally {
      paint();
    }
  });
}

function openWithdraw() {
  const trader = requireTrader();
  const panel = openModal(`
    <div class="modal__head"><span class="modal__title">Withdraw</span><button type="button" class="modal__close" data-close>×</button></div>
    <p class="quote-line">Withdraws USDC from your trading account to your own address on Arbitrum${hlNetwork === "testnet" ? " Sepolia" : ""}. It only ever goes to the address below, which your passkey controls.</p>
    <p class="account-address">${esc(trader.address)}</p>
    <div class="stat-grid"><div class="stat"><small>Account value</small><b data-wd-equity>…</b></div></div>
    <label class="field"><span>Amount (USDC)</span><div class="field-row"><input data-wd-amount type="number" min="0" step="any" placeholder="0" /><button type="button" class="btn" data-wd-max>Max</button></div></label>
    <button type="button" class="btn btn--primary" data-wd-go disabled>Withdraw</button>
    <p class="status-line" data-wd-status></p>
  `);
  const equityEl = query("[data-wd-equity]", panel);
  const amountEl = query<HTMLInputElement>("[data-wd-amount]", panel);
  const goEl = query<HTMLButtonElement>("[data-wd-go]", panel);
  const statusEl = query("[data-wd-status]", panel);
  let available = 0;

  function paint() {
    const value = Number(amountEl.value) || 0;
    goEl.disabled = value <= 0 || value > available;
  }

  void getDesk(true)
    .then((desk) => {
      available = Math.max(0, desk.equity - desk.positions.reduce((sum, p) => sum + p.marginUsed, 0));
      equityEl.textContent = usd(desk.equity);
      paint();
    })
    .catch(() => {
      equityEl.textContent = "—";
    });

  amountEl.addEventListener("input", paint);
  query("[data-wd-max]", panel).addEventListener("click", () => {
    amountEl.value = String(Math.floor(available * 100) / 100);
    paint();
  });
  goEl.addEventListener("click", async () => {
    goEl.disabled = true;
    statusEl.dataset.tone = "";
    statusEl.textContent = "Waiting for your passkey…";
    try {
      await withdrawUsd(mainExchange(trader), Number(amountEl.value), trader.address, [trader.address]);
      statusEl.textContent = "Withdrawal requested. It usually lands within a few minutes.";
      amountEl.value = "";
    } catch (error) {
      statusEl.dataset.tone = "error";
      statusEl.textContent = errorText(error);
    } finally {
      paint();
    }
  });
}

export function initFunds() {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-open-deposit]")) openDeposit();
    if (target.closest("[data-open-send]")) openWithdraw();
  });
}

export { closeModal };
