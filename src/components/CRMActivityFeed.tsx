"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CRMActivity } from "@/data/crm-activities";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";

const TYPE_ICONS: Record<string, string> = {
  Call: "📞",
  Note: "📝",
  Email: "📧",
  Meeting: "🤝",
  "Inbound Lead": "📥",
  Task: "✔️",
  Outreach: "📣",
  "Follow-Up": "🔄",
};

const TYPE_COLORS: Record<string, string> = {
  Call: "#60A5FA",
  Note: "#A78BFA",
  Email: "#34D399",
  Meeting: "#FBBF24",
  "Inbound Lead": "#F472B6",
  Task: "#38BDF8",
  Outreach: "#FB923C",
  "Follow-Up": "#818CF8",
};

interface ContactLookup {
  id: string;
  name: string;
  accountId?: string;
}

interface AccountLookup {
  id: string;
  name: string;
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const DEFAULT_VISExampleE = 6;

export function CRMActivityFeed({
  consoleData,
  consoleLoading = false,
}: {
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
}) {
  const router = useRouter();
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [contactMap, setContactMap] = useState<Record<string, ContactLookup>>({});
  const [accountMap, setAccountMap] = useState<Record<string, AccountLookup>>({});
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);

  const applyConsoleData = useCallback((payload: CRMConsolePayload) => {
    const sorted = [...payload.activities].sort(
      (a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "")
    );
    setActivities(sorted);

    const nextContactMap: Record<string, ContactLookup> = {};
    for (const c of payload.contacts) {
      if (c.id) nextContactMap[c.id] = c;
    }
    setContactMap(nextContactMap);

    const nextAccountMap: Record<string, AccountLookup> = {};
    for (const a of payload.accounts) {
      if (a.id) nextAccountMap[a.id] = a;
    }
    setAccountMap(nextAccountMap);
    setLoading(false);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, conRes, accRes] = await Promise.all([
        fetch("/api/crm/activities"),
        fetch("/api/crm/contacts"),
        fetch("/api/crm/accounts"),
      ]);

      if (actRes.ok) {
        const data = (await actRes.json()) as CRMActivity[];
        const sorted = [...data].sort(
          (a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "")
        );
        setActivities(sorted);
      }

      if (conRes.ok) {
        const contacts = (await conRes.json()) as ContactLookup[];
        const map: Record<string, ContactLookup> = {};
        for (const c of contacts) {
          if (c.id) map[c.id] = c;
        }
        setContactMap(map);
      }

      if (accRes.ok) {
        const accounts = (await accRes.json()) as AccountLookup[];
        const map: Record<string, AccountLookup> = {};
        for (const a of accounts) {
          if (a.id) map[a.id] = a;
        }
        setAccountMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (consoleData) {
      applyConsoleData(consoleData);
      return;
    }
    if (consoleLoading) return;
    fetchData();
  }, [applyConsoleData, consoleData, consoleLoading, fetchData]);

  const visibleActivities = showAll
    ? activities
    : activities.slice(0, DEFAULT_VISExampleE);
  const hasMore = activities.length > DEFAULT_VISExampleE;
  const count = activities.length;

  const handleActivityClick = (activity: CRMActivity) => {
    // Navigate to the contact drawer (or account if no contact)
    if (activity.contactId) {
      router.push(`/contacts?select=${activity.contactId}`);
    } else if (activity.accountId) {
      router.push(`/contacts?object=accounts&select=${activity.accountId}`);
    }
  };

  const getAssociatedName = (activity: CRMActivity): string | null => {
    if (activity.contactId && contactMap[activity.contactId]) {
      return contactMap[activity.contactId].name;
    }
    if (activity.accountId && accountMap[activity.accountId]) {
      return accountMap[activity.accountId].name;
    }
    return null;
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-client-text-dim)",
          cursor: "pointer",
          padding: "10px 14px",
          borderRadius: expanded ? "10px 10px 0 0" : 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderBottom: expanded ? "none" : undefined,
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13 }}>{expanded ? "▾" : "▸"}</span>
        <span>Recent Activity</span>
        {count > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: "rgba(96,165,250,0.15)",
              color: "#60A5FA",
              padding: "2px 7px",
              borderRadius: 8,
              minWidth: 18,
              textAlign: "center",
            }}
          >
            {count}
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginLeft: "auto" }}>
            Loading…
          </span>
        )}
      </button>

      {/* Expanded list */}
      {expanded && (
        <div
          style={{
            borderRadius: "0 0 10px 10px",
            border: "1px solid rgba(255,255,255,0.04)",
            borderTop: "none",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {activities.length === 0 && !loading && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-client-text-dim)" }}>
              No recent activity
            </div>
          )}
          {visibleActivities.map((activity) => {
            const icon = TYPE_ICONS[activity.type] || "📋";
            const badgeColor = TYPE_COLORS[activity.type] || "#9CA3AF";
            const truncated =
              activity.content.length > 70
                ? activity.content.slice(0, 70) + "…"
                : activity.content;
            const associatedName = getAssociatedName(activity);
            const isClickable = !!(activity.contactId || activity.accountId);

            return (
              <div
                key={activity.id}
                onClick={() => isClickable && handleActivityClick(activity)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  borderTop: "1px solid rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: isClickable ? "pointer" : "default",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (isClickable)
                    (e.currentTarget as HTMLDivElement).style.background =
                      "rgba(96,165,250,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {/* Icon + badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: badgeColor,
                      background: `${badgeColor}15`,
                      padding: "1px 6px",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activity.type}
                  </span>
                </div>

                {/* Content + associated name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {associatedName && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#60A5FA",
                        marginRight: 6,
                      }}
                    >
                      {associatedName}
                    </span>
                  )}
                  <span style={{ color: "var(--color-client-text)", fontWeight: 500 }}>
                    {truncated}
                  </span>
                </div>

                {/* Timestamp */}
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-client-text-dim)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(activity.occurredAt)}
                </span>
              </div>
            );
          })}

          {/* Show More / Show Less */}
          {hasMore && (
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(!showAll);
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#60A5FA",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                {showAll
                  ? "Show Less"
                  : `Show More (${activities.length - DEFAULT_VISExampleE} more)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
