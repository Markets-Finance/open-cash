type Listener = () => void;

const listeners = new Set<Listener>();

export function onDepositRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestDeposit(): void {
  listeners.forEach((listener) => listener());
}

let backOverride: (() => boolean) | null = null;

export function setBackOverride(handler: (() => boolean) | null): void {
  backOverride = handler;
}

export function runBackOverride(): boolean {
  return backOverride?.() ?? false;
}
