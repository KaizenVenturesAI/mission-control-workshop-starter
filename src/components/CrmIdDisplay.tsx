"use client";

import { useState, useCallback } from "react";
import { toDisplayId, type CRMEntityType } from "@/lib/crm/displayId";

// Salesforce-style ID display. Two render modes:
//  - <CrmIdCell>   : compact, monospace 11px, dim. For left-most table column.
//  - <CrmIdHeader> : drawer header chip, monospace, dim, with copy icon.
// Both copy the display id to clipboard on click and show a 1s "Copied!" toast.

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve();
}

export function CrmIdCell({
  rawId,
  entityType,
}: {
  rawId: string;
  entityType: CRMEntityType;
}) {
  const display = toDisplayId(rawId, entityType);
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      copyToClipboard(display).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1000);
      });
    },
    [display],
  );
  return (
    <span
      onClick={onClick}
      title={`Copy ${display}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 64,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consclients, monospace',
        fontSize: 11,
        color: copied ? "#34D399" : "rgba(255,255,255,0.4)",
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.15s",
      }}
    >
      {copied ? "Copied!" : display}
    </span>
  );
}

export function CrmIdHeader({
  rawId,
  entityType,
}: {
  rawId: string;
  entityType: CRMEntityType;
}) {
  const display = toDisplayId(rawId, entityType);
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      copyToClipboard(display).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1000);
      });
    },
    [display],
  );
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Copy ${display}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        padding: "2px 8px",
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consclients, monospace',
        fontSize: 11,
        color: copied ? "#34D399" : "rgba(255,255,255,0.45)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!copied) e.currentTarget.style.color = "rgba(255,255,255,0.7)";
      }}
      onMouseLeave={(e) => {
        if (!copied) e.currentTarget.style.color = "rgba(255,255,255,0.45)";
      }}
    >
      <span>{copied ? "Copied!" : display}</span>
      {!copied && (
        <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>
          ⧉
        </span>
      )}
    </button>
  );
}
