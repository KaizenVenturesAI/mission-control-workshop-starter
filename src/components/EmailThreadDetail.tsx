"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { EmailThread, EmailParty } from "@/data/emails";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import { resolveContact as resolveContactLib } from "@/lib/crm/resolve";

interface EmailThreadDetailProps {
  email: EmailThread;
  compact?: boolean;
  contacts?: Contact[];
  accounts?: Account[];
}

const dim = "var(--color-client-text-dim)";
const linkBlue = "#60A5FA";

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

function emailDomain(email?: string): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function renderEmailBodyText(text: string): React.ReactElement {
  const lines = text.split(/\n/);
  const elements: React.ReactElement[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(
      <ul key={`b-${key++}`} style={{ margin: "6px 0", paddingLeft: 18, listStyleType: "disc" }}>
        {bullets.map((item, idx) => (
          <li key={idx} style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.55, marginBottom: 2 }}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, ""));
      continue;
    }
    flushBullets();
    elements.push(
      <p key={`p-${key++}`} style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.6, marginTop: elements.length ? 6 : 0 }}>
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }
  flushBullets();
  return <div>{elements}</div>;
}

export default function EmailThreadDetail({
  email,
  compact = false,
  contacts,
  accounts,
}: EmailThreadDetailProps) {
  const { isMobile } = useResponsive();
  const router = useRouter();

  const sectionGap = compact ? 12 : 16;
  const wrapperPadding = compact
    ? "12px 14px"
    : isMobile
      ? "14px"
      : "16px 18px 18px 44px";
  const wrapperBorderTop = compact ? "none" : "1px solid var(--color-client-border)";

  const accountList = accounts ?? [];
  const contactList = contacts ?? [];

  const resolveAccountByDomain = useCallback(
    (domain: string): Account | undefined => {
      if (!domain) return undefined;
      const target = domain.toLowerCase();
      return accountList.find((a) => {
        const site = (a.website ?? "").toLowerCase();
        if (site.includes(target)) return true;
        const aliases = a.aliases ?? [];
        return aliases.some((alias) => alias.toLowerCase().includes(target));
      });
    },
    [accountList],
  );

  const resolveContactByEmail = useCallback(
    (addr: string): Contact | undefined => {
      return resolveContactLib({ email: addr }, contactList).match ?? undefined;
    },
    [contactList],
  );

  const resolveContactByName = useCallback(
    (name: string): Contact | undefined => {
      return resolveContactLib({ name }, contactList).match ?? undefined;
    },
    [contactList],
  );

  const renderParty = (party: EmailParty | undefined, prefixKey: string) => {
    if (!party || !party.email) {
      return <span style={{ color: dim }}>—</span>;
    }
    const matchedContact =
      resolveContactByEmail(party.email) ??
      (party.name ? resolveContactByName(party.name) : undefined);
    const matchedAccount = resolveAccountByDomain(emailDomain(party.email));
    const display = party.name?.trim() || party.email;
    return (
      <span
        key={prefixKey}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--color-client-text-secondary)",
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
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
              fontWeight: 600,
              fontSize: 12,
              color: linkBlue,
              cursor: "pointer",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
          >
            {display}
          </button>
        ) : (
          <span style={{ fontWeight: 600, color: "var(--color-client-text)" }}>{display}</span>
        )}
        <span style={{ color: dim, fontSize: 11 }}>&lt;{party.email}&gt;</span>
        {matchedAccount ? (
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
              fontSize: 11,
              color: linkBlue,
              cursor: "pointer",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
          >
            · {matchedAccount.name}
          </button>
        ) : null}
      </span>
    );
  };

  const renderPartyRow = (label: string, parties: EmailParty[] | undefined) => {
    if (!parties || parties.length === 0) {
      return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: dim, minWidth: 32 }}>{label}</span>
          <span style={{ color: dim, fontSize: 12 }}>—</span>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: dim, minWidth: 32 }}>{label}</span>
        {parties.map((p, i) => renderParty(p, `${label}-${i}`))}
      </div>
    );
  };

  const subject = email.subject?.trim() || "(no subject)";
  const hasHtml = !!email.bodyHtml && email.bodyHtml.trim().length > 0;
  const hasText = !!email.bodyText && email.bodyText.trim().length > 0;

  return (
    <div style={{ borderTop: wrapperBorderTop, padding: wrapperPadding }}>
      <div style={{ display: "grid", gap: sectionGap }}>
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>
            {subject}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {renderPartyRow("From", email.from ? [email.from] : undefined)}
            {renderPartyRow("To", email.to)}
            {email.cc && email.cc.length > 0 ? renderPartyRow("Cc", email.cc) : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: dim }}>
            Sent {formatRelative(email.sentAt)} · {formatAbsolute(email.sentAt)}
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>Message</div>
          {hasHtml ? (
            <div
              style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.6 }}
              // Body is server-trusted Gmail-sync content; rendered as supplied.
              dangerouslySetInnerHTML={{ __html: email.bodyHtml as string }}
            />
          ) : hasText ? (
            renderEmailBodyText(email.bodyText as string)
          ) : (
            <pre
              style={{
                fontSize: 11,
                color: dim,
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: 10,
                whiteSpace: "pre-wrap",
              }}
            >
              {/* TODO: render body once EmailThread payload includes bodyText / bodyHtml */}
              (no body content)
            </pre>
          )}
        </section>

        {email.attachments && email.attachments.length > 0 ? (
          <section>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>
              Attachments ({email.attachments.length})
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {email.attachments.map((att, i) => (
                <div key={`att-${i}`} style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                  {att.url ? (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: linkBlue, textDecoration: "underline", textUnderlineOffset: 2 }}
                    >
                      📎 {att.filename}
                    </a>
                  ) : (
                    <span>📎 {att.filename}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {email.threadUrl ? (
          <section>
            <a
              href={email.threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: linkBlue,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(96,165,250,0.25)",
                background: "rgba(96,165,250,0.08)",
                textDecoration: "none",
              }}
            >
              Open in Gmail ↗
            </a>
          </section>
        ) : null}
      </div>
    </div>
  );
}
