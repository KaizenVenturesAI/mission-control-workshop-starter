import { createHash } from "crypto";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import {
  getSyncMeta,
  updateSyncMeta,
  upsertInboundLeads,
} from "@/modules/revenue/inboundLeadsStore";
import {
  DEFAULT_EXPECTED_VALUE,
} from "@/modules/revenue/inboundLeadsTypes";
import { getDefaultAssignee } from "@/lib/inbound/leadAssignment";
import type {
  InboundLeadMarket,
  InboundLeadRecord,
  InboundLeadStatus,
  InboundLeadSyncKey,
  InboundLeadType,
  InboundSyncResult,
  InboundSyncSourceReport,
} from "@/modules/revenue/inboundLeadsTypes";

type RowMapper = (context: {
  row: string[];
  rowNumber: number;
  headers: string[];
  source: SheetSource;
  tab: string;
}) => InboundLeadRecord | null;

interface SheetSource {
  type: InboundLeadType;
  syncKey: InboundLeadSyncKey;
  spreadsheetId: string;
  candidateTabs: string[];
  range: string;
  mapRow: RowMapper;
}

const GWS_BIN = "/opt/homebrew/bin/gws";

const TEST_EMAIL_BLOCKLIST = new Set([
  "test@example.invalid",
  "spam@example.invalid",
  "placeholder@example.invalid",
]);

const SHEET_SOURCES: SheetSource[] = [
  {
    type: "corporate",
    syncKey: "corporate",
    spreadsheetId: process.env.CLIENT_CORPORATE_LEADS_SHEET_ID || "",
    candidateTabs: ["Corporate Event Leads (Working)", "Form Responses 1", "Sheet1"],
    range: "A:Z",
    mapRow: mapCorporateRow,
  },
  {
    type: "partnership",
    syncKey: "partnership",
    spreadsheetId: process.env.CLIENT_PARTNERSHIP_LEADS_SHEET_ID || "",
    candidateTabs: ["Brand Partner Inbound (Working)", "Form Responses 1", "Sheet1"],
    range: "A:Z",
    mapRow: mapPartnershipRow,
  },
  {
    type: "academy-la",
    syncKey: "academy-la",
    spreadsheetId: process.env.CLIENT_ACADEMY_LA_LEADS_SHEET_ID || "",
    candidateTabs: ["Applications", "Form Responses 1", "Sheet1"],
    range: "A:Z",
    mapRow: mapInstallProgramLaRow,
  },
  {
    type: "academy-miami",
    syncKey: "academy-miami",
    spreadsheetId: process.env.CLIENT_ACADEMY_MIAMI_LEADS_SHEET_ID || "",
    candidateTabs: ["Applications", "Form Responses 1", "Sheet1"],
    range: "A:Z",
    mapRow: mapInstallProgramMiamiRow,
  },
];

const SOURCES: SheetSource[] = SHEET_SOURCES.filter((source) => source.spreadsheetId);

export function syncAllSheets(): InboundSyncResult {
  const reports: InboundSyncSourceReport[] = [];
  const errors: string[] = [];

  for (const source of SOURCES) {
    const report = syncSource(source);
    reports.push(report);
    if (report.error) {
      errors.push(`${source.type}: ${report.error}`);
    }
  }

  const synced = reports.reduce((sum, report) => sum + report.synced, 0);
  const created = reports.reduce((sum, report) => sum + report.created, 0);
  const updated = reports.reduce((sum, report) => sum + report.updated, 0);
  const successCount = reports.filter((report) => report.status === "success").length;

  return {
    success: successCount > 0,
    mode: successCount > 0 ? "live" : "scaffold",
    synced,
    created,
    updated,
    sources: reports,
    errors,
    lastSync: getSyncMeta(),
  };
}

function syncSource(source: SheetSource): InboundSyncSourceReport {
  if (!existsSync(GWS_BIN)) {
    return {
      type: source.type,
      status: "blocked",
      synced: 0,
      created: 0,
      updated: 0,
      error: "gws CLI not found on this runtime",
      detail: "Install or expose gws to enable live Google Sheets ingestion.",
    };
  }

  const readResult = readSourceRows(source);
  if (!readResult.ok) {
    return {
      type: source.type,
      status: readResult.blocked ? "blocked" : "error",
      synced: 0,
      created: 0,
      updated: 0,
      error: readResult.error,
      detail: readResult.detail,
    };
  }

  const leads: InboundLeadRecord[] = [];
  const rowErrors: string[] = [];

  for (let index = 0; index < readResult.rows.length; index += 1) {
    try {
      const mapped = source.mapRow({
        row: readResult.rows[index],
        rowNumber: index + 2,
        headers: readResult.headers,
        source,
        tab: readResult.tab,
      });
      if (mapped) leads.push(mapped);
    } catch (error) {
      rowErrors.push(`row ${index + 2}: ${toErrorMessage(error)}`);
    }
  }

  for (const lead of leads) {
    if (!lead.assignedTo) {
      lead.assignedTo = getDefaultAssignee(lead);
    }
  }

  const upserted = upsertInboundLeads(leads, buildDedupeKey);
  const syncedAt = new Date().toISOString();
  updateSyncMeta(source.syncKey, syncedAt);

  return {
    type: source.type,
    status: rowErrors.length > 0 ? "error" : "success",
    synced: leads.length,
    created: upserted.created,
    updated: upserted.updated,
    tab: readResult.tab,
    syncedAt,
    error: rowErrors.length > 0 ? rowErrors.join("; ") : undefined,
    detail:
      rowErrors.length > 0
        ? "Partial row-mapping errors occurred. Valid rows were still persisted."
        : "Live sheet rows ingested into local JSON store.",
  };
}

function readSourceRows(source: SheetSource):
  | { ok: true; tab: string; headers: string[]; rows: string[][] }
  | { ok: false; blocked: boolean; error: string; detail?: string } {
  const failures: string[] = [];

  for (const tab of source.candidateTabs) {
    // Wrap tab names containing spaces or parens in single quotes (Google Sheets API requirement)
    const escapedTab = /[ ()']/.test(tab) ? `'${tab.replace(/'/g, "''")}'` : tab;
    const range = `${escapedTab}!${source.range}`;
    const result = spawnSync(
      GWS_BIN,
      ["sheets", "+read", "--spreadsheet", source.spreadsheetId, "--range", range, "--format", "json"],
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    if (result.error) {
      return {
        ok: false,
        blocked: true,
        error: result.error.message,
        detail: "The gws process could not start in this environment.",
      };
    }

    const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();

    if (result.status !== 0) {
      const message = combinedOutput || `gws exited with status ${String(result.status)}`;
      failures.push(`${tab}: ${message}`);
      if (looksLikeAuthOrAccessIssue(message)) {
        return {
          ok: false,
          blocked: true,
          error: message,
          detail: "Live ingestion is scaffolded, but Google auth or sheet access is not currently available here.",
        };
      }
      continue;
    }

    const payload = parseJsonObject(combinedOutput);
    const values = Array.isArray(payload?.values) ? payload.values : [];
    if (values.length === 0) {
      return {
        ok: true,
        tab,
        headers: [],
        rows: [],
      };
    }

    const normalizedRows = values.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
    return {
      ok: true,
      tab,
      headers: normalizedRows[0] ?? [],
      rows: normalizedRows.slice(1),
    };
  }

  return {
    ok: false,
    blocked: false,
    error: failures.join(" | ") || "No readable candidate tab found",
    detail: "The sync scaffolding is present, but none of the configured sheet tabs produced readable data.",
  };
}

function parseJsonObject(raw: string): { values?: unknown[] } | null {
  // gws emits "Using keyring backend: keyring" on stderr which may appear before
  // or after the JSON object in the combined stdout+stderr string. Extract only
  // the JSON object by finding the outermost { ... } boundaries.
  const startIndex = raw.indexOf("{");
  if (startIndex === -1) return null;

  const endIndex = raw.lastIndexOf("}");
  if (endIndex === -1 || endIndex < startIndex) return null;

  try {
    return JSON.parse(raw.slice(startIndex, endIndex + 1)) as { values?: unknown[] };
  } catch {
    return null;
  }
}

function looksLikeAuthOrAccessIssue(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("auth") ||
    lower.includes("login") ||
    lower.includes("credential") ||
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("unauthorized") ||
    lower.includes("access denied")
  );
}

function buildLeadId(type: InboundLeadType, identity: string): string {
  const digest = createHash("sha256").update(`${type}:${identity.toLowerCase()}`).digest("hex").slice(0, 12);
  return `lead-${type}-${digest}`;
}

function buildDedupeKey(lead: InboundLeadRecord): string {
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) return `${lead.type}:${email}`;
  // Fallback: use name + type + date-of-receipt (not row number — rows shift when sheet is edited)
  // This prevents duplicate creation when rows are inserted above an email-less lead
  const name = (lead.name ?? "").trim().toLowerCase();
  const dateSlice = lead.receivedAt ? lead.receivedAt.slice(0, 10) : "unknown";
  return `${lead.type}:name:${name}:${dateSlice}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getCell(row: string[], headers: string[], names: string[], fallbackIndex?: number): string {
  const normalizedTargets = names.map(normalizeHeader);
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeHeader(headers[index]);
    if (normalizedTargets.includes(header)) {
      return String(row[index] ?? "").trim();
    }
  }

  if (typeof fallbackIndex === "number") {
    return String(row[fallbackIndex] ?? "").trim();
  }

  return "";
}

function parseSheetDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue) && numericValue > 25569) {
      const unixMs = Math.round((numericValue - 25569) * 86400 * 1000);
      return new Date(unixMs).toISOString();
    }
  }

  const mdYMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mdYMatch) {
    const [, month, day, rawYear, hour = "00", minute = "00", second = "00"] = mdYMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}.000Z`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function normalizeStatus(value: string, fallback: InboundLeadStatus = "new"): InboundLeadStatus {
  const lower = value.trim().toLowerCase();
  if (!lower) return fallback;
  if (lower.includes("contact")) return "contacted";
  if (lower.includes("qualif")) return "qualified";
  if (lower.includes("schedul") || lower.includes("assessment")) return "scheduled";
  if (lower.includes("confirm")) return "confirmed";
  if (lower.includes("paid")) return "paid";
  if (lower.includes("active") || lower.includes("won")) return "active";
  if (lower.includes("lost")) return "lost";
  if (lower.includes("closed")) return "closed";
  return fallback;
}

/** Try to classify a free-text location/city string into a typed market. */
function parseMarketFromLocation(location: string): InboundLeadMarket | undefined {
  const lower = location.trim().toLowerCase();
  if (!lower) return undefined;
  if (lower.includes("miami") || lower === "fl" || lower.includes("florida")) return "miami";
  if (
    lower.includes("los angeles") ||
    lower === "la" ||
    lower.startsWith("la ") ||
    lower.includes("california") ||
    lower === "ca" ||
    lower.startsWith("ca ")
  ) return "la";
  return "other";
}

function makeBaseLead(args: {
  type: InboundLeadType;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  contactName?: string;
  status?: InboundLeadStatus;
  substatus?: string;
  source: SheetSource;
  tab: string;
  rowNumber: number;
  receivedAt: string;
  receivedAtFallback?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
  market?: InboundLeadMarket;
  expectedValue?: number;
}): InboundLeadRecord | null {
  // Use email as primary identity; fall back to name+type+date to match buildDedupeKey
  // (row-number fallback is fragile — rows shift when the sheet is edited)
  const name = (args.name ?? "").trim().toLowerCase();
  const dateSlice = args.receivedAt ? args.receivedAt.slice(0, 10) : "unknown";
  const identity = args.email?.trim() || `${args.type}:name:${name}:${dateSlice}`;

  if (args.email && TEST_EMAIL_BLOCKLIST.has(args.email.trim().toLowerCase())) {
    return null;
  }

  return {
    id: buildLeadId(args.type, identity),
    type: args.type,
    name: args.name,
    companyName: args.companyName,
    contactName: args.contactName,
    email: args.email?.trim() || undefined,
    phone: args.phone?.trim() || undefined,
    status: args.status ?? "new",
    substatus: args.substatus,
    source: "website",
    market: args.market,
    expectedValue: args.expectedValue,
    sourceSheet: args.source.spreadsheetId,
    sourceTab: args.tab,
    sourceRow: args.rowNumber,
    receivedAt: args.receivedAt,
    contactedAt: null,
    lastUpdated: new Date().toISOString(),
    responseTimeMs: null,
    notes: args.notes?.trim() || undefined,
    metadata: {
      ...args.metadata,
      // Flag rows where no real timestamp was found so analytics can exclude them
      ...(args.receivedAtFallback ? { timestampFallback: true } : {}),
    },
  };
}

function mapCorporateRow({ row, rowNumber, headers, source, tab }: Parameters<RowMapper>[0]): InboundLeadRecord | null {
  // "Submission Date" is the actual timestamp column (index 9)
  const _rawTimestamp = getCell(row, headers, [], -1);
  const _parsedAt = parseSheetDate(getCell(row, headers, ["timestamp", "submitted at", "created at", "submission date", "date"], 9));
  const receivedAt = _parsedAt ?? new Date().toISOString();
  const receivedAtFallback = !_parsedAt;

  const companyName = getCell(row, headers, ["company", "company name", "organization"], 4);
  // Sheet has separate First Name (0) and Last Name (1) columns — combine them
  const firstName = getCell(row, headers, ["first name"], 0);
  const lastName = getCell(row, headers, ["last name"], 1);
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const email = getCell(row, headers, ["email", "email address"], 3);
  const phone = getCell(row, headers, ["phone", "phone number", "mobile", "phone number"], 2);
  // "Desired Date of Event (Exact or Estimate)" is at index 7
  const eventDate = getCell(row, headers, ["event date", "date of event", "desired date", "desired date of event"], 7);
  const people = getCell(row, headers, ["number of people", "people", "guest count", "attendees"], 8);
  // No dedicated budget column in current sheet; store additional comments instead
  const additionalComments = getCell(row, headers, ["budget", "estimated budget", "additional comments", "comments"], 6);
  const location = getCell(row, headers, ["location"], 5);

  const market = parseMarketFromLocation(location);

  return makeBaseLead({
    type: "corporate",
    name: companyName || contactName || `Corporate lead ${rowNumber}`,
    companyName: companyName || undefined,
    contactName: contactName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    source,
    tab,
    rowNumber,
    receivedAt,
    receivedAtFallback,
    market,
    expectedValue: DEFAULT_EXPECTED_VALUE.corporate,
    metadata: {
      eventDate: eventDate || undefined,
      people: people || undefined,
      location: location || undefined,
      additionalComments: additionalComments || undefined,
    },
  });
}

function mapPartnershipRow({ row, rowNumber, headers, source, tab }: Parameters<RowMapper>[0]): InboundLeadRecord | null {
  // "Submission Date" is the actual timestamp column (index 7)
  const _rawTimestamp = getCell(row, headers, [], -1);
  const _parsedAt = parseSheetDate(getCell(row, headers, ["timestamp", "submitted at", "created at", "submission date", "date"], 7));
  const receivedAt = _parsedAt ?? new Date().toISOString();
  const receivedAtFallback = !_parsedAt;

  const brandName = getCell(row, headers, ["brand", "brand name", "company", "company name"], 4);
  // Sheet has separate First Name (0) and Last Name (1) columns — combine them
  const firstName = getCell(row, headers, ["first name"], 0);
  const lastName = getCell(row, headers, ["last name"], 1);
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const email = getCell(row, headers, ["email", "email address"], 3);
  const phone = getCell(row, headers, ["phone", "phone number", "mobile"], 2);
  // No category column; store location instead
  const location = getCell(row, headers, ["location"], 5);
  // "Additional Comments" is at index 6
  const proposal = getCell(row, headers, ["proposal", "proposal details", "message", "notes", "additional comments"], 6);

  return makeBaseLead({
    type: "partnership",
    name: brandName || contactName || `Partnership lead ${rowNumber}`,
    companyName: brandName || undefined,
    contactName: contactName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    source,
    tab,
    rowNumber,
    receivedAt,
    receivedAtFallback,
    // market: undefined — too variable for partnerships
    // expectedValue: undefined — too variable for partnerships
    notes: proposal || undefined,
    metadata: {
      location: location || undefined,
    },
  });
}

function mapInstallProgramLaRow({ row, rowNumber, headers, source, tab }: Parameters<RowMapper>[0]): InboundLeadRecord | null {
  // "Timestamp" is at index 11 in this sheet; header match will find it
  const _rawTimestamp = getCell(row, headers, [], -1);
  const _parsedAt = parseSheetDate(getCell(row, headers, ["timestamp", "submitted at", "created at"], 11));
  const receivedAt = _parsedAt ?? new Date().toISOString();
  const receivedAtFallback = !_parsedAt;

  // "Your First and Last Name" → index 0
  const name = getCell(row, headers, ["name", "full name", "your first and last name", "your full name"], 0);
  // "Your Email Address" → index 5
  const email = getCell(row, headers, ["email", "email address", "your email address", "your email"], 5);
  // "Your Phone Number" → index 4
  const phone = getCell(row, headers, ["phone", "phone number", "mobile", "your phone number", "your phone"], 4);
  // "How would you rate your current agentic systems level?" → index 8
  const level = getCell(row, headers, ["level", "playing level", "skill level", "how would you rate your current agentic systems level"], 8);
  // Availability schedule → index 6
  const availability = getCell(row, headers, ["availability", "schedule"], 6);
  // "Context" is the notes/freetext field → index 3
  const notes = getCell(row, headers, ["notes", "message", "comments", "context"], 3);
  // "Status" (exact header) is at index 7; "Status (February)" at index 1 won't match
  const sheetStatus = getCell(row, headers, ["status", "application status"], 7);

  return makeBaseLead({
    type: "academy-la",
    name: name || `Half-Day Install lead ${rowNumber}`,
    email: email || undefined,
    phone: phone || undefined,
    source,
    tab,
    rowNumber,
    receivedAt,
    receivedAtFallback,
    status: normalizeStatus(sheetStatus),
    substatus: sheetStatus || undefined,
    market: "la",
    expectedValue: DEFAULT_EXPECTED_VALUE["academy-la"],
    notes: notes || undefined,
    metadata: {
      level: level || undefined,
      availability: availability || undefined,
      originalSheetStatus: sheetStatus || undefined,
    },
  });
}

function mapInstallProgramMiamiRow({ row, rowNumber, headers, source, tab }: Parameters<RowMapper>[0]): InboundLeadRecord | null {
  // Miami sheet: Status=col1(idx1), Timestamp=col15(idx15), Name=col0(idx0)
  // "Status" header at index 1 will be found by header match
  const sheetStatus = getCell(row, headers, ["status", "application status"], 1);
  // "Timestamp" header at index 15 will be found by header match
  const _rawTimestamp = getCell(row, headers, [], -1);
  const _parsedAt = parseSheetDate(getCell(row, headers, ["timestamp", "submitted at", "created at"], 15));
  const receivedAt = _parsedAt ?? new Date().toISOString();
  const receivedAtFallback = !_parsedAt;

  // "Your Full Name" → index 0
  const name = getCell(row, headers, ["name", "full name", "your full name", "your first and last name"], 0);
  // "Your Email Address" → index 4
  const email = getCell(row, headers, ["email", "email address", "your email address", "your email"], 4);
  // "Your Phone Number" → index 5
  const phone = getCell(row, headers, ["phone", "phone number", "mobile", "your phone number", "your phone"], 5);
  // "How would you rate your current agentic systems level?" → index 9
  const level = getCell(row, headers, ["level", "playing level", "skill level", "how would you rate your current agentic systems level"], 9);
  // "What is your preferred training location?" → index 2
  const location = getCell(row, headers, ["location", "preferred location", "neighborhood", "what is your preferred training location"], 2);

  return makeBaseLead({
    type: "academy-miami",
    name: name || `Full-Day Install lead ${rowNumber}`,
    email: email || undefined,
    phone: phone || undefined,
    source,
    tab,
    rowNumber,
    receivedAt,
    receivedAtFallback,
    status: normalizeStatus(sheetStatus),
    substatus: sheetStatus || undefined,
    market: "miami",
    expectedValue: DEFAULT_EXPECTED_VALUE["academy-miami"],
    metadata: {
      level: level || undefined,
      location: location || undefined,
      originalSheetStatus: sheetStatus || undefined,
    },
  });
}
