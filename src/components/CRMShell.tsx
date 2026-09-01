"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useResponsive } from "@/lib/useMediaQuery";

export type CRMObject =
  | "leads"
  | "contacts"
  | "accounts"
  | "opportunities"
  | "bd"
  | "queue"
  | "health"
  | "reporting"
  | "duplicates"
  | "audit";

const TAB_LABELS: Record<CRMObject, string> = {
  leads: "Leads",
  contacts: "Contacts",
  accounts: "Accounts",
  opportunities: "Opportunities",
  bd: "BD Intake",
  queue: "Action Queue",
  health: "Health",
  reporting: "Reporting",
  duplicates: "Duplicates",
  audit: "Audit Log",
};

const CRM_RED = "#dadadb";
const CRM_RED_SOFT = "rgba(218,218,219,0.16)";
const CRM_RED_BORDER = "rgba(218,218,219,0.36)";
const CRM_SILVER = "#C4C9D1";
const CRM_SILVER_SOFT = "rgba(196,201,209,0.10)";
const CRM_SILVER_BORDER = "rgba(196,201,209,0.18)";

const OBJECT_META: Record<CRMObject, { icon: string; eyebrow: string; title: string; description: string; tone: string }> = {
  leads: {
    icon: "L",
    eyebrow: "CRM object",
    title: "Leads",
    description: "Inbound demand, routing, qualification, and conversion work.",
    tone: CRM_RED,
  },
  contacts: {
    icon: "C",
    eyebrow: "CRM object",
    title: "Contacts",
    description: "People, relationship health, activity history, and next action.",
    tone: CRM_RED,
  },
  accounts: {
    icon: "A",
    eyebrow: "CRM object",
    title: "Accounts",
    description: "Companies, venues, partners, person accounts, and linked contacts.",
    tone: CRM_RED,
  },
  opportunities: {
    icon: "O",
    eyebrow: "CRM object",
    title: "Opportunities",
    description: "Pipeline, stage movement, next steps, and revenue follow-through.",
    tone: CRM_RED,
  },
  bd: {
    icon: "B",
    eyebrow: "CRM workflow",
    title: "BD Intake",
    description: "Slack-to-CRM follow-up workflow for Example Client Mission Agent, Chief of Staff to Alex.",
    tone: CRM_RED,
  },
  queue: {
    icon: "Q",
    eyebrow: "CRM workbench",
    title: "Action Queue",
    description: "Prioritized work across stale leads, overdue opportunities, and follow-ups.",
    tone: CRM_RED,
  },
  health: {
    icon: "H",
    eyebrow: "CRM workbench",
    title: "Health",
    description: "Data quality, ownership, backend status, and operational risk.",
    tone: CRM_SILVER,
  },
  reporting: {
    icon: "R",
    eyebrow: "CRM workbench",
    title: "Reporting",
    description: "Object-level reporting, operational summaries, and CRM dashboard foundations.",
    tone: CRM_SILVER,
  },
  duplicates: {
    icon: "D",
    eyebrow: "CRM workbench",
    title: "Duplicates",
    description: "Possible duplicate records, merge candidates, and identity cleanup.",
    tone: CRM_SILVER,
  },
  audit: {
    icon: "A",
    eyebrow: "CRM workbench",
    title: "Audit Log",
    description: "Change history, record decisions, and operational traceability.",
    tone: CRM_SILVER,
  },
};

const CRM_OBJECTS: CRMObject[] = ["leads", "contacts", "accounts", "opportunities"];
const CRM_WORKFLOWS: CRMObject[] = ["bd", "queue", "health", "reporting", "duplicates", "audit"];

const CRMBulkBarContext = createContext<(node: ReactNode | null) => void>(() => {});

export function useCRMBulkBar(node: ReactNode | null) {
  const setBulkBar = useContext(CRMBulkBarContext);
  useEffect(() => {
    setBulkBar(node);
    return () => setBulkBar(null);
  }, [node, setBulkBar]);
}

function buildHref(object: CRMObject): string {
  const params = new URLSearchParams();
  if (object !== "contacts") params.set("object", object);
  const qs = params.toString();
  return `/contacts${qs ? `?${qs}` : ""}`;
}

export function CRMShell({
  children,
  activeObject,
  counts,
}: {
  children: ReactNode;
  activeObject: CRMObject;
  counts?: Partial<Record<CRMObject, number>>;
}) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [bulkBar, setBulkBar] = useState<ReactNode | null>(null);
  const contextValue = useMemo(() => setBulkBar, []);
  const activeMeta = OBJECT_META[activeObject];

  const switchTo = (obj: CRMObject) => {
    router.push(buildHref(obj));
  };

  return (
    <CRMBulkBarContext.Provider value={contextValue}>
    <div style={{ position: "relative", paddingBottom: bulkBar ? 76 : 0 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: isMobile ? "12px" : "14px 16px 12px",
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${CRM_SILVER_BORDER}`,
          background: "linear-gradient(180deg, rgba(12,12,16,0.88), rgba(5,5,8,0.94))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 48px rgba(0,0,0,0.24)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: activeMeta.tone,
              fontSize: 15,
              fontWeight: 800,
              background: `linear-gradient(145deg, ${CRM_RED_SOFT}, rgba(196,201,209,0.055))`,
              border: `1px solid ${CRM_RED_BORDER}`,
              boxShadow: "0 0 22px rgba(218,218,219,0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {activeMeta.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 750, letterSpacing: 0, textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
              {activeMeta.eyebrow}
            </div>
            <div style={{ marginTop: 2, display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 22, lineHeight: 1.15, fontWeight: 750, color: "var(--color-client-text)", letterSpacing: 0 }}>
                {activeMeta.title}
              </h1>
              {typeof counts?.[activeObject] === "number" ? (
                <span style={{ color: "var(--color-client-text-dim)", fontSize: 12, fontWeight: 650 }}>{counts[activeObject]} records</span>
              ) : null}
            </div>
            <p style={{ margin: "4px 0 0", maxWidth: 680, fontSize: 12, lineHeight: 1.45, color: "var(--color-client-text-secondary)" }}>
              {activeMeta.description}
            </p>
          </div>
        </div>
        <CRMObjectNav activeObject={activeObject} counts={counts} onSelect={switchTo} />
      </div>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "sticky",
          bottom: 12,
          zIndex: 60,
          transform: bulkBar ? "translateY(0)" : "translateY(24px)",
          opacity: bulkBar ? 1 : 0,
          pointerEvents: bulkBar ? "auto" : "none",
          transition: "transform 160ms ease, opacity 160ms ease",
        }}
      >
        {bulkBar}
      </div>
    </div>
    </CRMBulkBarContext.Provider>
  );
}

function CRMObjectNav({
  activeObject,
  counts,
  onSelect,
}: {
  activeObject: CRMObject;
  counts?: Partial<Record<CRMObject, number>>;
  onSelect: (object: CRMObject) => void;
}) {
  const toolsActive = CRM_WORKFLOWS.includes(activeObject);
  return (
    <div
      role="tablist"
      aria-label="CRM console navigation"
      className="crm-shell-tabs"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 42,
        gap: 6,
        padding: 4,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.018))",
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {CRM_OBJECTS.map((obj) => (
        <CRMShellTab
          key={obj}
          object={obj}
          active={activeObject === obj}
          count={counts?.[obj]}
          onClick={() => onSelect(obj)}
        />
      ))}
      <CRMToolsDropdown activeObject={activeObject} active={toolsActive} counts={counts} onSelect={onSelect} />
    </div>
  );
}

function CRMToolsDropdown({
  activeObject,
  active,
  counts,
  onSelect,
}: {
  activeObject: CRMObject;
  active: boolean;
  counts?: Partial<Record<CRMObject, number>>;
  onSelect: (object: CRMObject) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeToolLabel = active ? `Tools · ${TAB_LABELS[activeObject]}` : "Tools";
  const toolCount = CRM_WORKFLOWS.length;

  const openMenu = useCallback(() => {
    const nextRect = triggerRef.current?.getBoundingClientRect();
    if (nextRect) setRect(nextRect);
    setOpen(true);
  }, []);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
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
  }, [closeMenu, open]);

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const menuWidth = rect ? Math.min(300, Math.max(236, rect.width)) : 260;
  const menuLeft = rect ? Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - menuWidth - 12)) : 12;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        style={{
          minHeight: 32,
          padding: "0 11px 0 10px",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          flexShrink: 0,
          marginLeft: 2,
          position: "relative",
          overflow: "hidden",
          background: active || open
            ? "linear-gradient(135deg, rgba(218,218,219,0.24), rgba(196,201,209,0.08))"
            : "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
          border: active || open ? `1px solid ${CRM_RED_BORDER}` : `1px solid ${CRM_SILVER_BORDER}`,
          borderRadius: 8,
          color: active ? "rgba(255,255,255,0.92)" : "var(--color-client-text-secondary)",
          fontSize: 12,
          fontWeight: active ? 750 : 650,
          cursor: "pointer",
          whiteSpace: "nowrap",
          boxShadow: open || active ? "0 0 0 1px rgba(218,218,219,0.10), 0 0 24px rgba(218,218,219,0.14)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 16,
            height: 16,
            display: "inline-grid",
            placeItems: "center",
            borderRadius: 5,
            background: active || open ? "rgba(218,218,219,0.20)" : "rgba(196,201,209,0.08)",
            border: active || open ? `1px solid ${CRM_RED_BORDER}` : `1px solid rgba(196,201,209,0.14)`,
            color: active || open ? "#FF5A61" : CRM_SILVER,
            fontSize: 9,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          ◇
        </span>
        <span>{active ? activeToolLabel : "Tools"}</span>
        {active && typeof counts?.[activeObject] === "number" ? (
          <span
            style={{
              fontSize: 11,
              color: CRM_SILVER,
              background: "rgba(196,201,209,0.10)",
              borderRadius: 4,
              padding: "1px 6px",
              fontWeight: 650,
            }}
          >
            {counts[activeObject]}
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              color: open ? "#F4C7CA" : "var(--color-client-text-dim)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 999,
              padding: "1px 6px",
              fontWeight: 750,
            }}
          >
            {toolCount}
          </span>
        )}
        <span style={{ fontSize: 10, color: open ? CRM_RED : "var(--color-client-text-dim)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 140ms ease" }}>▾</span>
      </button>
      {open && typeof document !== "undefined" && rect ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="CRM tools"
          style={{
            position: "fixed",
            top: rect.bottom + 6,
            left: menuLeft,
            width: menuWidth,
            zIndex: 9999,
            padding: 8,
            background: "linear-gradient(180deg, rgba(15,15,22,0.99), rgba(7,7,11,0.99))",
            border: `1px solid ${open ? CRM_RED_BORDER : CRM_SILVER_BORDER}`,
            borderRadius: 12,
            boxShadow: "0 24px 60px rgba(0,0,0,0.68), 0 0 32px rgba(218,218,219,0.10), inset 0 1px 0 rgba(255,255,255,0.06)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ padding: "6px 7px 9px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: "0.12em", textTransform: "uppercase", color: "#F4C7CA" }}>CRM Tools</span>
              <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: "1px 7px" }}>{toolCount} workbenches</span>
            </div>
            <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.35, color: "var(--color-client-text-dim)" }}>
              Workflows, quality checks, reporting, and audit trails under the CRM surface.
            </div>
          </div>
          {CRM_WORKFLOWS.map((obj) => {
            const itemActive = activeObject === obj;
            const meta = OBJECT_META[obj];
            return (
              <button
                key={obj}
                type="button"
                role="menuitem"
                aria-current={itemActive ? "page" : undefined}
                onClick={() => {
                  closeMenu();
                  onSelect(obj);
                }}
                style={{
                  width: "100%",
                  minHeight: 48,
                  padding: "8px 9px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  border: itemActive ? `1px solid ${CRM_RED_BORDER}` : "1px solid transparent",
                  borderRadius: 9,
                  background: itemActive ? "linear-gradient(135deg, rgba(218,218,219,0.18), rgba(255,255,255,0.035))" : "transparent",
                  color: itemActive ? "rgba(255,255,255,0.92)" : "var(--color-client-text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(event) => {
                  if (!itemActive) event.currentTarget.style.background = "rgba(255,255,255,0.055)";
                }}
                onMouseLeave={(event) => {
                  if (!itemActive) event.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    display: "inline-grid",
                    placeItems: "center",
                    borderRadius: 7,
                    background: meta.tone === CRM_SILVER ? CRM_SILVER_SOFT : CRM_RED_SOFT,
                    border: `1px solid ${meta.tone === CRM_SILVER ? CRM_SILVER_BORDER : CRM_RED_BORDER}`,
                    color: meta.tone === CRM_SILVER ? CRM_SILVER : "#FF5A61",
                    boxShadow: itemActive ? `0 0 18px ${CRM_RED_SOFT}` : undefined,
                    fontSize: 11,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {meta.icon}
                </span>
                <span style={{ minWidth: 0, flex: 1, display: "grid", gap: 2 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: itemActive ? 800 : 700 }}>
                      {TAB_LABELS[obj]}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 9, color: "var(--color-client-text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {meta.eyebrow.replace("CRM ", "")}
                    </span>
                  </span>
                  <span style={{ fontSize: 10.5, lineHeight: 1.3, color: "var(--color-client-text-dim)" }}>
                    {meta.description}
                  </span>
                </span>
                {typeof counts?.[obj] === "number" ? (
                  <span style={{ marginTop: 2, fontSize: 11, color: itemActive ? CRM_SILVER : "var(--color-client-text-dim)", background: "rgba(255,255,255,0.05)", borderRadius: 5, padding: "1px 6px", fontWeight: 650 }}>
                    {counts[obj]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>,
        document.body
      ) : null}
    </>
  );
}

function CRMShellTab({
  object,
  active,
  count,
  onClick,
}: {
  object: CRMObject;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const label = TAB_LABELS[object];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        minHeight: 32,
        padding: "0 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        background: active ? CRM_RED_SOFT : "transparent",
        border: active ? `1px solid ${CRM_RED_BORDER}` : "1px solid transparent",
        borderRadius: 6,
        color: active ? "rgba(255,255,255,0.92)" : "var(--color-client-text-secondary)",
        fontSize: 12,
        fontWeight: active ? 750 : 650,
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          style={{
            fontSize: 11,
            color: active ? CRM_SILVER : "var(--color-client-text-dim)",
            background: active ? "rgba(196,201,209,0.10)" : "rgba(255,255,255,0.04)",
            borderRadius: 4,
            padding: "1px 6px",
            fontWeight: 650,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
