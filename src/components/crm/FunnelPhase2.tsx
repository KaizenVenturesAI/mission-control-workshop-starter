"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CRM_INTEREST_CATEGORIES } from "@/lib/crm/interests";
import { CRM_OWNER_PROFILES, CRM_OWNERS, isCRMOwner, type CRMOwner } from "@/lib/crm/owners";
import { CRMPicker } from "@/components/CRMPicker";

export function LensToggleRow({
  object,
  lenses,
}: {
  object: "leads" | "contacts" | "accounts" | "opportunities";
  lenses: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("lens") || "all";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 14px", padding: "8px 10px", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 8, background: "rgba(255,255,255,0.025)" }}>
      <span style={{ fontSize: 10, fontWeight: 750, letterSpacing: 0, textTransform: "uppercase", color: "var(--color-client-text-dim)", paddingRight: 2 }}>
        List views
      </span>
      {lenses.map((lens) => {
        const isActive = active === lens.key;
        return (
          <button
            key={lens.key}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              if (object !== "contacts") next.set("object", object); else next.delete("object");
              if (lens.key === "all") next.delete("lens"); else next.set("lens", lens.key);
              router.replace(`/contacts${next.toString() ? `?${next.toString()}` : ""}`);
            }}
            style={{
              minHeight: 28,
              padding: "0 10px",
              borderRadius: 6,
              border: isActive ? "1px solid rgba(218,218,219,0.28)" : "1px solid rgba(255,255,255,0.06)",
              background: isActive ? "rgba(218,218,219,0.12)" : "rgba(255,255,255,0.03)",
              color: isActive ? "#C4C9D1" : "var(--color-client-text-secondary)",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {lens.label}
          </button>
        );
      })}
    </div>
  );
}

export function BulkActionBar({
  count,
  children,
  onClear,
  result,
}: {
  count: number;
  children: React.ReactNode;
  onClear: () => void;
  result?: string | null;
}) {
  if (count < 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, background: "rgba(12,12,18,0.96)", border: "1px solid rgba(218,218,219,0.22)", boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{count} selected</span>
      {children}
      {result ? <span style={{ fontSize: 12, color: "#dadadb" }}>{result}</span> : null}
      <button type="button" onClick={onClear} style={bulkButtonStyle}>Clear</button>
    </div>
  );
}

export const bulkButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--color-client-text-secondary)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export function SelectCell({ checked, onChange, label = "Select row" }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <input
      aria-label={label}
      type="checkbox"
      checked={checked}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
      style={{ accentColor: "#dadadb", cursor: "pointer" }}
    />
  );
}

export function SelectAllBox({ checked, indeterminate, onChange, label = "Select all" }: { checked: boolean; indeterminate: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <input
      aria-label={label}
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate; }}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
      style={{ accentColor: "#dadadb", cursor: "pointer" }}
    />
  );
}

export function InterestChipPicker({
  selected,
  onToggle,
  hiddenCategories = [],
}: {
  selected: string[];
  onToggle: (tag: string) => void;
  hiddenCategories?: string[];
}) {
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const visibleCategories = React.useMemo(
    () => CRM_INTEREST_CATEGORIES.filter((group) => !hiddenCategories.includes(group.category)),
    [hiddenCategories]
  );

  React.useEffect(() => {
    if (!openCategory) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      setOpenCategory(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCategory(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openCategory]);

  return (
    <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
      {visibleCategories.map((group) => {
        const activeTags = group.tags.filter((tag) => selectedSet.has(tag));
        const isOpen = openCategory === group.category;
        return (
          <div key={group.category} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenCategory((current) => current === group.category ? null : group.category)}
              style={{
                width: "100%",
                minHeight: 42,
                padding: "8px 10px",
                borderRadius: 9,
                border: isOpen ? "1px solid rgba(218,218,219,0.42)" : "1px solid rgba(148,163,184,0.16)",
                background: isOpen ? "rgba(218,218,219,0.12)" : "rgba(15,23,42,0.70)",
                color: "#F8FAFC",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                textAlign: "left",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94A3B8", fontWeight: 750 }}>{group.category}</span>
                <span style={{ display: "block", marginTop: 3, fontSize: 12, color: activeTags.length ? "#E2E8F0" : "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeTags.length ? activeTags.join(", ") : "Select..."}
                </span>
              </span>
              <span style={{ fontSize: 10, color: "#94A3B8", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 140ms ease" }}>▾</span>
            </button>
            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 220,
                  width: "min(340px, 92vw)",
                  padding: 8,
                  borderRadius: 10,
                  background: "#0c0c12",
                  border: "1px solid rgba(148,163,184,0.18)",
                  boxShadow: "0 18px 42px rgba(0,0,0,0.50)",
                }}
              >
                {group.tags.map((tag) => {
              const active = selectedSet.has(tag);
              return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggle(tag)}
                      style={{
                        width: "100%",
                        minHeight: 34,
                        padding: "7px 8px",
                        borderRadius: 7,
                        border: "none",
                        background: active ? "rgba(218,218,219,0.14)" : "transparent",
                        color: active ? "#F4C7CA" : "var(--color-client-text-secondary)",
                        fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        textAlign: "left",
                      }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = active ? "rgba(218,218,219,0.18)" : "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = active ? "rgba(218,218,219,0.14)" : "transparent"; }}
                    >
                      <span>{tag}</span>
                      {active ? <span style={{ color: "#dadadb" }}>✓</span> : null}
                </button>
              );
            })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BulkInterestPrompt({ onPick }: { onPick: (tag: string) => void }) {
  const options = React.useMemo(() => CRM_INTEREST_CATEGORIES.flatMap((group) => group.tags.map((tag) => ({ tag, category: group.category }))), []);
  return (
    <div style={{ width: 190 }}>
      <CRMPicker
        options={options}
        value={null}
        onChange={(value) => { if (value) onPick(value); }}
        getKey={(option) => option.tag}
        getLabel={(option) => option.tag}
        getGroupKey={(option) => option.category}
        placeholder="Add Interest..."
        size="sm"
        searchable={false}
      />
    </div>
  );
}

function ownerAvatarStyle(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: 999,
    overflow: "hidden",
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
  };
}

export function OwnerAvatar({ owner, size = 24 }: { owner?: string; size?: number }) {
  if (!isCRMOwner(owner)) {
    return (
      <span style={{ ...ownerAvatarStyle(size), display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--color-client-text-dim)", fontSize: Math.max(10, Math.round(size * 0.42)), fontWeight: 800 }}>
        —
      </span>
    );
  }
  const profile = CRM_OWNER_PROFILES[owner];
  return (
    <span style={ownerAvatarStyle(size)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={profile.imageSrc} alt={profile.fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </span>
  );
}

export function OwnerBadge({ owner, compact = false }: { owner?: string; compact?: boolean }) {
  const validOwner = isCRMOwner(owner) ? owner : undefined;
  const label = validOwner ? CRM_OWNER_PROFILES[validOwner].firstName : "Missing";
  return (
    <span
      title={validOwner ? CRM_OWNER_PROFILES[validOwner].fullName : "Missing owner"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        minWidth: 0,
        padding: compact ? "2px 8px 2px 2px" : "3px 10px 3px 3px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,0.18)",
        background: validOwner ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.025)",
        color: validOwner ? "var(--color-client-text)" : "var(--color-client-text-dim)",
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <OwnerAvatar owner={validOwner} size={compact ? 22 : 26} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </span>
  );
}

function OwnerOptionRow({ owner, selected }: { owner: CRMOwner; selected: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
      <OwnerBadge owner={owner} compact />
      {selected ? <span style={{ color: "#dadadb", fontSize: 11, fontWeight: 900 }}>✓</span> : null}
    </span>
  );
}

export function OwnerSelect({ value, onChange, compact = false, chromeless = false }: { value?: string; onChange: (owner: string) => void; compact?: boolean; chromeless?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const currentOwner = isCRMOwner(value) ? value : undefined;

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    const reposition = () => setRect(wrapRef.current?.getBoundingClientRect() ?? null);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const openMenu = React.useCallback(() => {
    setRect(wrapRef.current?.getBoundingClientRect() ?? null);
    setOpen((prev) => !prev);
  }, []);

  const menuWidth = rect ? Math.max(rect.width, 188) : 188;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const shouldOpenUp = rect ? viewportHeight - rect.bottom < 190 && rect.top > viewportHeight - rect.bottom : false;
  const menuLeft = rect ? Math.min(Math.max(12, rect.left), Math.max(12, (typeof window !== "undefined" ? window.innerWidth : 1024) - menuWidth - 12)) : 12;

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: compact ? 132 : 168 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openMenu}
        style={{
          width: chromeless ? "auto" : "100%",
          minHeight: chromeless ? undefined : (compact ? 34 : 40),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: chromeless ? 0 : (compact ? "5px 8px" : "7px 10px"),
          borderRadius: 8,
          background: chromeless ? "transparent" : (open ? "rgba(218,218,219,0.10)" : "rgba(255,255,255,0.04)"),
          border: chromeless ? "1px solid transparent" : (open ? "1px solid rgba(218,218,219,0.32)" : "1px solid rgba(255,255,255,0.08)"),
          color: "var(--color-client-text)",
          cursor: "pointer",
          fontFamily: "inherit",
          outlineOffset: 2,
        }}
      >
        <OwnerBadge owner={currentOwner} compact={compact} />
        {!chromeless ? <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 140ms ease" }}>▾</span> : null}
      </button>
      {open && rect && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Owner"
          style={{
            position: "fixed",
            top: shouldOpenUp ? undefined : rect.bottom + 6,
            bottom: shouldOpenUp ? Math.max(12, viewportHeight - rect.top + 6) : undefined,
            left: menuLeft,
            width: menuWidth,
            zIndex: 9999,
            padding: 5,
            borderRadius: 10,
            background: "#0c0c12",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
          }}
        >
          {CRM_OWNERS.map((owner) => (
            <button
              key={owner}
              type="button"
              role="option"
              aria-selected={owner === currentOwner}
              onClick={() => {
                setOpen(false);
                onChange(owner);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                padding: 6,
                border: "none",
                borderRadius: 8,
                background: owner === currentOwner ? "rgba(218,218,219,0.12)" : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.065)"; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = owner === currentOwner ? "rgba(218,218,219,0.12)" : "transparent"; }}
            >
              <OwnerOptionRow owner={owner} selected={owner === currentOwner} />
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export function BulkPicklistPrompt({
  label,
  options,
  onPick,
}: {
  label: string;
  options: Array<{ value: string; label?: string; group?: string }>;
  onPick: (value: string) => void;
}) {
  return (
    <div style={{ width: 190 }}>
      <CRMPicker
        options={options}
        value={null}
        onChange={(value) => { if (value) onPick(value); }}
        getKey={(option) => option.value}
        getLabel={(option) => option.label ?? option.value}
        getGroupKey={(option) => option.group ?? "Actions"}
        placeholder={label}
        size="sm"
        searchable={options.length > 8}
        placement="up"
      />
    </div>
  );
}

export function BulkOwnerPrompt({ onPick }: { onPick: (owner: string) => void }) {
  const options = React.useMemo(() => CRM_OWNERS.map((owner) => ({ value: owner, label: owner })), []);
  return (
    <div style={{ width: 190 }}>
      <CRMPicker
        options={options}
        value={null}
        onChange={(value) => { if (value) onPick(value); }}
        getKey={(option) => option.value}
        getLabel={(option) => option.label}
        renderOption={(option, selected) => <OwnerOptionRow owner={option.value} selected={selected} />}
        placeholder="Reassign Owner..."
        size="sm"
        searchable={false}
        placement="up"
      />
    </div>
  );
}

export function LineageChips({ chips, trailing }: { chips: Array<{ label: string; href?: string; active?: boolean }>; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", margin: "0 0 14px" }}>
      {chips.map((chip, index) => (
        <React.Fragment key={`${chip.label}-${index}`}>
          {index > 0 ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: "monospace" }}>→</span> : null}
          <a
            href={chip.href || "#"}
            onClick={(event) => { if (!chip.href) event.preventDefault(); }}
            style={{
              padding: "3px 7px",
              borderRadius: 5,
              background: chip.active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: chip.active ? "#fff" : "var(--color-client-text-dim)",
              fontFamily: "monospace",
              fontSize: 11,
              textDecoration: "none",
              cursor: chip.href ? "pointer" : "default",
            }}
          >
            {chip.label}
          </a>
        </React.Fragment>
      ))}
      {trailing}
    </div>
  );
}
