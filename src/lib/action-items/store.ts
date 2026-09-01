import { readFileSync, writeFileSync, renameSync } from "fs";
import path from "path";
import type { ActionItem } from "@/types/action-item";

const DATA_PATH = path.resolve(process.cwd(), ".data/action-items.json");

export function readActionItems(): ActionItem[] {
  try {
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.items ?? parsed;
  } catch {
    return [];
  }
}

export function writeActionItems(items: ActionItem[]): void {
  const tmp = DATA_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify({ items }, null, 2), "utf-8");
  renameSync(tmp, DATA_PATH); // atomic on POSIX
}

export function nextActionItemId(items: ActionItem[]): string {
  const maxNum = items.reduce((max, item) => {
    const n = parseInt(item.id.replace("ai-", ""), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  return `ai-${String(maxNum + 1).padStart(3, "0")}`;
}
