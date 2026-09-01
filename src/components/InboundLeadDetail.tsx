"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboundLead, InboundLeadSource } from "@/data/inbound-leads";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import { resolveAccount as resolveAccountLib, resolveContact as resolveContactLib } from "@/lib/crm/resolve";

interface InboundLeadDetailProps {
  lead: InboundLead;
  compact?: boolean;
  contacts?: Contact[];
  accounts?: Account[];
}

const dim = "var(--color-client-text-dim)";
const linkBlue = "#60A5FA";

const SOURCE_COLORS: Record<InboundLeadSource, { bg: string; fg: string }> = {
  "Referral Partnerships": { bg: "rgba(168,85,247,0.15)", fg: "#C4B5FD" },
  "Mission Control Builds": { bg: "rgba(249,115,22,0.15)", fg: "#FDBA74" },
  "Install Ops": { bg: "rgba(52,211,153,0.15)", fg: "#6EE7B7" },
  Website: { bg: "rgba(96,165,250,0.15)", fg: "#93C5FD" },
};

function formatAbsolute(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(value?: string): string {
  if (!value) return "—";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatAbsolute(value);
}

export default function InboundLeadDetail({
  lead,
  compact = false,
  contacts,
  accounts,
}: InboundLeadDetailProps) {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [showRaw, setShowRaw] = useState(false);

  const sectionGap = compact ? 12 : 16;
  const wrapperPadding = compact
    ? "12px 14px"
    : isMobile
      ? "14px"
      : "16px 18px 18px 44px";
  const wrapperBorderTop = compact ? "none" : "1px solid var(--color-client-border)";

  const accountList = accounts ?? [];
  const contactList = contacts ?? [];

  const resolveAccount = useCallback(
    (company: string): Account | undefined => {
      return resolveAccountLib({ name: company }, accountList).match ?? undefined;
    },
    [accountList],
  );

  const resolveContactByEmail = useCallback(
    (addr: string): Contact | undefined => {
      return resolveContactLib({ email: addr }, contactList).match ?? undefined;
    },
    [contactList],
  );

  const sourcePalette = SOURCE_COLORS[lead.source] ?? { bg: "rgba(255,255,255,0.06)", fg: "var(--color-client-text-secondary)" };
  const matchedAccount = lead.company ? resolveAccount(lead.company) : undefined;
  const matchedContact = lead.email ? resolveContactByEmail(lead.email) : undefined;

  const hasRaw = lead.rawRow && Object.keys(lead.rawRow).length > 0;

  return (
    <div style={{ borderTop: wrapperBorderTop, padding: wrapperPadding }}>
      <div style={{ display: "grid", gap: sectionGap }}>
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "3px 10px",
                borderRadius: 999,
                background: sourcePalette.bg,
                color: sourcePalette.fg,
              }}
            >
              {lead.source}
            </span>
            <span style={{ fontSize: 11, color: dim }}>
              Submitted {formatRelative(lead.submittedAt)} · {formatAbsolute(lead.submittedAt)}
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              {matchedContact ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/contacts?select=${matchedContact.id}`);
                  }}
                  title={`Open ${matchedContact.name} in Contacts`}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    font: "inherit",
                    fontSize: 14,
                    fontWeight: 700,
                    color: linkBlue,
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                >
                  {lead.name || "—"}
                </button>
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-client-text)" }}>
                  {lead.name || <span style={{ color: dim }}>—</span>}
                </span>
              )}
              {lead.company ? (
                matchedAccount ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/contacts?object=accounts&select=${matchedAccount.id}`);
                    }}
                    title={`Open ${matchedAccount.name} in Accounts`}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      font: "inherit",
                      fontSize: 12,
                      color: linkBlue,
                      cursor: "pointer",
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                  >
                    · {matchedAccount.name}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: dim }}>· {lead.company}</span>
                )
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, color: "var(--color-client-text-secondary)" }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: dim, minWidth: 48 }}>Email</span>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: linkBlue, textDecoration: "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                >
                  {lead.email}
                </a>
              ) : (
                <span style={{ color: dim }}>—</span>
              )}
            </div>
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>Message</div>
          {lead.message && lead.message.trim().length > 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--color-client-text-secondary)",
                lineHeight: 1.6,
                paddingLeft: 12,
                borderLeft: "2px solid rgba(255,255,255,0.12)",
              }}
            >
              {renderInlineMarkdown(lead.message)}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: dim, fontStyle: "italic" }}>(no message)</div>
          )}
        </section>

        {hasRaw ? (
          <section>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowRaw((v) => !v);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                margin: 0,
                font: "inherit",
                fontSize: 11,
                color: dim,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              {showRaw ? "Hide raw row" : "Show raw row"}
            </button>
            {showRaw ? (
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "var(--color-client-text-secondary)",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  padding: 10,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(lead.rawRow, null, 2)}
              </pre>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
