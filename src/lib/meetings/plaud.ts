import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import type { MeetingBriefing, MeetingParticipant } from "@/data/meetings";
import { safeAppendAuditEntry } from "@/lib/audit/store";
import { getMeetings, upsertMeetingBySource } from "@/lib/meetings/store";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STATE_PATH = path.join(DATA_DIR, "plaud-sync-state.json");
const TMP_STATE_PATH = `${STATE_PATH}.tmp`;

try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // already exists
}

type PlaudSyncStatus = "not_configured" | "ready" | "syncing" | "error";

export interface PlaudSyncState {
  status: PlaudSyncStatus;
  configured: boolean;
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  lastError?: string;
  importedCount: number;
  skippedDuplicates: number;
  failedCount: number;
  processingCount: number;
  pendingTranscriptIds: string[];
  updatedAt: string;
}

interface PlaudRecording {
  id: string;
  title: string;
  startedAt?: string;
  createdAt?: string;
  durationSeconds?: number;
  owner?: string;
  transcriptUrl?: string;
  raw: Record<string, unknown>;
}

interface PlaudTranscript {
  text: string;
  raw: unknown;
}

interface PlaudNote {
  text?: string;
  raw?: unknown;
}

interface PlaudSyncResult {
  configured: boolean;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  pendingTranscripts: number;
  failed: number;
  errors: string[];
  syncedAt: string;
}

const CLIENT_TEAM = [
  "Alex",
  "Alex Burch",
  "Morgan",
  "Morgan D'Agostino",
  "Mission Agent",
  "Example Client Mission Agent",
  "Brian",
  "Glenda",
];

function nowIso(): string {
  return new Date().toISOString();
}

function defaultState(): PlaudSyncState {
  return {
    status: hasPlaudConfig() ? "ready" : "not_configured",
    configured: hasPlaudConfig(),
    importedCount: 0,
    skippedDuplicates: 0,
    failedCount: 0,
    processingCount: 0,
    pendingTranscriptIds: [],
    updatedAt: nowIso(),
  };
}

function readState(): PlaudSyncState {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as PlaudSyncState;
    return { ...defaultState(), ...parsed, configured: hasPlaudConfig(), status: hasPlaudConfig() ? parsed.status : "not_configured" };
  } catch {
    return defaultState();
  }
}

function writeState(state: PlaudSyncState): PlaudSyncState {
  const next = { ...state, configured: hasPlaudConfig(), updatedAt: nowIso() };
  writeFileSync(TMP_STATE_PATH, JSON.stringify(next, null, 2), "utf-8");
  renameSync(TMP_STATE_PATH, STATE_PATH);
  return next;
}

export function getPlaudSyncStatus(): PlaudSyncState {
  return readState();
}

function hasPlaudConfig(): boolean {
  return Boolean(
    process.env.PLAUD_ACCESS_TOKEN?.trim() ||
    process.env.PLAUD_MCP_ACCESS_TOKEN?.trim() ||
    process.env.PLAUD_RECORDINGS_ENDPOINT?.trim() ||
    process.env.PLAUD_RECORDINGS_JSON?.trim(),
  );
}

function sourceOwner(): string {
  return process.env.PLAUD_SOURCE_OWNER?.trim() || "Mission Agent";
}

function generateMeetingId(externalId: string): string {
  return `plaud-${externalId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}`;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pickIso(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(value > 10_000_000_000 ? value : value * 1000);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return undefined;
}

function recordingUrl(id: string, raw: Record<string, unknown>): string | undefined {
  const direct = asString(raw.transcript_url) || asString(raw.transcriptUrl) || asString(raw.share_url) || asString(raw.shareUrl) || asString(raw.url);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const template = process.env.PLAUD_RECORDING_URL_TEMPLATE?.trim();
  if (template && template.includes("{id}")) return template.replace("{id}", encodeURIComponent(id));
  return undefined;
}

function normalizeRecording(rawInput: unknown): PlaudRecording | null {
  const raw = asRecord(rawInput);
  const id = asString(raw.id) || asString(raw.file_id) || asString(raw.fileId) || asString(raw.recording_id) || asString(raw.recordingId);
  if (!id) return null;
  const title = asString(raw.title) || asString(raw.name) || asString(raw.file_name) || asString(raw.fileName) || "Untitled Plaud recording";
  const durationSeconds = asNumber(raw.duration_seconds) ?? asNumber(raw.durationSeconds) ?? asNumber(raw.duration);
  return {
    id,
    title,
    startedAt: pickIso(raw, ["started_at", "startedAt", "recorded_at", "recordedAt", "start_time", "startTime"]),
    createdAt: pickIso(raw, ["created_at", "createdAt", "created", "upload_time", "uploadTime"]),
    durationSeconds,
    owner: asString(raw.owner) || asString(raw.user) || sourceOwner(),
    transcriptUrl: recordingUrl(id, raw),
    raw,
  };
}

function extractArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const raw = asRecord(payload);
  for (const key of ["files", "recordings", "items", "data", "results"]) {
    if (Array.isArray(raw[key])) return raw[key] as unknown[];
  }
  return [];
}

function mcpUrl(): string {
  return process.env.PLAUD_MCP_URL?.trim() || "https://mcp.plaud.ai/mcp";
}

function plaudToken(): string {
  return process.env.PLAUD_MCP_ACCESS_TOKEN?.trim() || process.env.PLAUD_ACCESS_TOKEN?.trim() || "";
}

function canFetchPlaudRecordingDetail(): boolean {
  return Boolean(process.env.PLAUD_RECORDING_ENDPOINT_TEMPLATE?.trim() || plaudToken());
}

async function mcpToolCall<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const token = plaudToken();
  if (!token) throw new Error("Missing Plaud access token");
  const response = await fetch(mcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${toolName}-${Date.now()}`,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Plaud MCP ${toolName} failed: ${response.status}`);
  const parsed = JSON.parse(body) as { result?: unknown; error?: { message?: string } };
  if (parsed.error) throw new Error(parsed.error.message || `Plaud MCP ${toolName} returned an error`);
  return unwrapMcpResult(parsed.result) as T;
}

function unwrapMcpResult(result: unknown): unknown {
  const raw = asRecord(result);
  const content = raw.content;
  if (Array.isArray(content)) {
    const texts = content
      .map((item) => asRecord(item).text)
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0]);
      } catch {
        return texts[0];
      }
    }
    if (texts.length > 1) return texts.join("\n");
  }
  return result;
}

async function fetchJsonEndpoint(url: string, init?: RequestInit): Promise<unknown> {
  const token = plaudToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Plaud endpoint failed: ${response.status}`);
  return response.json();
}

async function listPlaudRecordings(fromIso: string): Promise<PlaudRecording[]> {
  if (process.env.PLAUD_RECORDINGS_JSON?.trim()) {
    const payload = JSON.parse(process.env.PLAUD_RECORDINGS_JSON);
    return extractArrayPayload(payload).map(normalizeRecording).filter((item): item is PlaudRecording => Boolean(item));
  }

  const endpoint = process.env.PLAUD_RECORDINGS_ENDPOINT?.trim();
  if (endpoint) {
    const url = new URL(endpoint);
    url.searchParams.set("from", fromIso);
    const payload = await fetchJsonEndpoint(url.toString());
    return extractArrayPayload(payload).map(normalizeRecording).filter((item): item is PlaudRecording => Boolean(item));
  }

  const payload = await mcpToolCall<unknown>("list_files", { from: fromIso, page_size: 100 });
  return extractArrayPayload(payload).map(normalizeRecording).filter((item): item is PlaudRecording => Boolean(item));
}

async function getPlaudRecording(id: string): Promise<Record<string, unknown>> {
  const endpoint = process.env.PLAUD_RECORDING_ENDPOINT_TEMPLATE?.trim();
  if (endpoint) {
    return asRecord(await fetchJsonEndpoint(endpoint.replace("{id}", encodeURIComponent(id))));
  }
  return asRecord(await mcpToolCall<unknown>("get_file", { id }));
}

function transcriptTextFromPayload(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  const raw = asRecord(payload);
  const direct = asString(raw.text) || asString(raw.transcript) || asString(raw.content);
  if (direct) return direct;
  const segments = raw.segments ?? raw.entries ?? raw.transcript_entries ?? raw.transcriptEntries;
  if (Array.isArray(segments)) {
    return segments
      .map((segment) => {
        const item = asRecord(segment);
        const speaker = asString(item.speaker) || asString(item.speaker_name) || asString(item.name);
        const text = asString(item.text) || asString(item.content);
        return speaker && text ? `${speaker}: ${text}` : text;
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

async function getPlaudTranscript(id: string, recordingRaw?: Record<string, unknown>): Promise<PlaudTranscript | null> {
  const embedded = recordingRaw ? transcriptTextFromPayload(recordingRaw.transcript ?? recordingRaw.transcript_text ?? recordingRaw.transcriptText) : "";
  if (embedded) return { text: embedded, raw: recordingRaw?.transcript ?? recordingRaw?.transcript_text ?? recordingRaw?.transcriptText };

  const endpoint = process.env.PLAUD_TRANSCRIPT_ENDPOINT_TEMPLATE?.trim();
  const payload = endpoint
    ? await fetchJsonEndpoint(endpoint.replace("{id}", encodeURIComponent(id)))
    : await mcpToolCall<unknown>("get_transcript", { id });
  const text = transcriptTextFromPayload(payload);
  if (!text) return null;
  return { text, raw: payload };
}

async function getPlaudNote(id: string): Promise<PlaudNote> {
  try {
    const endpoint = process.env.PLAUD_NOTE_ENDPOINT_TEMPLATE?.trim();
    const payload = endpoint
      ? await fetchJsonEndpoint(endpoint.replace("{id}", encodeURIComponent(id)))
      : await mcpToolCall<unknown>("get_note", { id });
    return { text: transcriptTextFromPayload(payload), raw: payload };
  } catch {
    return {};
  }
}

function formatDateTime(startedAt?: string, createdAt?: string): { date: string; time: string } {
  const date = new Date(startedAt || createdAt || Date.now());
  if (Number.isNaN(date.getTime())) {
    return { date: new Date().toISOString().slice(0, 10), time: "Not clearly stated" };
  }
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function durationMinutes(durationSeconds?: number): number {
  if (!durationSeconds || durationSeconds < 0) return 0;
  return Math.round(durationSeconds / 60);
}

function canonicalPrompt(recording: PlaudRecording, transcript: string): string {
  const started = recording.startedAt || recording.createdAt || "Not clearly stated";
  const duration = recording.durationSeconds ? `${durationMinutes(recording.durationSeconds)} minutes` : "Not clearly stated";
  return `Summarize this meeting transcript using the Example Client meeting-notes structure below.

Follow these rules:
- Use only information clearly stated in the transcript.
- Do not invent decisions, owners, deadlines, numbers, or context.
- If something is unclear, write "Not clearly stated."
- Keep the output executive-ready: concise, specific, and action-oriented.
- Bold Example Client team members when listing participants or assigning action items.
- Do not bold external participants.
- Deadlines must be specific dates if stated. If no date is stated, write "date not stated."
- Separate confirmed decisions from ideas, suggestions, or open questions.
- Include Observer Mode when Alex or Morgan are on the call, or when the call includes strategic positioning, negotiation, sales, partnerships, or leadership decisions.
- Standardize spelling as "Example Client."

Known source metadata:
- Recording title: ${recording.title}
- Recording date/time: ${started}
- Duration: ${duration}
- Source owner: ${recording.owner || sourceOwner()}

Use this exact structure:

## [Meeting Title]
**[Date] · [Time if known] · [Duration if known]**

**On the call:**
- **[Example Client person]** — [Role], Example Client
- [External person] — [Role], [Company]

**Executive Summary:**
Write 1-2 short paragraphs summarizing the purpose of the call, the most important discussion points, the business context, and what changed because of the meeting.

**Strategic Note:**
Include this section only if there is a genuinely useful strategic takeaway. Keep it to one short paragraph. If there is no strategic takeaway, omit this section entirely.

**What's Handled:**
- List confirmed items, completed items, agreements, clarifications, or resolved questions from the call.
- Focus only on things that are actually settled.

**Next Steps:**
- **[Example Client owner]** → [specific task] — [specific date or "date not stated"]
- [External owner] → [specific task] — [specific date or "date not stated"]

Only include real action items. Do not create tasks from vague discussion.

**Open Questions / Decisions Needed:**
- [Question or decision that remains unresolved]
- [Who needs to decide, if clear]

**Observer Mode:**
Include this section when Alex or Morgan participate, or when the meeting includes negotiation, positioning, sales, partnerships, leadership, pricing, operations, or strategy.

**Notable Phrasing/Tone from Alex and Morgan:**
- Capture direct quotes or close paraphrases that show how Alex or Morgan framed the topic, managed the relationship, pushed for clarity, positioned Example Client, or made tradeoffs.
- If absent, write: "None clearly stated in transcript."

**Negotiation Tactics / Positioning:**
- Capture specific tactics, framing moves, leverage points, concessions, urgency, pricing posture, risk framing, or relationship-management choices.
- If absent, write: "None clearly stated in transcript."

**Strategic Decisions Made:**
- List only confirmed decisions from the call.
- Do not include ideas or options that were merely discussed.
- If absent, write: "None clearly stated in transcript."

**Clean Action Items for Internal Follow-Up:**
Group Example Client-internal tasks by owner.

**[Owner Name]:**
- [ ] [Task] — [deadline]

End with this exact final line:
"Summary prepared from transcript. Items marked 'date not stated' need manual deadline confirmation."

Transcript:
${transcript}`;
}

async function generateFormattedNotes(recording: PlaudRecording, transcript: string): Promise<string> {
  const prompt = canonicalPrompt(recording, transcript);
  const endpointResult = await runOpenClawEndpoint(prompt);
  if (endpointResult) return endpointResult;
  const cliResult = await runOpenClawCli(prompt);
  if (cliResult) return cliResult;
  return fallbackFormattedNotes(recording);
}

async function runOpenClawEndpoint(prompt: string): Promise<string | null> {
  const endpoint = process.env.OPENCLAW_AGENT_ENDPOINT?.trim();
  if (!endpoint) return null;
  const token = process.env.OPENCLAW_AGENT_TOKEN?.trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      agent: process.env.OPENCLAW_MEETING_NOTES_AGENT?.trim() || "main",
      sessionKey: process.env.OPENCLAW_MEETING_NOTES_SESSION_KEY?.trim() || "agent:main:mission-control-plaud-meeting-notes",
      message: prompt,
      json: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenClaw meeting-notes endpoint failed: ${response.status} ${body.slice(0, 240)}`);
  }
  return extractOpenClawText(await response.json());
}

async function runOpenClawCli(prompt: string): Promise<string | null> {
  if (process.env.OPENCLAW_AGENT_DISABLE_CLI === "true") return null;
  try {
    const { execFileSync } = await import("child_process");
    const output = execFileSync(
      /*turbopackIgnore: true*/
      process.env.OPENCLAW_BIN?.trim() || "openclaw",
      [
        "agent",
        "--agent",
        process.env.OPENCLAW_MEETING_NOTES_AGENT?.trim() || "main",
        "--session-key",
        process.env.OPENCLAW_MEETING_NOTES_SESSION_KEY?.trim() || "agent:main:mission-control-plaud-meeting-notes",
        "--message",
        prompt,
        "--json",
        "--timeout",
        process.env.OPENCLAW_MEETING_NOTES_TIMEOUT_SECONDS?.trim() || "600",
      ],
      {
        encoding: "utf-8",
        timeout: Number(process.env.OPENCLAW_MEETING_NOTES_TIMEOUT_MS ?? 600_000),
        maxBuffer: 12 * 1024 * 1024,
      },
    );
    return extractOpenClawText(JSON.parse(output));
  } catch (error) {
    if (process.env.OPENCLAW_MEETING_NOTES_STRICT === "true") {
      throw error;
    }
    return null;
  }
}

function extractOpenClawText(payload: unknown): string | null {
  if (typeof payload === "string") return payload.trim() || null;
  const raw = asRecord(payload);
  const direct = asString(raw.text) || asString(raw.output) || asString(raw.response) || asString(raw.markdown);
  if (direct) return direct;
  const result = asRecord(raw.result);
  const resultDirect = asString(result.text) || asString(result.output) || asString(result.response) || asString(result.markdown);
  if (resultDirect) return resultDirect;
  if (Array.isArray(result.payloads)) {
    const text = result.payloads
      .map((item) => asString(asRecord(item).text))
      .filter(Boolean)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

function fallbackFormattedNotes(recording: PlaudRecording): string {
  const { date, time } = formatDateTime(recording.startedAt, recording.createdAt);
  const duration = recording.durationSeconds ? `${durationMinutes(recording.durationSeconds)} minutes` : "Not clearly stated";
  const owner = recording.owner || sourceOwner();
  const ownerIsClientTeam = CLIENT_TEAM.some((name) => name.toLowerCase() === owner.toLowerCase());
  const ownerLine = ownerIsClientTeam
    ? `- **${owner}** — Not clearly stated, Example Client`
    : `- ${owner} — Not clearly stated, Not clearly stated`;
  return `## ${recording.title}
**${date} · ${time} · ${duration}**

**On the call:**
${ownerLine}

**Executive Summary:**
Not clearly stated.

**What's Handled:**
- Not clearly stated.

**Next Steps:**
- Not clearly stated.

**Open Questions / Decisions Needed:**
- Not clearly stated.

Summary prepared from transcript. Items marked 'date not stated' need manual deadline confirmation.`;
}

function section(markdown: string, heading: string): string {
  const pattern = new RegExp(`\\*\\*${escapeRegExp(heading)}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*[^\\n]+:\\*\\*|\\n##\\s|$)`, "i");
  return markdown.match(pattern)?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, "").replace(/^\[[ xX]\]\s+/, ""))
    .filter((line) => line && !/^Only include real action items/i.test(line));
}

function parseTitle(markdown: string, fallback: string): string {
  return markdown.match(/^##\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function parseParticipants(markdown: string, owner: string): MeetingParticipant[] {
  const participantLines = bullets(section(markdown, "On the call"));
  const parsed = participantLines.map((line) => {
    const clean = line.replace(/\*\*/g, "");
    const [namePart, rest = ""] = clean.split(/\s+—\s+/);
    const [role = "Not clearly stated", company = "Not clearly stated"] = rest.split(",").map((item) => item.trim());
    const name = namePart.trim() || "Not clearly stated";
    const isCLIENT = company.toLowerCase().includes("example client operations") || CLIENT_TEAM.some((teamName) => teamName.toLowerCase() === name.toLowerCase());
    return { name, role, company, isCLIENT, department: isCLIENT ? "Leadership" : undefined };
  }).filter((item) => item.name !== "Not clearly stated");

  if (parsed.length > 0) return parsed;
  return [{ name: owner, role: "Not clearly stated", company: "Example Client", isCLIENT: true, department: "Leadership" }];
}

function inferDepartments(markdown: string, participants: MeetingParticipant[]): string[] {
  const values = new Set<string>();
  participants.forEach((participant) => {
    if (participant.department) values.add(participant.department);
  });
  const text = markdown.toLowerCase();
  if (/\b(sales|pricing|proposal|partnership|negotiation|customer|client|lead)\b/.test(text)) values.add("Partnerships");
  if (/\b(operations|process|workflow|delivery|install)\b/.test(text)) values.add("Operations");
  if (/\b(strategy|leadership|positioning|board)\b/.test(text)) values.add("Leadership");
  return Array.from(values.size ? values : new Set(["Operations"]));
}

function parseMarkdownToMeeting(recording: PlaudRecording, markdown: string, transcript: PlaudTranscript, note: PlaudNote): MeetingBriefing {
  const { date, time } = formatDateTime(recording.startedAt, recording.createdAt);
  const participants = parseParticipants(markdown, recording.owner || sourceOwner());
  const strategicNote = section(markdown, "Strategic Note");
  return {
    id: generateMeetingId(recording.id),
    title: parseTitle(markdown, recording.title),
    date,
    time,
    durationMin: durationMinutes(recording.durationSeconds),
    participants,
    departments: inferDepartments(markdown, participants),
    executiveSummary: section(markdown, "Executive Summary") || "Not clearly stated.",
    strategicNote: strategicNote || undefined,
    whatsHandled: bullets(section(markdown, "What's Handled")),
    nextSteps: bullets(section(markdown, "Next Steps")),
    transcriptUrl: recording.transcriptUrl,
    formattedNotesMarkdown: markdown,
    sourceSystem: "plaud",
    externalId: recording.id,
    sourceOwner: recording.owner || sourceOwner(),
    sourceStartedAt: recording.startedAt,
    sourceCreatedAt: recording.createdAt,
    syncStatus: "imported",
    transcriptSourceUrl: recording.transcriptUrl,
    sourceMetadata: {
      plaudRecording: recording.raw,
      plaudTranscript: transcript.raw,
      plaudNote: note.raw,
      importedFrom: "plaud-sync",
    },
    createdAt: nowIso(),
  };
}

function syncFromIso(state: PlaudSyncState, force: boolean): string {
  if (force || !state.lastSuccessfulSyncAt) {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString();
  }
  const date = new Date(state.lastSuccessfulSyncAt);
  date.setDate(date.getDate() - 1);
  return date.toISOString();
}

export async function syncPlaudMeetings(options: { actor?: string; force?: boolean } = {}): Promise<PlaudSyncResult> {
  const actor = options.actor || "system";
  const startedAt = nowIso();
  const state = writeState({ ...readState(), status: hasPlaudConfig() ? "syncing" : "not_configured", lastSyncAt: startedAt, lastError: undefined });

  if (!hasPlaudConfig()) {
    safeAppendAuditEntry({
      actor,
      entityType: "meeting-sync",
      entityId: "plaud",
      action: "update",
      changes: [],
      context: { route: "/api/meetings/plaud/sync", summary: "Plaud sync skipped: not configured" },
    });
    return { configured: false, imported: 0, updated: 0, skippedDuplicates: 0, pendingTranscripts: 0, failed: 0, errors: ["Plaud sync is not configured"], syncedAt: startedAt };
  }

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let pendingTranscripts = 0;
  let failed = 0;
  const errors: string[] = [];
  const pendingIds = new Set(state.pendingTranscriptIds);

  try {
    const from = syncFromIso(state, Boolean(options.force));
    const recordings = await listPlaudRecordings(from);
    const existing = new Set(getMeetings().filter((meeting) => meeting.sourceSystem === "plaud" && meeting.externalId).map((meeting) => meeting.externalId as string));

    for (const listedRecording of recordings) {
      try {
        const detail = canFetchPlaudRecordingDetail() ? await getPlaudRecording(listedRecording.id) : {};
        const fullRecording = { ...listedRecording, raw: { ...listedRecording.raw, ...detail } };
        const normalized = normalizeRecording(fullRecording.raw) ?? listedRecording;
        const recording = { ...listedRecording, ...normalized };
        const transcript = await getPlaudTranscript(recording.id, recording.raw);
        if (!transcript) {
          pendingTranscripts += 1;
          pendingIds.add(recording.id);
          continue;
        }
        const note = await getPlaudNote(recording.id);
        const markdown = await generateFormattedNotes(recording, transcript.text);
        const meeting = parseMarkdownToMeeting(recording, markdown, transcript, note);
        const result = upsertMeetingBySource(meeting);
        if (result.created) {
          imported += 1;
          pendingIds.delete(recording.id);
        } else if (existing.has(recording.id)) {
          skippedDuplicates += 1;
          updated += 1;
          pendingIds.delete(recording.id);
        } else {
          updated += 1;
          pendingIds.delete(recording.id);
        }
        safeAppendAuditEntry({
          actor,
          entityType: "meeting",
          entityId: result.meeting.id,
          action: result.created ? "create" : "update",
          changes: [{ field: "sourceSystem", before: undefined, after: "plaud" }],
          context: { route: "/api/meetings/plaud/sync", summary: result.created ? "Imported Plaud meeting" : "Updated Plaud meeting" },
        });
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : "Unknown Plaud import failure");
      }
    }

    const completedAt = nowIso();
    writeState({
      status: errors.length ? "error" : "ready",
      configured: true,
      lastSyncAt: startedAt,
      lastSuccessfulSyncAt: completedAt,
      lastError: errors[0],
      importedCount: readState().importedCount + imported,
      skippedDuplicates: readState().skippedDuplicates + skippedDuplicates,
      failedCount: readState().failedCount + failed,
      processingCount: pendingIds.size,
      pendingTranscriptIds: Array.from(pendingIds).slice(0, 100),
      updatedAt: completedAt,
    });
    safeAppendAuditEntry({
      actor,
      entityType: "meeting-sync",
      entityId: "plaud",
      action: "update",
      changes: [],
      context: { route: "/api/meetings/plaud/sync", summary: `Plaud sync complete: ${imported} imported, ${updated} updated, ${pendingTranscripts} pending, ${failed} failed` },
    });
  } catch (error) {
    failed += 1;
    errors.push(error instanceof Error ? error.message : "Unknown Plaud sync failure");
    writeState({ ...readState(), status: "error", lastError: errors[0], failedCount: readState().failedCount + 1 });
  }

  return { configured: true, imported, updated, skippedDuplicates, pendingTranscripts, failed, errors, syncedAt: nowIso() };
}
