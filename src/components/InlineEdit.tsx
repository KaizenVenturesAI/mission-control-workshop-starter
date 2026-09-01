"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { EnumPicker } from "@/components/CRMPicker";
import { getPicklistColor, getPicklistLabel } from "@/lib/crm/picklists";

/* ────────────────────────────────────────────────────────────────────────
   Tiny spinner for saving state
   ──────────────────────────────────────────────────────────────────────── */

function MiniSpinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid rgba(96,165,250,0.25)",
        borderTopColor: "#60A5FA",
        borderRadius: "50%",
        animation: "inline-edit-spin 0.6s linear infinite",
        flexShrink: 0,
      }}
    >
      <style>{`@keyframes inline-edit-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   InlineEditText — click-to-edit text field
   ──────────────────────────────────────────────────────────────────────── */

const displayStyle: CSSProperties = {
  cursor: "pointer",
  borderRadius: 6,
  padding: "2px 6px",
  margin: "-2px -6px",
  transition: "background 0.15s",
};

const pencilStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0,
  transition: "opacity 0.15s",
  color: "var(--color-client-text-dim)",
  flexShrink: 0,
  marginLeft: 6,
};

export function InlineEditText({
  value,
  onSave,
  placeholder = "—",
  fontSize = 13,
  color = "var(--color-client-text)",
  multiline = false,
  label,
}: {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  fontSize?: number;
  color?: string;
  multiline?: boolean;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        save();
      }
      // For multiline, Cmd/Ctrl+Enter saves
      if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    },
    [cancel, save, multiline]
  );

  const inputStyles: CSSProperties = {
    width: "100%",
    padding: "4px 8px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(96,165,250,0.3)",
    outline: "none",
    color,
    fontSize,
    fontFamily: "inherit",
    lineHeight: 1.5,
  };

  if (editing) {
    return (
      <div>
        {label && (
          <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>
            {label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={handleKeyDown}
              rows={3}
              style={{ ...inputStyles, resize: "vertical" }}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={handleKeyDown}
              style={inputStyles}
            />
          )}
          {saving && <MiniSpinner />}
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>
          {label}
        </span>
      )}
      <div
        className="inline-edit-display flex items-center"
        style={displayStyle}
        onClick={() => !saving && setEditing(true)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          const pencil = e.currentTarget.querySelector<HTMLElement>(".inline-edit-pencil");
          if (pencil) pencil.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          const pencil = e.currentTarget.querySelector<HTMLElement>(".inline-edit-pencil");
          if (pencil) pencil.style.opacity = "0";
        }}
      >
        <span style={{ fontSize, color: value ? color : "var(--color-client-text-dim)", lineHeight: 1.5 }}>
          {value || placeholder}
        </span>
        {saving ? (
          <span style={{ marginLeft: 6 }}><MiniSpinner /></span>
        ) : (
          <span className="inline-edit-pencil" style={pencilStyle}>✎</span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   InlineEditEnum — click pill to open picker, saves on select
   ──────────────────────────────────────────────────────────────────────── */

export function InlineEditEnum({
  picklistKey,
  value,
  onSave,
  label,
}: {
  picklistKey: string;
  value: string;
  onSave: (newValue: string) => Promise<void>;
  label?: string;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (newValue: string | null) => {
      const next = newValue ?? "";
      if (next === value) return;
      setSaving(true);
      try {
        await onSave(next);
      } finally {
        setSaving(false);
      }
    },
    [value, onSave]
  );

  return (
    <div>
      {label && (
        <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <EnumPicker
          picklistKey={picklistKey}
          value={value || null}
          onChange={handleChange}
          size="sm"
          disabled={saving}
        />
        {saving && <MiniSpinner />}
      </div>
    </div>
  );
}
