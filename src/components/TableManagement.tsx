"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface TableColumn {
  key: string;
  label: string;
}

interface TableManagementProps {
  columns: TableColumn[];
  onReorder: (newColumns: TableColumn[]) => void;
  onReset?: () => void;
}

export function TableManagement({ columns, onReorder, onReset }: TableManagementProps) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const openDropdown = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const reposition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    const newOrder = [...columns];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    onReorder(newOrder);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const sortAZ = () => {
    const sorted = [...columns].sort((a, b) => a.label.localeCompare(b.label));
    onReorder(sorted);
  };

  const sortZA = () => {
    const sorted = [...columns].sort((a, b) => b.label.localeCompare(a.label));
    onReorder(sorted);
  };

  const dropdown = open && dropdownPos && createPortal(
    <div
      ref={dropRef}
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        zIndex: 9999,
        minWidth: 240,
        maxWidth: 320,
        background: "rgba(16,16,22,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.3)",
        overflow: "hidden",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Table Management
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={sortAZ} style={quickBtnStyle}>
          <span style={{ fontSize: 11 }}>↑</span> Columns A→Z
        </button>
        <button onClick={sortZA} style={quickBtnStyle}>
          <span style={{ fontSize: 11 }}>↓</span> Columns Z→A
        </button>
        {onReset && (
          <button onClick={() => { onReset(); }} style={{ ...quickBtnStyle, color: "rgba(251,191,36,0.7)" }}>
            ↻ Reset
          </button>
        )}
      </div>

      {/* Drag reorder list */}
      <div style={{ padding: "6px 6px 2px" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", padding: "2px 8px 6px", fontStyle: "italic" }}>
          Drag to reorder columns
        </div>
      </div>
      <div style={{ maxHeight: 350, overflowY: "auto", padding: "0 6px 8px" }}>
        {columns.map((col, i) => (
          <div
            key={col.key}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "grab",
              fontSize: 12,
              color: "#e2e8f0",
              background: dragOverIdx === i ? "rgba(96,165,250,0.1)" : dragIdx === i ? "rgba(255,255,255,0.06)" : "transparent",
              borderTop: dragOverIdx === i && dragIdx !== null && dragIdx > i ? "2px solid rgba(96,165,250,0.4)" : "2px solid transparent",
              borderBottom: dragOverIdx === i && dragIdx !== null && dragIdx < i ? "2px solid rgba(96,165,250,0.4)" : "2px solid transparent",
              transition: "background 0.1s",
              opacity: dragIdx === i ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", cursor: "grab", userSelect: "none" }}>☰</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.label}</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", minWidth: 14, textAlign: "right" }}>{i + 1}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 12px",
          borderRadius: 7,
          background: open ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
          border: open ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.08)",
          color: open ? "#93c5fd" : "rgba(255,255,255,0.5)",
          fontSize: 11,
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12 }}>☰</span>
        Table
      </button>
      {dropdown}
    </>
  );
}

const quickBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 10px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.6)",
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 500,
};
