import { initAccount } from "./account";
import { initAgent } from "./agent";
import { initAnalytics } from "./analytics";
import { initBins } from "./bins";
import { initBots, startBots } from "./bots";
import { initGate } from "./gate";
import { startGuardBar } from "./guardrails";
import { initHome } from "./home";
import { initRanks } from "./ranks";
import "./modal";
import { initFunds } from "./funds";
import { initSwitchers } from "./switcher";
import { initAccountMenu, initTabs } from "./tabs";
import { initTrade, openAsset, setTradeQuery } from "./trade";

initTabs({ analytics: initAnalytics, agent: initAgent, bins: initBins, trade: initTrade, account: initAccount });
initSwitchers();
initFunds();
let ranksStarted = false;
document.addEventListener("switcher:change", (event) => {
  const { group, key } = (event as CustomEvent<{ group: string; key: string }>).detail;
  if (group === "bins" && key === "ranks" && !ranksStarted) {
    ranksStarted = true;
    void initRanks();
  }
});
initAccountMenu(setTradeQuery);
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-open-asset]");
  if (target?.dataset.openAsset) openAsset(target.dataset.openAsset);
});
initBots();
initGate(() => {
  void initHome();
  startGuardBar();
  void startBots();
});
