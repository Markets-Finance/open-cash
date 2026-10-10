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
