import type { ToolOutcome } from "shared";
import { query } from "../dom";
import { renderOutcome } from "./renderers";

const maxCards = 12;

export function pushOutcome(outcome: ToolOutcome) {
  const feed = query("[data-agent-feed]");
  feed.querySelector(".empty")?.remove();
  const card = document.createElement("div");
  card.className = "tool-card";
  card.innerHTML = renderOutcome(outcome);
  feed.prepend(card);
  while (feed.children.length > maxCards) feed.lastElementChild?.remove();
}

export function onAddLeg(handler: (symbol: string, direction: "long" | "short") => void) {
  query("[data-agent-feed]").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-add-leg]");
    if (!button) return;
    handler(button.dataset.addLeg!, button.dataset.dir as "long" | "short");
  });
}
