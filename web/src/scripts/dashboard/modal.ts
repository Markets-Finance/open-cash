import { query } from "./dom";

const overlay = query("[data-modal]");
const panel = query("[data-modal-panel]");

export function closeModal() {
  overlay.hidden = true;
  panel.innerHTML = "";
}

export function openModal(html: string): HTMLElement {
  panel.innerHTML = html;
  overlay.hidden = false;
  panel.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", closeModal);
  return panel;
}

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !overlay.hidden) closeModal();
});
