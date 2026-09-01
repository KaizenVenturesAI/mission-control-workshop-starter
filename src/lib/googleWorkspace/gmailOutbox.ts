import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { getBusinessInbox } from "@/lib/googleWorkspace/businessInboxes";
import { getMissionAgentLogoAttachment, CLIENT_OPERATOR_EMAIL } from "@/lib/crm/missionAgentSignature";

const GWS_BIN = process.env.GWS_BIN || "/opt/homebrew/bin/gws";
const CRLF = "\r\n";

export interface GmailSendInput {
  action: "draft" | "send";
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  threadId?: string;
}

export interface GmailOutboxResult {
  ok: boolean;
  action: "draft" | "send";
  id?: string;
  threadId?: string;
  raw?: unknown;
  error?: string;
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function foldBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join(CRLF) ?? value;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseGwsJson(raw: string): unknown {
  const startBrace = raw.indexOf("{");
  const startBracket = raw.indexOf("[");
  let startIndex = -1;
  if (startBrace === -1 && startBracket === -1) return raw.trim();
  if (startBrace === -1) startIndex = startBracket;
  else if (startBracket === -1) startIndex = startBrace;
  else startIndex = Math.min(startBrace, startBracket);
  try {
    return JSON.parse(raw.slice(startIndex));
  } catch {
    return raw.trim();
  }
}

function normalizeList(values?: string[]): string {
  return (values ?? []).map((value) => value.trim()).filter(Boolean).join(", ");
}

function buildMimeMessage(input: GmailSendInput): string {
  const relatedBoundary = `rel_${randomUUID().replace(/-/g, "")}`;
  const altBoundary = `alt_${randomUUID().replace(/-/g, "")}`;
  const logo = getMissionAgentLogoAttachment();
  const from = input.from || CLIENT_OPERATOR_EMAIL;
  const headers = [
    `From: ${from}`,
    `To: ${normalizeList(input.to)}`,
    ...(input.cc?.length ? [`Cc: ${normalizeList(input.cc)}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${normalizeList(input.bcc)}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: ${logo ? `multipart/related; boundary="${relatedBoundary}"` : `multipart/alternative; boundary="${altBoundary}"`}`,
  ];

  if (!logo) {
    return [
      ...headers,
      "",
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.textBody,
      "",
      `--${altBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.htmlBody,
      "",
      `--${altBoundary}--`,
      "",
    ].join(CRLF);
  }

  return [
    ...headers,
    "",
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.textBody,
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.htmlBody,
    "",
    `--${altBoundary}--`,
    "",
    `--${relatedBoundary}`,
    `Content-Type: ${logo.mimeType}; name="${logo.fileName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${logo.contentId}>`,
    `Content-Disposition: inline; filename="${logo.fileName}"`,
    "",
    foldBase64(logo.contentBase64),
    "",
    `--${relatedBoundary}--`,
    "",
  ].join(CRLF);
}

export function gmailOutbox(input: GmailSendInput): GmailOutboxResult {
  const from = input.from || CLIENT_OPERATOR_EMAIL;
  const inbox = getBusinessInbox(from);
  const configDir = inbox?.googleConfigDir || process.env.GWS_CONFIG_DIR || "";
  if (!configDir) {
    throw new Error("No Google Workspace config directory configured");
  }
  const raw = base64Url(buildMimeMessage(input));
  const payload = input.action === "draft"
    ? { message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }
    : { raw, ...(input.threadId ? { threadId: input.threadId } : {}) };

  const command = input.action === "draft"
    ? ["gmail", "users", "drafts", "create", "--params", JSON.stringify({ userId: "me" }), "--json", JSON.stringify(payload)]
    : ["gmail", "users", "messages", "send", "--params", JSON.stringify({ userId: "me" }), "--json", JSON.stringify(payload)];

  const result = spawnSync(/*turbopackIgnore: true*/ GWS_BIN, command, {
    encoding: "utf-8",
    timeout: 60_000,
    env: {
      ...process.env,
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: configDir,
      PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`,
    },
  });

  if (result.error) {
    return { ok: false, action: input.action, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      action: input.action,
      error: (result.stderr || result.stdout || `gws exited ${result.status}`).trim(),
    };
  }

  const parsed = parseGwsJson(`${result.stdout || ""}\n${result.stderr || ""}`);
  const record = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  return {
    ok: true,
    action: input.action,
    id: typeof record.id === "string" ? record.id : undefined,
    threadId: typeof record.threadId === "string" ? record.threadId : undefined,
    raw: parsed,
  };
}
