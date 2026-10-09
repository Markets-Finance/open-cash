import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const source = "dist";
const target = "dist-landing";
const referenced = /\/_astro\/[\w.\-]+/g;

if (!existsSync(join(source, "index.html"))) throw new Error("Run astro build first: dist/index.html is missing.");

rmSync(target, { recursive: true, force: true });

const queue = ["index.html"];
const copied = new Set();

while (queue.length > 0) {
  const file = queue.pop();
  if (copied.has(file)) continue;
  copied.add(file);
  mkdirSync(dirname(join(target, file)), { recursive: true });
  copyFileSync(join(source, file), join(target, file));
  if (!/\.(html|css|js)$/.test(file)) continue;
  const text = readFileSync(join(source, file), "utf8");
  for (const match of text.matchAll(referenced)) queue.push(match[0].slice(1));
}

console.log(`Packaged ${copied.size} files into ${target}:`);
for (const file of [...copied].sort()) console.log(`  ${file}`);
