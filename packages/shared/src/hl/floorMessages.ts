import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { utf8 } from "@scure/base";
import type { FloorRecord } from "./floor.js";

export type FloorAction = "add" | "remove" | "replace";

export function floorId(record: Pick<FloorRecord, "coin" | "openedAt">): string {
  return `${record.coin}@${record.openedAt}`;
}

export function floorDigest(record: FloorRecord): string {
  return bytesToHex(
    sha256(
      utf8.decode(
        JSON.stringify([
          record.coin,
          record.dex,
          record.assetId,
          record.isLong,
          record.floorUsd,
          record.sleeveUsd,
          record.leverage,
          record.size,
          record.entryPx,
          record.openedAt,
        ]),
      ),
    ),
  );
}

export function floorMessage(owner: string, network: string, action: FloorAction, subject: string, issuedAt: number): string {
  return `${action[0].toUpperCase()}${action.slice(1)} floor on OpenCash.\nOwner: ${owner.toLowerCase()}\nNetwork: ${network}\nFloor: ${subject}\nIssued: ${new Date(issuedAt).toISOString()}`;
}
