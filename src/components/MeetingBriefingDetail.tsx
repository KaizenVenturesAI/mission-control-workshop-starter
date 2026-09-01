"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MeetingBriefing } from "@/data/meetings";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import {
  ActionItemChip,
  DepartmentBadge,
  isActionLine,
  type ActionItem,
} from "@/components/ClientMeetings";
import { resolveAccount as resolveAccountLib, resolveContact as resolveContactLib } from "@/lib/crm/resolve";

interface MeetingBriefingDetailProps {
  meeting: MeetingBriefing;
  actionItems?: ActionItem[];
  onSyncActionItems?: () => void;
  compact?: boolean;
  contacts?: Contact[];
  accounts?: Account[];
  // CRM linkage — when this briefing is rendered from inside an account/contact drawer,
  // pass the source IDs so any newly-tracked action item carries them through.
  relatedAccountId?: string;
  relatedContactId?: string;
}

export default function MeetingBriefingDetail({
  meeting,
  actionItems,
  onSyncActionItems,
  compact = false,
  contacts,
  accounts,
  relatedAccountId,
  relatedContactId,
}: MeetingBriefingDetailProps) {
  const { isMobile } = useResponsive();
  const router = useRouter();

  const sectionGap = compact ? 12 : 16;
  const summaryFontSize = compact ? 12 : 13;
  const wrapperPadding = compact
    ? "12px 14px"
    : isMobile
      ? "14px"
      : "16px 18px 18px 44px";
  const wrapperBorderTop = compact ? "none" : "1px solid var(--color-client-border)";

  const items = actionItems ?? [];
  const handleSync = onSyncActionItems ?? (() => {});
  const showActionItemChips = Boolean(actionItems);

  const accountList = accounts ?? [];
  const contactList = contacts ?? [];

  const resolveAccount = useCallback(
    (company: string): Account | undefined => {
      return resolveAccountLib({ name: company }, accountList).match ?? undefined;
    },
    [accountList],
  );

  const resolveContact = useCallback(
    (name: string, company: string): Contact | undefined => {
      return resolveContactLib({ name, company }, contactList, accountList).match ?? undefined;
    },
    [contactList, accountList],
  );

  return (
    <div style={{ borderTop: wrapperBorderTop, padding: wrapperPadding }}>
      <div style={{ display: "grid", gap: sectionGap }}>
        {meeting.sourceSystem ? (
          <section>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11, color: "var(--color-client-text-dim)" }}>
              <span style={{ color: "#FCA5A5", background: "rgba(218,218,219,0.12)", border: "1px solid rgba(218,218,219,0.28)", borderRadius: 999, padding: "2px 9px", fontWeight: 700 }}>
                {meeting.sourceSystem === "plaud" ? "Plaud" : meeting.sourceSystem}
              </span>
              {meeting.sourceOwner ? <span>Owner: {meeting.sourceOwner}</span> : null}
              {meeting.syncStatus ? <span>Status: {meeting.syncStatus}</span> : null}
              {meeting.externalId ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>Source ID: {meeting.externalId}</span> : null}
            </div>
          </section>
        ) : null}

        {meeting.formattedNotesMarkdown ? (
          <section>
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>
                Full Example Client Notes
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: "8px 0 0",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid var(--color-client-border)",
                  background: "rgba(255,255,255,0.025)",
                  color: "var(--color-client-text-secondary)",
                  fontFamily: "inherit",
                  fontSize: summaryFontSize,
                  lineHeight: 1.65,
                }}
              >
                {meeting.formattedNotesMarkdown}
              </pre>
            </details>
          </section>
        ) : null}

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>Participants</div>
          <div style={{ display: "grid", gap: 8 }}>
            {meeting.participants.map((participant) => {
              const matchedContact = resolveContact(participant.name, participant.company);
              const matchedAccount = participant.company ? resolveAccount(participant.company) : undefined;
              return (
                <div
                  key={`${meeting.id}-${participant.name}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 12,
                    color: "var(--color-client-text-secondary)",
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
                        color: "#60A5FA",
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = "underline";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = "none";
                      }}
                    >
                      {participant.name}
                    </button>
                  ) : (
                    <span style={{ fontWeight: 600, color: "var(--color-client-text)" }}>{participant.name}</span>
                  )}
                  <span>{participant.role}</span>
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
                        fontSize: 12,
                        color: "#60A5FA",
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = "underline";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = "none";
                      }}
                    >
                      · {participant.company}
                    </button>
                  ) : (
                    <span style={{ color: "var(--color-client-text-dim)" }}>· {participant.company}</span>
                  )}
                  {participant.department ? <DepartmentBadge department={participant.department} /> : null}
                  {participant.isCLIENT ? (
                    <span style={{ fontSize: 10, color: "#34D399", background: "rgba(52,211,153,0.12)", borderRadius: 999, padding: "2px 8px" }}>Example Client</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>Executive Summary</div>
          <div style={{ fontSize: summaryFontSize, lineHeight: 1.7, color: "var(--color-client-text-secondary)" }}>{renderInlineMarkdown(meeting.executiveSummary)}</div>
        </section>

        {meeting.strategicNote ? (
          <section>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>💡 Strategic Note</div>
            <div style={{ fontSize: summaryFontSize, lineHeight: 1.7, color: "var(--color-client-text-secondary)" }}>{renderInlineMarkdown(meeting.strategicNote)}</div>
          </section>
        ) : null}

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>✅ What&apos;s Handled</div>
          <div style={{ display: "grid", gap: 6 }}>
            {meeting.whatsHandled.map((item, index) => {
              const showChip = showActionItemChips && isActionLine(item, false);
              return (
                <div key={`${meeting.id}-handled-${index}`} style={{ paddingLeft: 16, position: "relative", fontSize: 13, lineHeight: 1.6, color: "var(--color-client-text-secondary)" }}>
                  <span style={{ position: "absolute", left: 4 }}>·</span>
                  {renderInlineMarkdown(item)}
                  {showChip ? (
                    <ActionItemChip
                      bulletText={item}
                      actionItems={items}
                      onSync={handleSync}
                      relatedAccountId={relatedAccountId}
                      relatedContactId={relatedContactId}
                      sourceMeeting={meeting.title}
                      sourceDate={meeting.date}
                      sourceMessageId={`${meeting.id}:handled:${index}`}
                      notes={`Created from Example Client Meetings briefing ${meeting.id}. Section: What's Handled.`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8 }}>📌 Next Steps</div>
          <div style={{ display: "grid", gap: 6 }}>
            {meeting.nextSteps.map((item, index) => (
              <div key={`${meeting.id}-next-${index}`} style={{ paddingLeft: 16, position: "relative", fontSize: 13, lineHeight: 1.6, color: "var(--color-client-text-secondary)" }}>
                <span style={{ position: "absolute", left: 4 }}>·</span>
                {renderInlineMarkdown(item)}
                {showActionItemChips ? (
                  <ActionItemChip
                    bulletText={item}
                    actionItems={items}
                    onSync={handleSync}
                    relatedAccountId={relatedAccountId}
                    relatedContactId={relatedContactId}
                    sourceMeeting={meeting.title}
                    sourceDate={meeting.date}
                    sourceMessageId={`${meeting.id}:next:${index}`}
                    notes={`Created from Example Client Meetings briefing ${meeting.id}. Section: Next Steps.`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {meeting.transcriptUrl || meeting.transcriptSourceUrl ? (
          <section>
            <a
              href={meeting.transcriptUrl || meeting.transcriptSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#60A5FA", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Open source transcript ↗
            </a>
          </section>
        ) : null}
      </div>
    </div>
  );
}
