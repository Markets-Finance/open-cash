export function initSwitchers() {
  document.querySelectorAll<HTMLElement>("[data-switcher]").forEach((root) => {
    const group = root.dataset.switcher!;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-switch]"));
    const panes = () => Array.from(document.querySelectorAll<HTMLElement>(`[data-pane^="${group}:"]`));

    function select(key: string) {
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.switch === key)));
      panes().forEach((pane) => {
        pane.hidden = pane.dataset.pane !== `${group}:${key}`;
      });
      document.dispatchEvent(new CustomEvent("switcher:change", { detail: { group, key } }));
    }

    buttons.forEach((button) => button.addEventListener("click", () => select(button.dataset.switch!)));
    select(buttons.find((button) => button.getAttribute("aria-pressed") === "true")?.dataset.switch ?? buttons[0]!.dataset.switch!);
  });
}
