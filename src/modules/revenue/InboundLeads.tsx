"use client";

import React, { useEffect, useMemo, useState } from "react";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import type {
  InboundLeadRecord,
  InboundLeadType,
} from "@/modules/revenue/inboundLeadsTypes";

const TYPE_COLORS: Record<InboundLeadType, string> = {
  partnership: "#A78BFA",
  corporate: "#60A5FA",
  "academy-la": "#34D399",
  "academy-miami": "#FB923C",
};

const FILTERS: { key: "all" | InboundLeadType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "partnership", label: "Referral Partners" },
  { key: "corporate", label: "Mission Control Builds" },
  { key: "academy-la", label: "Half-Day Installs" },
  { key: "academy-miami", label: "Full-Day Installs" },
];

function formatLeadDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function typeLabel(type: InboundLeadType) {
  if (type === "partnership") return "Referral Partner";
  if (type === "corporate") return "Mission Control Build";
  if (type === "academy-la") return "Half-Day Install";
  return "Full-Day Install";
}

/* ── Render a full markdown content block into React elements ── */
function renderMarkdownBlock(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty lines → spacing
    if (trimmed === "") {
      elements.push(<div key={key++} style={{ height: 8 }} />);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      elements.push(
        <hr key={key++} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />
      );
      continue;
    }

    // Bullet lines
    if (trimmed.startsWith("- ")) {
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 8, paddingLeft: 8, fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.6 }}>
          <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>•</span>
          <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Lines that start with emoji — treat as section headers
    const emojiHeaderMatch = trimmed.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}][\uFE0F\u200D]*)\s*\*\*(.+?)\*\*(.*)/u);
    if (emojiHeaderMatch) {
      elements.push(
        <div key={key++} style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", lineHeight: 1.5, marginTop: 4 }}>
          {emojiHeaderMatch[1]} {renderInlineMarkdown(`**${emojiHeaderMatch[2]}**${emojiHeaderMatch[3]}`)}
        </div>
      );
      continue;
    }

    // Regular bold header line (no emoji)
    if (trimmed.startsWith("**") && trimmed.includes("**")) {
      elements.push(
        <div key={key++} style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.88)", lineHeight: 1.5, marginTop: 2 }}>
          {renderInlineMarkdown(trimmed)}
        </div>
      );
      continue;
    }

    // Default paragraph line
    elements.push(
      <div key={key++} style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
        {renderInlineMarkdown(trimmed)}
      </div>
    );
  }

  return <>{elements}</>;
}

export function InboundLeads() {
  const [leads, setLeads] = useState<InboundLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | InboundLeadType>("all");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/inbound", { cache: "no-store" });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = (await response.json()) as InboundLeadRecord[];
        if (active) setLeads(data);
      } catch {
        if (active) setLeads([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads
      .filter((lead) => (filter === "all" ? true : lead.type === filter))
      .filter((lead) => {
        if (!query) return true;
        const haystack = [lead.companyName, lead.content].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => (b.date ?? b.receivedAt ?? "").localeCompare(a.date ?? a.receivedAt ?? ""));
  }, [filter, leads, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, InboundLeadRecord[]>();
    for (const lead of filtered) {
      const key = lead.date ?? lead.receivedAt?.slice(0, 10) ?? "unknown";
      const existing = map.get(key) ?? [];
      existing.push(lead);
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.96)", letterSpacing: "-0.02em" }}>
              📥 Inbound Leads
            </div>
            <div
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {filtered.length} lead{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search leads..."
            style={{
              width: "100%",
              maxWidth: 380,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.9)",
              outline: "none",
              fontSize: 12,
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((option) => {
            const active = filter === option.key;
            const tint = option.key === "all" ? "#FFFFFF" : TYPE_COLORS[option.key];
            return (
              <button
                key={option.key}
                onClick={() => setFilter(option.key)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 999,
                  border: active ? `1px solid ${tint}55` : "1px solid rgba(255,255,255,0.08)",
                  background: active ? `${tint}18` : "rgba(255,255,255,0.03)",
                  color: active ? tint : "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Loading leads…</div>
      ) : grouped.length === 0 ? (
        <div
          style={{
            padding: 18,
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
          }}
        >
          No leads match the current filters.
        </div>
      ) : (
        grouped.map(([date, items]) => (
          <section key={date} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Day header */}
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.02em" }}>
              {formatLeadDate(date)}
            </div>

            {/* Lead posts for this day */}
            {items.map((lead) => (
              <div
                key={lead.id}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Type badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: `${TYPE_COLORS[lead.type]}18`,
                      color: TYPE_COLORS[lead.type],
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {typeLabel(lead.type)}
                  </span>
                </div>

                {/* Full enrichment post rendered as markdown */}
                {renderMarkdownBlock(lead.content ?? "")}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
