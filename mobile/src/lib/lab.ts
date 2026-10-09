import AsyncStorage from "@react-native-async-storage/async-storage";
import { perpl, templates } from "shared";
import { currentOwner, toolbox } from "./bots";

export const loadSeries = templates.createSeriesLoader(perpl.createPerplApi(perpl.perplTestnet.apiUrl), () => toolbox.getMarkets());

type Listener = (bots: templates.PaperBot[]) => void;

let papers: templates.PaperBot[] = [];
const listeners = new Set<Listener>();

function key(): string | null {
  const owner = currentOwner();
  return owner ? `opencash.paper.${owner.toLowerCase()}` : null;
}

function publish(next: templates.PaperBot[]) {
  papers = next;
  listeners.forEach((listener) => listener(next));
  const storageKey = key();
  if (storageKey) void AsyncStorage.setItem(storageKey, JSON.stringify(next));
}

export async function loadPapers(): Promise<void> {
  const storageKey = key();
  if (!storageKey) return;
  try {
    papers = JSON.parse((await AsyncStorage.getItem(storageKey)) ?? "[]") as templates.PaperBot[];
  } catch {
    papers = [];
  }
  listeners.forEach((listener) => listener(papers));
}

export function subscribePapers(listener: Listener): () => void {
  listeners.add(listener);
  listener(papers);
  return () => {
    listeners.delete(listener);
  };
}

export function addPaper(bot: templates.PaperBot) {
  publish([bot, ...papers]);
}

export function removePaper(id: string) {
  publish(papers.filter((bot) => bot.id !== id));
}
