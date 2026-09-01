"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  search,
  loadSearchData,
  isDataLoaded,
  totalResultCount,
  type GroupedResults,
  type SearchResult,
} from "@/lib/searchIndex";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GroupedResults[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadSearchData().then(() => {
      setLoading(false);
      setGroups(search(""));
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      setGroups(search(query));
    }
  }, [query, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const total = totalResultCount(groups);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="fade-in-up">
      <div style={{ marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          Module
        </span>
      </div>
      <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "var(--color-client-text)",
            letterSpacing: "-0.03em",
          }}
        >
          Search
        </h1>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-client-text-dim)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 6,
            padding: "3px 8px",
          }}
        >
          ⌘K anywhere
        </span>
      </div>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-client-text-secondary)",
          marginBottom: 24,
          maxWidth: "50ch",
        }}
      >
        Search across contacts, accounts, agents, board meetings, dev log, and
        more.
      </p>

      {/* Search Input */}
      <div
        className="rounded-xl flex items-center gap-3"
        style={{
          padding: "14px 18px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.10)",
          marginBottom: 24,
          maxWidth: 640,
        }}
      >
        <span style={{ fontSize: 16, color: "var(--color-client-text-dim)" }}>
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents, contacts, meetings, projects..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 15,
            color: "var(--color-client-text)",
          }}
        />
        {hasQuery && (
          <button
            onClick={() => setQuery("")}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: 4,
              color: "var(--color-client-text-dim)",
              fontSize: 11,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div
          style={{
            color: "var(--color-client-text-dim)",
            fontSize: 13,
            padding: 32,
          }}
        >
          Loading search index…
        </div>
      ) : hasQuery && groups.length === 0 ? (
        <div
          className="rounded-2xl"
          style={{
            padding: 32,
            background: "var(--color-client-card)",
            border: "1px solid var(--color-client-border)",
            maxWidth: 640,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 32,
              marginBottom: 12,
              opacity: 0.3,
            }}
          >
            ⌕
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--color-client-text-secondary)",
              marginBottom: 4,
            }}
          >
            No results for &ldquo;{query}&rdquo;
          </div>
          <div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>
            Try a different search term or browse categories below.
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 640 }}>
          {hasQuery && (
            <div
              style={{
                fontSize: 12,
                color: "var(--color-client-text-dim)",
                marginBottom: 16,
              }}
            >
              {total} result{total !== 1 ? "s" : ""} across {groups.length}{" "}
              categor{groups.length !== 1 ? "ies" : "y"}
            </div>
          )}
          {groups.map((group) => (
            <ResultGroup
              key={group.category}
              group={group}
              onNavigate={(href) => router.push(href)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  group,
  onNavigate,
}: {
  group: GroupedResults;
  onNavigate: (href: string) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        className="flex items-center gap-2"
        style={{ marginBottom: 8, padding: "0 2px" }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontWeight: 600,
          }}
        >
          {group.category}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {group.total}
        </span>
      </div>
      <div
        className="rounded-xl"
        style={{
          background: "var(--color-client-card)",
          border: "1px solid var(--color-client-border)",
          overflow: "hidden",
        }}
      >
        {group.results.map((result, i) => (
          <ResultRow
            key={result.id}
            result={result}
            isLast={i === group.results.length - 1}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function ResultRow({
  result,
  isLast,
  onNavigate,
}: {
  result: SearchResult;
  isLast: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(result.href)}
      className="w-full flex items-center gap-3 transition-colors"
      style={{
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--color-client-text)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(96,165,250,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          fontSize: 14,
          width: 24,
          textAlign: "center",
          flexShrink: 0,
          opacity: 0.5,
        }}
      >
        {result.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {result.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-client-text-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {result.subtitle}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--color-client-text-dim)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 4,
          padding: "2px 6px",
          flexShrink: 0,
        }}
      >
        {result.category}
      </span>
    </button>
  );
}
