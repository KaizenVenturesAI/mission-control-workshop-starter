"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

/* ─── Source Class Types ─── */
export type SourceClass = "VERIFIED" | "LOCAL" | "CONFIG" | "INFERRED" | "ESTIMATED" | "SEEDED" | "UNKNOWN";

const SOURCE_CLASS_COLORS: Record<SourceClass, { bg: string; color: string; border: string }> = {
  VERIFIED:  { bg: "rgba(52,211,153,0.15)", color: "rgb(52,211,153)",        border: "rgba(52,211,153,0.25)" },
  LOCAL:     { bg: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.7)",   border: "rgba(52,211,153,0.18)" },
  CONFIG:    { bg: "rgba(96,165,250,0.10)", color: "rgba(96,165,250,0.7)",   border: "rgba(96,165,250,0.18)" },
  INFERRED:  { bg: "rgba(167,139,250,0.10)", color: "rgba(167,139,250,0.7)", border: "rgba(167,139,250,0.18)" },
  ESTIMATED: { bg: "rgba(251,191,36,0.10)", color: "rgba(251,191,36,0.55)",  border: "rgba(251,191,36,0.15)" },
  SEEDED:    { bg: "rgba(251,191,36,0.10)", color: "rgba(251,191,36,0.55)",  border: "rgba(251,191,36,0.15)" },
  UNKNOWN:   { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "rgba(255,255,255,0.08)" },
};

const NEEDS_ASTERISK = new Set<SourceClass>(["INFERRED", "ESTIMATED", "SEEDED", "UNKNOWN"]);

/* ─── Freshness type (matches data-contract) ─── */
export type Freshness = "fresh" | "stale" | "refreshing" | "failed";

/* ─── InspectableValue ─── */
export interface InspectableValueProps {
  value: string | number;
  sourceClass: SourceClass;
  source: string;
  method: string;
  lastUpdated?: string;
  limitations?: string;
  fetchedAt?: string;
  freshness?: Freshness;
  isFallback?: boolean;
  inline?: boolean;
  children?: React.ReactNode;
}

export function InspectableValue({
  value,
  sourceClass,
  source,
  method,
  lastUpdated,
  limitations,
  fetchedAt,
  freshness,
  isFallback,
  inline = true,
  children,
}: InspectableValueProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const showAsterisk = NEEDS_ASTERISK.has(sourceClass);

  return (
    <>
      <span
        ref={anchorRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          cursor: "pointer",
          display: inline ? "inline-flex" : "flex",
          alignItems: "baseline",
          gap: 0,
          position: "relative",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      >
        {children ?? <>{value}</>}
        {showAsterisk && (
          <span
            style={{
              color: "rgba(251,191,36,0.7)",
              fontSize: "0.65em",
              fontWeight: 700,
              lineHeight: 1,
              verticalAlign: "super",
              marginLeft: 1,
              userSelect: "none",
            }}
          >
            *
          </span>
        )}
      </span>
      {open && (
        <ProvenancePopover
          value={String(value)}
          sourceClass={sourceClass}
          source={source}
          method={method}
          lastUpdated={lastUpdated}
          limitations={limitations}
          fetchedAt={fetchedAt}
          freshness={freshness}
          isFallback={isFallback}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ─── ProvenancePopover ─── */
interface ProvenancePopoverProps {
  value: string;
  sourceClass: SourceClass;
  source: string;
  method: string;
  lastUpdated?: string;
  limitations?: string;
  fetchedAt?: string;
  freshness?: Freshness;
  isFallback?: boolean;
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  onClose: () => void;
}

const FRESHNESS_COLORS: Record<Freshness, string> = {
  fresh: "rgb(52,211,153)",
  stale: "rgba(251,191,36,0.9)",
  refreshing: "rgba(167,139,250,0.9)",
  failed: "rgba(248,113,113,0.9)",
};

function ProvenancePopover({
  value,
  sourceClass,
  source,
  method,
  lastUpdated,
  limitations,
  fetchedAt,
  freshness,
  isFallback,
  anchorRef,
  onClose,
}: ProvenancePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6 + window.scrollY,
        left: Math.max(8, rect.left + window.scrollX - 40),
      });
    }
  }, [anchorRef]);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const scStyle = SOURCE_CLASS_COLORS[sourceClass];

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        zIndex: 100,
        width: 300,
        padding: "14px 16px",
        borderRadius: 12,
        background: "#1A1A2E",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        animation: "provFadeIn 0.12s ease-out",
      }}
    >
      <style>{`@keyframes provFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Value */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
          Value
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "var(--font-mono)" }}>
          {value}
        </div>
      </div>

      {/* Source Class Badge */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
          Source Class
        </div>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: scStyle.bg,
            color: scStyle.color,
            border: `1px solid ${scStyle.border}`,
          }}
        >
          {sourceClass}
        </span>
      </div>

      {/* Source */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
          Source
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>{source}</div>
      </div>

      {/* Method */}
      <div style={{ marginBottom: lastUpdated || limitations ? 10 : 0 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
          Method
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>{method}</div>
      </div>

      {/* Fetched At */}
      {fetchedAt && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Fetched
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)" }}>{new Date(fetchedAt).toLocaleString()}</div>
        </div>
      )}

      {/* Freshness */}
      {freshness && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Freshness
          </div>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: FRESHNESS_COLORS[freshness],
            background: `${FRESHNESS_COLORS[freshness]}15`,
            border: `1px solid ${FRESHNESS_COLORS[freshness]}30`,
          }}>
            {freshness}
          </span>
        </div>
      )}

      {/* Data Source Type */}
      {isFallback !== undefined && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Source Type
          </div>
          <div style={{ fontSize: 11, color: isFallback ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.7)" }}>
            {isFallback ? "Snapshot fallback" : "Runtime API"}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div style={{ marginBottom: limitations ? 10 : 0 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Last Updated
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono)" }}>{lastUpdated}</div>
        </div>
      )}

      {/* Limitations */}
      {limitations && (
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Limitations
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>{limitations}</div>
        </div>
      )}
    </div>
  );
}

/* ─── AsteriskNote ─── */
export function AsteriskNote() {
  return (
    <div
      style={{
        marginTop: 24,
        padding: "10px 16px",
        borderRadius: 8,
        background: "rgba(251,191,36,0.03)",
        border: "1px solid rgba(251,191,36,0.06)",
      }}
    >
      <span style={{ fontSize: 10, color: "rgba(251,191,36,0.45)", lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700 }}>*</span> Values marked with an asterisk are not backed by a verified data source. Click any value to inspect its provenance.
      </span>
    </div>
  );
}
