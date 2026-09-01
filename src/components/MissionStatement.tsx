"use client";

import { useState, useEffect } from "react";

const DEFAULT_MISSION = "Build Example Client into the premier agentic systems lifestyle brand through technology-driven operations, strategic partnerships, and world-class community experiences.";
const STORAGE_KEY = "client-mc-mission";

export function MissionStatement() {
  const [text, setText] = useState(DEFAULT_MISSION);
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setText(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(STORAGE_KEY, text);
  }, [text, mounted]);

  if (!mounted) return null;

  return (
    <div
      className="rounded-2xl"
      style={{
        padding: "24px 28px",
        background: "linear-gradient(135deg, rgba(232,67,147,0.04), rgba(96,165,250,0.04) 50%, rgba(52,211,153,0.04))",
        border: "1px solid rgba(96,165,250,0.12)",
        marginBottom: 24,
        position: "relative",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Mission Statement
        </span>
        <button
          onClick={() => setEditing(!editing)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--color-client-text-dim)",
            cursor: "pointer",
          }}
        >
          {editing ? "Done" : "✎ Edit"}
        </button>
      </div>
      {editing ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--color-client-border)",
            color: "var(--color-client-text)",
            fontSize: 15,
            lineHeight: 1.7,
            fontFamily: "inherit",
            outline: "none",
            resize: "vertical",
          }}
        />
      ) : (
        <p style={{ fontSize: 15, color: "var(--color-client-text)", lineHeight: 1.7, fontWeight: 400, letterSpacing: "-0.01em" }}>
          {text}
        </p>
      )}
    </div>
  );
}
