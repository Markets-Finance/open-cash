import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BinRecord } from "shared";
import { hlNetwork } from "./hl";

const keyFor = (owner: string) => `opencash.bins.${hlNetwork}.${owner.toLowerCase()}`;

export async function loadBinRecords(owner: string): Promise<BinRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(owner));
    return raw === null ? [] : (JSON.parse(raw) as BinRecord[]);
  } catch {
    return [];
  }
}

async function save(owner: string, records: BinRecord[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(owner), JSON.stringify(records));
}

export async function addBinRecord(owner: string, record: BinRecord): Promise<void> {
  await save(owner, [...(await loadBinRecords(owner)), record]);
}

export async function removeBinRecords(owner: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await save(owner, (await loadBinRecords(owner)).filter((r) => !ids.includes(r.id)));
}
