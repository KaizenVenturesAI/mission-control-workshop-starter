"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

interface ColumnFilterDropdownProps {
  colKey: string;
  label: string;
  allValues: string[];
  activeFilter: Set<string> | undefined;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string, dir?: "asc" | "desc") => void;
  onFilter: (colKey: string, values: Set<string> | null) => void;
  dragProps?: Record<string, any>;
}

export function ColumnFilterDropdown({
  colKey,
  label,
  allValues,
  activeFilter,
  sortKey,
  sortDir,
  onSort,
  onFilter,
  dragProps = {},
}: ColumnFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isSorted = sortKey === colKey;
  const isFiltered = !!activeFilter && activeFilter.size > 0;

  // Position dropdown right below the header when opening
  const openDropdown = useCallback(() => {
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left });
    }
    setSearch("");
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        headerRef.current && !headerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
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

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open || !headerRef.current) return;
    const reposition = () => {
      if (headerRef.current) {
        const rect = headerRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 2, left: rect.left });
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const sortedValues = useMemo(() => [...allValues].filter((v): v is string => typeof v === "string").sort((a, b) => a.localeCompare(b)), [allValues]);
  const filteredValues = useMemo(
    () => (search ? sortedValues.filter((v) => v.toLowerCase().includes(search.toLowerCase())) : sortedValues),
    [sortedValues, search]
  );

  const selectedValues = activeFilter ?? new Set(allValues);

  const toggleValue = (val: string) => {
    const next = new Set(selectedValues);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    if (next.size === allValues.length || next.size === 0) onFilter(colKey, null);
    else onFilter(colKey, next);
  };

  const selectAll = () => onFilter(colKey, null);
  const clearFilter = () => onFilter(colKey, null);

  const dropdown = open && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        zIndex: 9999,
        minWidth: 220,
        maxWidth: 300,
        background: "rgba(16,16,22,0.98)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.3)",
        overflow: "hidden",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Sort options */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => { onSort(colKey, "asc"); setOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px",
            background: isSorted && sortDir === "asc" ? "rgba(96,165,250,0.1)" : "transparent",
            border: "none", borderRadius: 6, cursor: "pointer", color: "#e2e8f0", fontSize: 12, textAlign: "left",
          }}
          onMouseEnter={(e) => { if (!(isSorted && sortDir === "asc")) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { if (!(isSorted && sortDir === "asc")) e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: 12 }}>↑</span> Sort A → Z
        </button>
        <button
          onClick={() => { onSort(colKey, "desc"); setOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px",
            background: isSorted && sortDir === "desc" ? "rgba(96,165,250,0.1)" : "transparent",
            border: "none", borderRadius: 6, cursor: "pointer", color: "#e2e8f0", fontSize: 12, textAlign: "left", marginTop: 2,
          }}
          onMouseEnter={(e) => { if (!(isSorted && sortDir === "desc")) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { if (!(isSorted && sortDir === "desc")) e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{ fontSize: 12 }}>↓</span> Sort Z → A
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          autoFocus
          style={{
            width: "100%", padding: "7px 10px", fontSize: 12, boxSizing: "border-box",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, color: "#e2e8f0", outline: "none",
          }}
        />
      </div>

      {/* Select All / None */}
      <div style={{ padding: "6px 12px", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <button onClick={selectAll} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>
          Select All
        </button>
        <button onClick={clearFilter} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>
          Clear filter
        </button>
        {isFiltered && (
          <span style={{ fontSize: 10, color: "#4ade80", marginLeft: "auto" }}>
            {selectedValues.size}/{allValues.length}
          </span>
        )}
      </div>

      {/* Checkbox list */}
      <div style={{ maxHeight: 240, overflowY: "auto", padding: "4px 6px" }}>
        {filteredValues.length === 0 && (
          <div style={{ padding: "12px 10px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>No matches</div>
        )}
        {filteredValues.map((val) => (
          <label
            key={val}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
              borderRadius: 5, cursor: "pointer", fontSize: 12,
              color: selectedValues.has(val) ? "#e2e8f0" : "rgba(255,255,255,0.35)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <input
              type="checkbox"
              checked={selectedValues.has(val)}
              onChange={() => toggleValue(val)}
              style={{ accentColor: "#4ade80", width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {val || "—"}
            </span>
          </label>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={headerRef} {...dragProps} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
          padding: "12px 14px",
          whiteSpace: "nowrap",
        }}
      >
        {/* Label — click to sort */}
        <span
          onClick={(e) => { e.stopPropagation(); onSort(colKey); }}
          style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600,
            color: isSorted ? "#93c5fd" : "rgba(255,255,255,0.44)",
          }}
        >
          {label}
        </span>

        {/* Sort indicator — click to sort */}
        <span
          onClick={(e) => { e.stopPropagation(); onSort(colKey); }}
          style={{ fontSize: 11, opacity: isSorted ? 1 : 0.4, color: isSorted ? "#93c5fd" : "rgba(255,255,255,0.44)", cursor: "pointer" }}
        >
          {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "▽"}
        </span>

        {/* Filter button — large click target */}
        <button
          onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else openDropdown(); }}
          style={{
            background: isFiltered ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
            border: isFiltered ? "1px solid rgba(74,222,128,0.2)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: "3px 6px",
            cursor: "pointer",
            fontSize: 10,
            color: isFiltered ? "#4ade80" : "rgba(255,255,255,0.35)",
            marginLeft: 4,
            lineHeight: 1,
            transition: "all 0.15s",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            minHeight: 18,
          }}
          title={`Filter ${label}`}
          onMouseEnter={(e) => { e.currentTarget.style.color = isFiltered ? "#4ade80" : "rgba(255,255,255,0.6)"; e.currentTarget.style.background = isFiltered ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = isFiltered ? "#4ade80" : "rgba(255,255,255,0.35)"; e.currentTarget.style.background = isFiltered ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)"; }}
        >
          {isFiltered ? activeFilter?.size : "▾"}
        </button>
      </div>

      {dropdown}
    </div>
  );
}
