import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function claimLock(path: string): Promise<boolean> {
  try {
    const holder = Number(await readFile(path, "utf8"));
    if (holder > 0 && holder !== process.pid) {
      try {
        process.kill(holder, 0);
        return false;
      } catch {
        void 0;
      }
    }
  } catch {
    void 0;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, String(process.pid));
  return true;
}
