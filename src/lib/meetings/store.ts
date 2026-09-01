import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { MEETINGS, type MeetingBriefing } from "@/data/meetings";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "meetings.json");
const TMP_STORE_PATH = `${STORE_PATH}.tmp`;

try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // already exists
}

interface MeetingsStore {
  meetings: MeetingBriefing[];
}

function writeStore(store: MeetingsStore): void {
  writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  renameSync(TMP_STORE_PATH, STORE_PATH);
}

function readStore(): MeetingsStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MeetingsStore;
    if (Array.isArray(parsed.meetings)) {
      return parsed;
    }
  } catch {
    // fall through to seed
  }

  const seed: MeetingsStore = { meetings: MEETINGS };
  writeStore(seed);
  return seed;
}

export function getMeetings(): MeetingBriefing[] {
  return readStore().meetings;
}

export function createMeeting(meeting: MeetingBriefing): MeetingBriefing {
  const store = readStore();
  store.meetings.unshift(meeting);
  writeStore(store);
  return meeting;
}

export function upsertMeetingBySource(meeting: MeetingBriefing): { meeting: MeetingBriefing; created: boolean } {
  const store = readStore();
  const sourceSystem = meeting.sourceSystem;
  const externalId = meeting.externalId;
  const existingIndex = sourceSystem && externalId
    ? store.meetings.findIndex((item) => item.sourceSystem === sourceSystem && item.externalId === externalId)
    : store.meetings.findIndex((item) => item.id === meeting.id);

  if (existingIndex >= 0) {
    const existing = store.meetings[existingIndex];
    const updated = { ...existing, ...meeting, id: existing.id, createdAt: existing.createdAt };
    store.meetings[existingIndex] = updated;
    writeStore(store);
    return { meeting: updated, created: false };
  }

  store.meetings.unshift(meeting);
  writeStore(store);
  return { meeting, created: true };
}

export function getMeetingById(id: string): MeetingBriefing | undefined {
  return readStore().meetings.find((meeting) => meeting.id === id);
}
