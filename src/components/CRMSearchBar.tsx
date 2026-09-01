"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";
import { toDisplayId } from "@/lib/crm/displayId";

// ── Types ──

interface CRMContact {
  id: string;
  name: string;
  company?: string;
  accountId?: string;
  emails: string[];
  tags: string[];
  title?: string;
  owner?: string;
  followUpState?: string;
}

interface CRMAccount {
  id: string;
  name: string;
  type: string;
  subType?: string;
  operatingMarket?: string;
  website?: string;
  domain?: string;
  industry?: string;
  owner?: string;
}

interface CRMOpportunity {
  id: string;
  name: string;
  opportunityType?: string;
  stage?: string;
  owner?: string;
  nextStep?: string;
  nextStepDueDate?: string;
  value?: number;
}

interface CRMLead {
  id: string;
  name?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  type?: string;
  status?: string;
  assignedTo?: string;
  receivedAt?: string;
}

interface CRMSearchResult {
  id: string;
  group: "Contacts" | "Accounts" | "Opportunities" | "Leads";
  title: string;
  subtitle: string;
  icon: string;
  badgeLabel: string;
  badgeColor: string;
  href: string;
  score: number;
}

// ── Scoring ──

function fieldScore(query: string, field: string | undefined): number {
  if (!query || !field) return 0;
  const q = query.toLowerCase();
  const f = field.toLowerCase();
  if (f === q) return 100;
  if (f.startsWith(q)) return 80;
  let best = 0;
  if (f.includes(q)) best = 50;
  const words = f.split(/\s+/);
  for (const w of words) {
    if (w === q) best = Math.max(best, 90);
    else if (w.startsWith(q)) best = Math.max(best, 70);
  }
  return best;
}

function bestFieldScore(query: string, fields: (string | undefined)[]): number {
  let best = 0;
  for (const f of fields) {
    best = Math.max(best, fieldScore(query, f));
  }
  return best;
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function isOverdueDate(value?: string): boolean {
  return Boolean(value && value < new Date().toISOString().slice(0, 10));
}

function appendSignal(parts: (string | undefined | null)[], signal?: string): string {
  return [...parts.filter(Boolean), signal].join(" · ");
}

function contactSignal(contact: CRMContact): string | undefined {
  if (contact.followUpState && contact.followUpState !== "none") return `Needs action: ${contact.followUpState}`;
  if (!contact.owner) return "Needs owner";
  if (!contact.accountId) return "Needs account link";
  return undefined;
}

function accountSignal(account: CRMAccount): string | undefined {
  if (!account.owner) return "Needs owner";
  if (!account.website && !account.domain) return "Needs domain";
  return undefined;
}

function opportunitySignal(opportunity: CRMOpportunity): string | undefined {
  if (!opportunity.nextStep?.trim()) return "Needs next step";
  if (isOverdueDate(opportunity.nextStepDueDate)) return "Overdue next step";
  return undefined;
}

function leadSignal(lead: CRMLead): string | undefined {
  if (!lead.assignedTo) return "Needs owner";
  const age = daysSince(lead.receivedAt);
  if ((age ?? 0) >= 3 && ["new", "contacted", "qualified", "scheduled"].includes(lead.status ?? "")) return "Needs qualification";
  return undefined;
}

// ── Component ──

export function CRMSearchBar({
  consoleData,
  consoleLoading = false,
}: {
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CRMSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Cached data
  const contactsRef = useRef<CRMContact[]>([]);
  const accountsRef = useRef<CRMAccount[]>([]);
  const opportunitiesRef = useRef<CRMOpportunity[]>([]);
  const leadsRef = useRef<CRMLead[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all CRM data on mount. When the CRM console payload is already
  // available, reuse it and only fetch inbound leads for search coverage.
  useEffect(() => {
    if (consoleData) {
      contactsRef.current = consoleData.contacts;
      accountsRef.current = consoleData.accounts;
      opportunitiesRef.current = consoleData.opportunities;
      leadsRef.current = consoleData.search.leads;
      return;
    }
    if (consoleLoading) return;

    Promise.all([
      fetch("/api/crm/contacts").then((r) => r.json()),
      fetch("/api/crm/accounts").then((r) => r.json()),
      fetch("/api/crm/opportunities").then((r) => r.json()),
      fetch("/api/inbound").then((r) => r.json()),
    ]).then(([contacts, accounts, opportunities, leads]) => {
      contactsRef.current = contacts ?? [];
      accountsRef.current = accounts ?? [];
      opportunitiesRef.current = opportunities ?? [];
      leadsRef.current = leads ?? [];
    }).catch(() => {});
  }, [consoleData, consoleLoading]);

  // Search logic
  const performSearch = useCallback((q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const all: CRMSearchResult[] = [];

    // Contacts
    for (const c of contactsRef.current) {
      const displayId = toDisplayId(c.id, "contact");
      const score = bestFieldScore(q, [c.id, displayId, c.name, c.company, ...(c.emails ?? []), c.title, ...(c.tags ?? [])]);
      if (score > 0) {
        all.push({
          id: c.id,
          group: "Contacts",
          title: c.name,
          subtitle: appendSignal([displayId, c.title, c.company || c.emails?.[0]], contactSignal(c)),
          icon: "👤",
          badgeLabel: "Contact",
          badgeColor: "#dadadb",
          href: `/contacts?select=${displayId}`,
          score,
        });
      }
    }

    // Accounts
    for (const a of accountsRef.current) {
      const displayId = toDisplayId(a.id, "account");
      const score = bestFieldScore(q, [a.id, displayId, a.name, a.type, a.subType, a.website, a.domain, a.industry]);
      if (score > 0) {
        all.push({
          id: a.id,
          group: "Accounts",
          title: a.name,
          subtitle: appendSignal([displayId, a.type, a.subType, a.operatingMarket], accountSignal(a)),
          icon: "🏢",
          badgeLabel: "Account",
          badgeColor: "#dadadb",
          href: `/contacts?object=accounts&select=${displayId}`,
          score,
        });
      }
    }

    // Opportunities
    for (const o of opportunitiesRef.current) {
      const displayId = toDisplayId(o.id, "opportunity");
      const score = bestFieldScore(q, [o.id, displayId, o.name, o.opportunityType, o.stage, o.owner, o.nextStep]);
      if (score > 0) {
        all.push({
          id: o.id,
          group: "Opportunities",
          title: o.name,
          subtitle: appendSignal([displayId, o.stage, o.opportunityType, o.value != null ? "$" + o.value.toLocaleString() : null], opportunitySignal(o)),
          icon: "💰",
          badgeLabel: "Opportunity",
          badgeColor: "#C4C9D1",
          href: `/contacts?object=opportunities&select=${displayId}`,
          score,
        });
      }
    }

    // Leads
    for (const l of leadsRef.current) {
      const displayId = toDisplayId(l.id, "lead");
      const score = bestFieldScore(q, [l.id, displayId, l.name, l.companyName, l.contactName, l.email, l.type, l.status]);
      if (score > 0) {
        all.push({
          id: l.id,
          group: "Leads",
          title: l.name || l.contactName || "Unnamed Lead",
          subtitle: appendSignal([displayId, l.type, l.status, l.email], leadSignal(l)),
          icon: "📥",
          badgeLabel: "Lead",
          badgeColor: "#F59E0B",
          href: `/contacts?object=leads&select=${l.id}`,
          score,
        });
      }
    }

    all.sort((a, b) => b.score - a.score);
    setResults(all);
    setHighlightedIndex(-1);
  }, []);

  // Debounced input handler
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setIsOpen(val.length >= 2);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(val), 150);
    },
    [performSearch],
  );

  // Click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // '/' shortcut
  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement !== inputRef.current &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName ?? "")
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleSlash);
    return () => document.removeEventListener("keydown", handleSlash);
  }, []);

  // Group results for display
  const groups: { label: string; items: CRMSearchResult[] }[] = [];
  const groupOrder = ["Contacts", "Accounts", "Opportunities", "Leads"] as const;
  for (const g of groupOrder) {
    const items = results.filter((r) => r.group === g);
    if (items.length > 0) {
      groups.push({ label: g, items: items.slice(0, 5) });
    }
  }
  const flatItems = groups.flatMap((g) => g.items);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i < flatItems.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : flatItems.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
      e.preventDefault();
      router.push(flatItems[highlightedIndex].href);
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  let flatIndex = -1;

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: 16 }}>
      {/* Input */}
      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          placeholder="Search contacts, accounts, leads, opportunities..."
          style={{
            width: "100%",
            padding: "12px 16px",
            paddingLeft: 40,
            paddingRight: 44,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 14,
            color: "var(--color-client-text)",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onBlur={(e) => {
            // Don't remove focus border immediately — dropdown clicks need it
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor = "rgba(218,218,219,0.4)";
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: "var(--color-client-text-dim, rgba(255,255,255,0.3))",
            background: "rgba(255,255,255,0.06)",
            padding: "2px 7px",
            borderRadius: 4,
            fontFamily: "monospace",
            pointerEvents: "none",
          }}
        >
          /
        </span>
      </div>

      {/* Dropdown */}
      {isOpen && query.length >= 2 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            zIndex: 50,
            background: "#0c0c12",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxHeight: 480,
            overflowY: "auto",
          }}
        >
          {flatItems.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--color-client-text-dim, rgba(255,255,255,0.4))",
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                {/* Group header */}
                <div
                  style={{
                    padding: "8px 14px 4px",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-client-text-dim, rgba(255,255,255,0.4))",
                  }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <div
                      key={`${item.group}-${item.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        router.push(item.href);
                        setIsOpen(false);
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: isHighlighted
                          ? "rgba(218,218,219,0.06)"
                          : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--color-client-text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--color-client-text-dim, rgba(255,255,255,0.4))",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          color: item.badgeColor,
                          background: item.badgeColor + "18",
                          flexShrink: 0,
                        }}
                      >
                        {item.badgeLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
