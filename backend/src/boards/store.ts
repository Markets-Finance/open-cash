import { randomUUID } from "node:crypto";
import { binById } from "shared";
import type { Address } from "viem";
import { JsonFileStore } from "../store/jsonFile.js";
import type { Board } from "./types.js";

const store = new JsonFileStore<Board>("data/boards.json");

// A board is purely an organizing layer over bins that already exist in the
// catalog — it holds no funds and moves no money itself. Every bin id is
// checked against the real catalog so a board can never reference a bin that
// doesn't exist.
function assertKnownBins(binIds: string[]): void {
  for (const id of binIds) {
    if (!binById(id)) throw new Error(`Unknown bin "${id}"`);
  }
}

export async function createBoard(
  owner: Address,
  name: string,
  binIds: string[] = [],
): Promise<Board> {
  assertKnownBins(binIds);
  const now = new Date().toISOString();
  const board: Board = {
    id: randomUUID(),
    owner,
    name,
    binIds: [...new Set(binIds)],
    createdAt: now,
    updatedAt: now,
  };
  await store.set(board.id, board);
  return board;
}

export function getBoard(id: string): Promise<Board | undefined> {
  return store.get(id);
}

export async function listBoardsForOwner(owner: Address): Promise<Board[]> {
  const all = await store.all();
  return all
    .filter((board) => board.owner.toLowerCase() === owner.toLowerCase())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteBoardsForOwner(owner: Address): Promise<number> {
  const boards = await listBoardsForOwner(owner);
  for (const board of boards) await store.delete(board.id);
  return boards.length;
}

export async function renameBoard(id: string, name: string): Promise<Board> {
  const board = await store.get(id);
  if (!board) throw new Error(`Unknown board ${id}`);
  const next = { ...board, name, updatedAt: new Date().toISOString() };
  await store.set(id, next);
  return next;
}

export async function addBinToBoard(id: string, binId: string): Promise<Board> {
  const board = await store.get(id);
  if (!board) throw new Error(`Unknown board ${id}`);
  assertKnownBins([binId]);
  if (board.binIds.includes(binId)) return board;
  const next = {
    ...board,
    binIds: [...board.binIds, binId],
    updatedAt: new Date().toISOString(),
  };
  await store.set(id, next);
  return next;
}

export async function removeBinFromBoard(id: string, binId: string): Promise<Board> {
  const board = await store.get(id);
  if (!board) throw new Error(`Unknown board ${id}`);
  const next = {
    ...board,
    binIds: board.binIds.filter((existing) => existing !== binId),
    updatedAt: new Date().toISOString(),
  };
  await store.set(id, next);
  return next;
}

export function deleteBoard(id: string): Promise<void> {
  return store.delete(id);
}
