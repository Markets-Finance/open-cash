import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { DelaGothicOne_400Regular } from "@expo-google-fonts/dela-gothic-one";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Bin, TradingAccount } from "shared";
import { Account, type Profile } from "./src/screens/Account";
import { BinDetail } from "./src/screens/BinDetail";
import { Bins } from "./src/screens/Bins";
import { Bots } from "./src/screens/Bots";
import { startBots, stopBots } from "./src/lib/bots";
import { Asset } from "./src/screens/Asset";
import { Deposit } from "./src/screens/Deposit";
import { Send } from "./src/screens/Send";
import { Trade } from "./src/screens/Trade";
import type { TabKey } from "./src/components/TabBar";
import { Home } from "./src/screens/Home";
import {
  loadCollateralBalance,
  loadMarkets,
  loadSummary,
  type MarketData,
} from "./src/lib/perpl";
import { dark } from "./src/theme";

type Screen =
  | "account"
  | "bins"
  | "bin"
  | "home"
  | "trade"
  | "asset"
  | "deposit"
  | "send"
  | "bots";

export default function App() {
  const [screen, setScreen] = useState<Screen>("account");
  const [bin, setBin] = useState<Bin | null>(null);
  const [markets, setMarkets] = useState<MarketData | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [trader, setTrader] = useState<TradingAccount | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portfolio, setPortfolio] = useState<number | null>(null);
  const [asset, setAsset] = useState<string | null>(null);
  const [cameFrom, setCameFrom] = useState<Screen>("home");
  const [labSymbol, setLabSymbol] = useState<string | null>(null);
  const [loaded, error] = useFonts({
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DelaGothicOne_400Regular,
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!loaded && !error && !fontTimedOut) {
    return <View style={{ flex: 1, backgroundColor: dark.paper }} />;
  }


  function onAuthenticated(account: TradingAccount | null) {
    setTrader(account);
    if (account === null) stopBots();
    else void startBots(account);
    setBalance(null);
    setPortfolio(null);
    if (account === null) return;

    loadCollateralBalance(account.address)
      .then((ausd) => setBalance(ausd))
      .catch(() => setBalance(null));

    loadMarkets()
      .then((data) => loadSummary(account.address, data))
      .then((summary) => setPortfolio(summary.total))
      .catch(() => setPortfolio(null));
  }

  function openAsset(symbol: string) {
    setCameFrom(screen === "asset" ? cameFrom : screen);
    setAsset(symbol);
    setScreen("asset");
  }

  function strategiesFor(symbol: string) {
    setLabSymbol(symbol);
    setScreen("bots");
  }

  function goTab(key: TabKey) {
    if (key === "home") setScreen("home");
    else if (key === "bins") setScreen("bins");
    else if (key === "trade") setScreen("trade");
    else if (key === "bots") setScreen("bots");
    else setScreen("account");
  }


  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === "account" ? (
        <Account
          initialAccount={trader}
          initialProfile={profile}
          portfolio={portfolio}
          onProfileChange={setProfile}
          onAuthenticated={onAuthenticated}
          onInitialised={() => setScreen("home")}
          onSelectTab={goTab}
        />
      ) : screen === "bins" ? (
        <Bins
          onSelectTab={goTab}
          onOpenAsset={openAsset}
          onComplete={() => setScreen("home")}
          onOpen={(selected, data) => {
            setBin(selected);
            setMarkets(data);
            setScreen("bin");
          }}
        />
      ) : screen === "trade" ? (
        trader !== null ? (
          <Trade trader={trader} onOpenAsset={openAsset} onSelectTab={goTab} />
        ) : null
      ) : screen === "deposit" ? (
        trader !== null ? <Deposit trader={trader} onBack={() => setScreen("home")} onSelectTab={goTab} /> : null
      ) : screen === "send" ? (
        trader !== null ? <Send trader={trader} onBack={() => setScreen("home")} onSelectTab={goTab} /> : null
      ) : screen === "asset" ? (
        trader !== null && asset !== null ? (
          <Asset
            symbol={asset}
            trader={trader}
            onBack={() => setScreen(cameFrom === "asset" ? "home" : cameFrom)}
            onSelectTab={goTab}
            onStrategies={strategiesFor}
          />
        ) : null
      ) : screen === "bots" ? (
        <Bots name={profile?.name} labSymbol={labSymbol} onSelectTab={goTab} onOpenAsset={openAsset} />
      ) : screen === "home" ? (
        trader !== null ? <Home trader={trader} name={profile?.name} onSelectTab={goTab} onOpenAsset={openAsset} onDeposit={() => setScreen("deposit")} onSend={() => setScreen("send")} /> : null
      ) : bin !== null && markets !== null && trader !== null ? (
        <BinDetail
          bin={bin}
          data={markets}
          balance={balance}
          trader={trader}
          onBack={() => setScreen("bins")}
        />
      ) : null}
    </SafeAreaProvider>
  );
}
