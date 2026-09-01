"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  getPicklistOptions,
  type PicklistOption,
} from "@/lib/crm/picklists";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";

/* ────────────────────────────────────────────────────────────────────────
   CRMPicker — searchable dropdown replacing all raw <select> in CRM forms
   ──────────────────────────────────────────────────────────────────────── */

export interface CRMPickerProps<T> {
  options: T[];
  value: string | null;
  onChange: (value: string | null, option: T | null) => void;
  getKey: (option: T) => string;
  getLabel: (option: T) => string;
  getSecondaryLabel?: (option: T) => string;
  getGroupKey?: (option: T) => string;
  renderOption?: (option: T, isSelected: boolean) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  clearable?: boolean;
  creatable?: boolean;
  onCreateNew?: (searchText: string) => void;
  placeholder?: string;
  label?: string;
  size?: "sm" | "md";
  error?: string;
  disabled?: boolean;
  placement?: "auto" | "down" | "up";
}

const triggerBase: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--color-client-text)",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  fontFamily: "inherit",
};

const triggerSm: CSSProperties = { ...triggerBase, padding: "6px 10px", fontSize: 12 };

const dropdownStyle: CSSProperties = {
  background: "#0c0c12",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  maxHeight: 320,
  overflowY: "auto",
  overflowX: "hidden",
  zIndex: 9999,
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "rgba(255,255,255,0.04)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  border: "none",
  borderBottomStyle: "solid",
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.08)",
  color: "var(--color-client-text)",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

const optionBase: CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 36,
};

const groupHeaderStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "var(--color-client-text-dim)",
  background: "rgba(255,255,255,0.02)",
  fontWeight: 600,
  position: "sticky" as const,
  top: 0,
  zIndex: 1,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--color-client-text-dim)",
  display: "block",
  marginBottom: 4,
  fontWeight: 600,
};

export interface CRMFilterOption {
  value: string;
  label: string;
  secondaryLabel?: string;
}

export function CRMFilterDropdown({
  label,
  options,
  selectedValues,
  onChange,
  allLabel = "All",
  placeholder,
  minWidth = 160,
  searchable,
}: {
  label?: string;
  options: CRMFilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
  placeholder?: string;
  minWidth?: number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const isAll = selectedValues.length === 0 || selectedValues.length === options.length;
  const isSearchable = searchable ?? options.length > 6;

  const visibleOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...options]
      .filter((option) => {
        if (!q) return true;
        return `${option.label} ${option.secondaryLabel ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => sortDir === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label));
  }, [options, search, sortDir]);

  const summary = useMemo(() => {
    if (isAll) return allLabel;
    if (selectedValues.length === 1) {
      return options.find((option) => option.value === selectedValues[0])?.label ?? selectedValues[0];
    }
    return `${selectedValues.length} selected`;
  }, [allLabel, isAll, options, selectedValues]);

  const openDropdown = useCallback(() => {
    const nextRect = triggerRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
    setOpen(true);
    setSearch("");
  }, []);

  const closeDropdown = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeDropdown();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown();
    };
    const reposition = () => {
      const nextRect = triggerRef.current?.getBoundingClientRect();
      if (nextRect) setRect(nextRect);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [closeDropdown, open]);

  useEffect(() => {
    if (open && isSearchable) setTimeout(() => searchRef.current?.focus(), 0);
  }, [isSearchable, open]);

  const toggleValue = useCallback((value: string) => {
    const next = new Set(selectedValues.length === 0 ? options.map((option) => option.value) : selectedValues);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length || next.size === 0 ? [] : Array.from(next));
  }, [onChange, options, selectedValues]);

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const dropdownWidth = rect ? Math.min(Math.max(rect.width, 260), Math.max(260, viewportWidth - 24)) : 260;
  const dropdownLeft = rect ? Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - dropdownWidth - 12)) : 12;

  return (
    <div style={{ minWidth, flex: `1 1 ${minWidth}px` }}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        style={{
          ...triggerBase,
          minHeight: 40,
          padding: "9px 11px",
          borderColor: open ? "rgba(218,218,219,0.38)" : selectedValues.length ? "rgba(218,218,219,0.22)" : "rgba(255,255,255,0.08)",
          background: open ? "rgba(218,218,219,0.10)" : "rgba(255,255,255,0.04)",
          boxShadow: open ? "0 0 0 1px rgba(218,218,219,0.08), inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isAll ? "var(--color-client-text-dim)" : "var(--color-client-text)" }}>
          {summary || placeholder || allLabel}
        </span>
        <span style={{ fontSize: 10, color: open ? "#F4C7CA" : "var(--color-client-text-dim)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 140ms ease" }}>▾</span>
      </button>

      {open && typeof document !== "undefined" && rect && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label={label ?? placeholder ?? allLabel}
          style={{
            position: "fixed",
            top: rect.bottom + 6,
            left: dropdownLeft,
            width: dropdownWidth,
            zIndex: 9999,
            background: "rgba(12,12,18,0.98)",
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: 10,
            boxShadow: "0 18px 48px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
            backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <button type="button" onClick={() => setSortDir("asc")} style={{ ...filterMenuButtonStyle, background: sortDir === "asc" ? "rgba(218,218,219,0.14)" : "transparent", color: sortDir === "asc" ? "#F4C7CA" : "#CBD5E1" }}>A-Z</button>
            <button type="button" onClick={() => setSortDir("desc")} style={{ ...filterMenuButtonStyle, background: sortDir === "desc" ? "rgba(218,218,219,0.14)" : "transparent", color: sortDir === "desc" ? "#F4C7CA" : "#CBD5E1" }}>Z-A</button>
          </div>

          {isSearchable ? (
            <div style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                style={{ ...searchInputStyle, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 7, padding: "8px 10px" }}
              />
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <button type="button" onClick={() => onChange([])} style={{ background: "none", border: 0, padding: 0, color: "#dadadb", fontSize: 11, fontWeight: 750, cursor: "pointer" }}>Select all</button>
            <button type="button" onClick={() => onChange([])} style={{ background: "none", border: 0, padding: 0, color: "var(--color-client-text-dim)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Clear</button>
            <span style={{ marginLeft: "auto", fontSize: 10, color: selectedValues.length ? "#F4C7CA" : "var(--color-client-text-dim)", fontWeight: 700 }}>
              {isAll ? "All" : `${selectedValues.length}/${options.length}`}
            </span>
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto", padding: 6 }}>
            {visibleOptions.length === 0 ? (
              <div style={{ padding: "14px 10px", color: "var(--color-client-text-dim)", fontSize: 12, textAlign: "center" }}>No matches found</div>
            ) : visibleOptions.map((option) => {
              const checked = isAll || selectedSet.has(option.value);
              return (
                <label
                  key={option.value}
                  role="option"
                  aria-selected={checked}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    minHeight: 34,
                    padding: "7px 8px",
                    borderRadius: 7,
                    cursor: "pointer",
                    color: checked ? "var(--color-client-text)" : "var(--color-client-text-secondary)",
                    fontSize: 12,
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.055)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleValue(option.value)} style={{ accentColor: "#dadadb", width: 15, height: 15, cursor: "pointer" }} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.label}</span>
                  {option.secondaryLabel ? <span style={{ marginLeft: "auto", color: "var(--color-client-text-dim)", fontSize: 10 }}>{option.secondaryLabel}</span> : null}
                </label>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const filterMenuButtonStyle: CSSProperties = {
  minHeight: 30,
  borderRadius: 7,
  border: "1px solid rgba(148,163,184,0.12)",
  fontSize: 11,
  fontWeight: 750,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function CRMPicker<T>({
  options,
  value,
  onChange,
  getKey,
  getLabel,
  getSecondaryLabel,
  getGroupKey,
  renderOption,
  searchable,
  searchPlaceholder = "Search...",
  clearable = false,
  creatable = false,
  onCreateNew,
  placeholder = "Select...",
  label,
  size = "md",
  error,
  disabled = false,
  placement = "auto",
}: CRMPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isSearchable = searchable ?? options.length > 8;

  const selectedOption = useMemo(() => {
    if (value === null || value === undefined) return null;
    return options.find((opt) => getKey(opt) === value) ?? null;
  }, [options, value, getKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((opt) => {
      const primary = getLabel(opt).toLowerCase();
      const secondary = getSecondaryLabel?.(opt)?.toLowerCase() ?? "";
      return primary.includes(q) || secondary.includes(q);
    });
  }, [options, search, getLabel, getSecondaryLabel]);

  // Group items
  const grouped = useMemo(() => {
    if (!getGroupKey) return null;
    const groups: { key: string; items: T[] }[] = [];
    const map = new Map<string, T[]>();
    for (const opt of filtered) {
      const gk = getGroupKey(opt);
      if (!map.has(gk)) {
        map.set(gk, []);
        groups.push({ key: gk, items: map.get(gk)! });
      }
      map.get(gk)!.push(opt);
    }
    return groups;
  }, [filtered, getGroupKey]);

  const flatList = useMemo(() => {
    if (!grouped) return filtered;
    return grouped.flatMap((g) => g.items);
  }, [grouped, filtered]);

  // Exact match check for creatable
  const hasExactMatch = useMemo(() => {
    if (!search.trim()) return true;
    return filtered.some((opt) => getLabel(opt).toLowerCase() === search.trim().toLowerCase());
  }, [filtered, search, getLabel]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen(true);
    setSearch("");
    setHighlightIndex(-1);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch("");
    setHighlightIndex(-1);
  }, []);

  const selectOption = useCallback(
    (opt: T | null) => {
      if (opt) {
        onChange(getKey(opt), opt);
      } else {
        onChange(null, null);
      }
      closeDropdown();
    },
    [onChange, getKey, closeDropdown]
  );

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      closeDropdown();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // Auto-focus search
  useEffect(() => {
    if (open && isSearchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, isSearchable]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          openDropdown();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, flatList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < flatList.length) {
            selectOption(flatList[highlightIndex]);
          } else if (creatable && onCreateNew && search.trim() && !hasExactMatch) {
            onCreateNew(search.trim());
            closeDropdown();
          }
          break;
        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
      }
    },
    [open, openDropdown, highlightIndex, flatList, selectOption, creatable, onCreateNew, search, hasExactMatch, closeDropdown]
  );

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll("[data-picker-option]");
    items[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const tStyle = size === "sm" ? triggerSm : triggerBase;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const dropdownWidth = rect ? Math.min(Math.max(rect.width, 240), Math.max(240, viewportWidth - 24)) : 240;
  const dropdownLeft = rect ? Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - dropdownWidth - 12)) : 12;
  const dropdownMaxHeight = 320;
  const shouldOpenUp = rect ? placement === "up" || (placement === "auto" && viewportHeight - rect.bottom < dropdownMaxHeight + 18 && rect.top > viewportHeight - rect.bottom) : false;
  const dropdownTop = rect ? (shouldOpenUp ? undefined : rect.bottom + 4) : undefined;
  const dropdownBottom = rect && shouldOpenUp ? Math.max(12, viewportHeight - rect.top + 4) : undefined;

  return (
    <div style={{ position: "relative" }}>
      {label && <span style={labelStyle}>{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{
          ...tStyle,
          opacity: disabled ? 0.5 : 1,
          borderColor: error ? "#EF4444" : open ? "rgba(218,218,219,0.4)" : "rgba(255,255,255,0.08)",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selectedOption
              ? "var(--color-client-text)"
              : "var(--color-client-text-dim)",
            flex: 1,
          }}
        >
          {selectedOption ? getLabel(selectedOption) : placeholder}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            flexShrink: 0,
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {error && (
        <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>
          {error}
        </div>
      )}

      {open &&
        typeof document !== "undefined" &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              ...dropdownStyle,
              position: "fixed",
              top: dropdownTop,
              bottom: dropdownBottom,
              left: dropdownLeft,
              width: dropdownWidth,
              maxHeight: shouldOpenUp ? Math.min(dropdownMaxHeight, Math.max(180, rect.top - 18)) : dropdownMaxHeight,
            }}
            onKeyDown={handleKeyDown}
          >
            {isSearchable && (
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightIndex(0);
                }}
                placeholder={searchPlaceholder}
                style={searchInputStyle}
                onKeyDown={handleKeyDown}
              />
            )}

            {clearable && value !== null && (
              <div
                onClick={() => selectOption(null)}
                style={{
                  ...optionBase,
                  color: "var(--color-client-text-dim)",
                  fontStyle: "italic",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(218,218,219,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                Clear selection
              </div>
            )}

            {grouped
              ? grouped.map((group) => (
                  <div key={group.key}>
                    <div style={groupHeaderStyle}>{group.key}</div>
                    {group.items.map((opt) => {
                      const idx = flatList.indexOf(opt);
                      return (
                        <OptionRow
                          key={getKey(opt)}
                          option={opt}
                          isSelected={value === getKey(opt)}
                          isHighlighted={idx === highlightIndex}
                          getKey={getKey}
                          getLabel={getLabel}
                          getSecondaryLabel={getSecondaryLabel}
                          renderOption={renderOption}
                          onSelect={selectOption}
                          onHighlight={() => setHighlightIndex(idx)}
                        />
                      );
                    })}
                  </div>
                ))
              : filtered.map((opt, idx) => (
                  <OptionRow
                    key={getKey(opt)}
                    option={opt}
                    isSelected={value === getKey(opt)}
                    isHighlighted={idx === highlightIndex}
                    getKey={getKey}
                    getLabel={getLabel}
                    getSecondaryLabel={getSecondaryLabel}
                    renderOption={renderOption}
                    onSelect={selectOption}
                    onHighlight={() => setHighlightIndex(idx)}
                  />
                ))}

            {filtered.length === 0 && !creatable && (
              <div
                style={{
                  padding: "16px 12px",
                  fontSize: 13,
                  color: "var(--color-client-text-dim)",
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                No matches found
              </div>
            )}

            {creatable && onCreateNew && search.trim() && !hasExactMatch && (
              <div
                onClick={() => {
                  onCreateNew(search.trim());
                  closeDropdown();
                }}
                style={{
                  ...optionBase,
                  color: "#dadadb",
                  fontWeight: 600,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(218,218,219,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                + Create &ldquo;{search.trim()}&rdquo;
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/* ── OptionRow ────────────────────────────────────────────────── */

function OptionRow<T>({
  option,
  isSelected,
  isHighlighted,
  getKey,
  getLabel,
  getSecondaryLabel,
  renderOption,
  onSelect,
  onHighlight,
}: {
  option: T;
  isSelected: boolean;
  isHighlighted: boolean;
  getKey: (opt: T) => string;
  getLabel: (opt: T) => string;
  getSecondaryLabel?: (opt: T) => string;
  renderOption?: (opt: T, isSelected: boolean) => ReactNode;
  onSelect: (opt: T) => void;
  onHighlight: () => void;
}) {
  const secondary = getSecondaryLabel?.(option);
  return (
    <div
      data-picker-option
      onClick={() => onSelect(option)}
      onMouseEnter={onHighlight}
      style={{
        ...optionBase,
        background: isHighlighted
          ? "rgba(218,218,219,0.08)"
          : "transparent",
        color: isSelected ? "#dadadb" : "var(--color-client-text)",
        flexDirection: secondary ? "column" : "row",
        alignItems: secondary ? "flex-start" : "center",
      }}
    >
      {renderOption ? (
        renderOption(option, isSelected)
      ) : (
        <>
          <div className="flex items-center justify-between" style={{ width: "100%", gap: 8 }}>
            <span style={{ fontWeight: isSelected ? 600 : 400 }}>
              {getLabel(option)}
            </span>
            {isSelected && (
              <span style={{ fontSize: 14, color: "#dadadb", flexShrink: 0 }}>✓</span>
            )}
          </div>
          {secondary && (
            <span
              style={{
                fontSize: 11,
                color: "var(--color-client-text-dim)",
                marginTop: 1,
              }}
            >
              {secondary}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   EnumPicker — thin wrapper for picklist enums with color dots
   ──────────────────────────────────────────────────────────────────────── */

export function EnumPicker({
  picklistKey,
  value,
  onChange,
  label,
  placeholder,
  clearable,
  size,
  error,
  disabled,
}: {
  picklistKey: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  size?: "sm" | "md";
  error?: string;
  disabled?: boolean;
}) {
  const options = useMemo(() => getPicklistOptions(picklistKey), [picklistKey]);

  return (
    <CRMPicker<PicklistOption>
      options={options}
      value={value}
      onChange={(v) => onChange(v)}
      getKey={(opt) => opt.value}
      getLabel={(opt) => opt.label}
      renderOption={(opt, isSelected) => (
        <div className="flex items-center justify-between" style={{ width: "100%", gap: 8 }}>
          <div className="flex items-center gap-2">
            {opt.color && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: opt.color,
                  flexShrink: 0,
                }}
              />
            )}
            <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? "#dadadb" : "var(--color-client-text)" }}>
              {opt.label}
            </span>
          </div>
          {isSelected && (
            <span style={{ fontSize: 14, color: "#dadadb", flexShrink: 0 }}>✓</span>
          )}
        </div>
      )}
      label={label}
      placeholder={placeholder}
      clearable={clearable}
      size={size}
      error={error}
      disabled={disabled}
      searchable={false}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
   AccountPicker — fetches accounts, groups by type
   ──────────────────────────────────────────────────────────────────────── */

export function AccountPicker({
  value,
  onChange,
  options,
  creatable,
  onCreateNew,
  label = "Account",
  placeholder = "Search accounts...",
  error,
  disabled,
  size,
}: {
  value: string | null;
  onChange: (value: string | null, account: Account | null) => void;
  options?: Account[];
  creatable?: boolean;
  onCreateNew?: (name: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (options) {
      setAccounts(options);
      return;
    }
    let cancelled = false;
    fetch("/api/crm/accounts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Account[]) => {
        if (!cancelled) setAccounts(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [options]);

  return (
    <CRMPicker<Account>
      options={accounts}
      value={value}
      onChange={onChange}
      getKey={(a) => a.id}
      getLabel={(a) => a.name}
      getSecondaryLabel={(a) =>
        [a.type, a.operatingMarket].filter(Boolean).join(" · ")
      }
      getGroupKey={(a) => a.type}
      searchPlaceholder={placeholder}
      creatable={creatable}
      onCreateNew={onCreateNew}
      label={label}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      size={size}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
   ContactPicker — fetches contacts, filters by accountId
   ──────────────────────────────────────────────────────────────────────── */

export function ContactPicker({
  value,
  onChange,
  options,
  accountId,
  label = "Contact",
  placeholder = "Search contacts...",
  error,
  disabled,
  size,
}: {
  value: string | null;
  onChange: (value: string | null, contact: Contact | null) => void;
  options?: Contact[];
  accountId?: string | null;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (options) {
      setAllContacts(options);
      return;
    }
    let cancelled = false;
    fetch("/api/crm/contacts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Contact[]) => {
        if (!cancelled) setAllContacts(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [options]);

  const filteredContacts = useMemo(() => {
    if (!accountId) return allContacts;
    return allContacts.filter((c) => c.accountId === accountId);
  }, [allContacts, accountId]);

  return (
    <CRMPicker<Contact>
      options={filteredContacts}
      value={value}
      onChange={onChange}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getSecondaryLabel={(c) => c.emails?.[0] || c.company || ""}
      searchPlaceholder={placeholder}
      label={label}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      size={size}
    />
  );
}
