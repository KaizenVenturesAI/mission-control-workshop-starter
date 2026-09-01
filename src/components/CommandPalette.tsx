"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toDisplayId } from "@/lib/crm/displayId";

type EntityType = "account" | "contact" | "opportunity" | "activity";

interface PaletteAccount {
  id: string;
  name: string;
  aliases?: string[];
  domain?: string;
  type?: string;
  subType?: string;
  updatedAt?: string;
}

interface PaletteContact {
  id: string;
  name: string;
  emails?: string[];
  additionalEmails?: string[];
  linkedinUrl?: string;
  accountId?: string;
  owner?: string;
  relationshipOwner?: string;
  lastTouchAt?: string;
}

interface PaletteOpportunity {
  id: string;
  name: string;
  accountId?: string;
  stage?: string;
  updatedAt?: string;
}

interface PaletteActivity {
  id: string;
  type: string;
  content: string;
  participants?: string[];
  contactId?: string;
  accountId?: string;
  occurredAt?: string;
}

interface CacheBundle {
  accounts: PaletteAccount[];
  contacts: PaletteContact[];
  opportunities: PaletteOpportunity[];
  activities: PaletteActivity[];
  ts: number;
}

interface PaletteItem {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

interface PaletteGroup {
  type: EntityType;
  items: PaletteItem[];
  total: number;
}

const TYPE_LABELS: Record<EntityType, string> = {
  account: "Accounts",
  contact: "Contacts",
  opportunity: "Opportunities",
  activity: "Activities",
};

const TYPE_ICONS: Record<EntityType, string> = {
  account: "\u{1F3E2}",
  contact: "\u{1F464}",
  opportunity: "\u{1F4BC}",
  activity: "\u{1F4DD}",
};

const TYPE_ORDER: EntityType[] = ["account", "contact", "opportunity", "activity"];
const RECENT_KEY = "mc:cmdk:recent";
const CACHE_TTL_MS = 60_000;
const MAX_PER_GROUP = 5;

let cache: CacheBundle | null = null;

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

async function fetchAll(): Promise<CacheBundle> {
  const [accountsRes, contactsRes, opportunitiesRes, activitiesRes] = await Promise.all([
    fetch("/api/crm/accounts").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("/api/crm/contacts").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("/api/crm/opportunities").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("/api/crm/activities").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  return {
    accounts: safeArr<PaletteAccount>(accountsRes),
    contacts: safeArr<PaletteContact>(contactsRes),
    opportunities: safeArr<PaletteOpportunity>(opportunitiesRes),
    activities: safeArr<PaletteActivity>(activitiesRes),
    ts: Date.now(),
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function tokenScore(token: string, raw: string | undefined): number {
  if (!raw || !token) return 0;
  const f = raw.toLowerCase();
  if (!f) return 0;
  const words = f.split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of words) {
    if (w === token) return 10;
    if (w.startsWith(token)) return 10;
  }
  if (f.includes(token)) return 5;
  if (token.length >= 4) {
    for (const w of words) {
      if (Math.abs(w.length - token.length) > 2) continue;
      if (levenshtein(w, token) <= 2) return 2;
    }
  }
  return 0;
}

function multiTokenScore(query: string, fields: (string | undefined)[]): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const f of fields) {
      const s = tokenScore(tok, f);
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

function recencyBoost(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const day = 24 * 60 * 60 * 1000;
  const diff = Date.now() - t;
  if (diff < 7 * day) return 1;
  if (diff < 30 * day) return 0.5;
  return 0;
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.round(diff / (7 * day))}w ago`;
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function loadRecent(): PaletteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(item: PaletteItem) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecent().filter((r) => r.id !== item.id);
    const next = [{ ...item, score: 0 }, ...existing].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
}

function buildGroups(query: string, data: CacheBundle): PaletteGroup[] {
  const q = query.trim();
  const accountNameById = new Map<string, string>();
  for (const a of data.accounts) accountNameById.set(a.id, a.name);

  // Accounts
  const accounts: PaletteItem[] = [];
  for (const a of data.accounts) {
    const score = multiTokenScore(q, [a.name, ...(a.aliases ?? []), a.domain]);
    if (score === 0) continue;
    const display = toDisplayId(a.id, "account");
    const subtitle = [display, a.type, a.domain].filter(Boolean).join(" · ") || "Account";
    accounts.push({
      id: `account-${a.id}`,
      type: "account",
      title: a.name || "(unnamed account)",
      subtitle,
      href: `/contacts?object=accounts&select=${encodeURIComponent(display)}`,
      score: score + recencyBoost(a.updatedAt),
    });
  }

  // Contacts
  const contacts: PaletteItem[] = [];
  for (const c of data.contacts) {
    const score = multiTokenScore(q, [
      c.name,
      ...(c.emails ?? []),
      ...(c.additionalEmails ?? []),
      c.linkedinUrl,
    ]);
    if (score === 0) continue;
    const owner = c.owner || c.relationshipOwner;
    const primaryEmail = c.emails?.[0];
    const domain = primaryEmail ? primaryEmail.split("@")[1] : undefined;
    const display = toDisplayId(c.id, "contact");
    const subtitle = [
      display,
      owner ? `Owner: ${owner}` : null,
      domain || primaryEmail || null,
    ].filter(Boolean).join(" · ") || "Contact";
    contacts.push({
      id: `contact-${c.id}`,
      type: "contact",
      title: c.name || "(unnamed contact)",
      subtitle,
      href: `/contacts?select=${encodeURIComponent(display)}`,
      score: score + recencyBoost(c.lastTouchAt),
    });
  }

  // Opportunities
  const opportunities: PaletteItem[] = [];
  for (const o of data.opportunities) {
    const accountName = o.accountId ? accountNameById.get(o.accountId) : undefined;
    const score = multiTokenScore(q, [o.name, accountName]);
    if (score === 0) continue;
    const display = toDisplayId(o.id, "opportunity");
    const subtitle = [display, o.stage, accountName].filter(Boolean).join(" · ") || "Opportunity";
    opportunities.push({
      id: `opportunity-${o.id}`,
      type: "opportunity",
      title: o.name || "(unnamed opportunity)",
      subtitle,
      href: `/contacts?object=opportunities&select=${encodeURIComponent(display)}`,
      score: score + recencyBoost(o.updatedAt),
    });
  }

  // Activities
  const activities: PaletteItem[] = [];
  for (const act of data.activities) {
    const score = multiTokenScore(q, [act.content, ...(act.participants ?? [])]);
    if (score === 0) continue;
    const preview = truncate((act.content ?? "").replace(/\s+/g, " ").trim(), 80) || "(no content)";
    const subtitle = `${act.type} · ${relativeTime(act.occurredAt)}`.trim();
    activities.push({
      id: `activity-${act.id}`,
      type: "activity",
      title: preview,
      subtitle,
      href: `/contacts?activity=${encodeURIComponent(act.id)}`,
      score: score + recencyBoost(act.occurredAt),
    });
  }

  const sortDesc = (a: PaletteItem, b: PaletteItem) => b.score - a.score;
  const groups: PaletteGroup[] = [];
  for (const t of TYPE_ORDER) {
    const list =
      t === "account" ? accounts :
      t === "contact" ? contacts :
      t === "opportunity" ? opportunities :
      activities;
    if (list.length === 0) continue;
    list.sort(sortDesc);
    groups.push({ type: t, items: list.slice(0, MAX_PER_GROUP), total: list.length });
  }
  return groups;
}

function recentGroup(items: PaletteItem[]): PaletteGroup | null {
  if (items.length === 0) return null;
  return { type: items[0].type, items: items.slice(0, 5), total: items.length };
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CacheBundle | null>(cache);
  const [loading, setLoading] = useState<boolean>(!cache);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recents, setRecents] = useState<PaletteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // On open: reset, load recents, refresh cache if stale
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setRecents(loadRecent());
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const stale = !cache || Date.now() - cache.ts > CACHE_TTL_MS;
    if (stale) {
      setLoading(true);
      let alive = true;
      fetchAll()
        .then((bundle) => {
          if (!alive) return;
          cache = bundle;
          setData(bundle);
          setLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setLoading(false);
        });
      return () => {
        alive = false;
        window.clearTimeout(t);
      };
    }
    setData(cache);
    setLoading(false);
    return () => window.clearTimeout(t);
  }, [open]);

  const groups = useMemo<PaletteGroup[]>(() => {
    if (!data) return [];
    const q = query.trim();
    if (!q) {
      const r = recentGroup(recents);
      return r ? [r] : [];
    }
    return buildGroups(q, data);
  }, [data, query, recents]);

  const flat = useMemo<PaletteItem[]>(() => groups.flatMap((g) => g.items), [groups]);

  // Clamp selectedIndex when result set shrinks
  useEffect(() => {
    if (selectedIndex >= flat.length) setSelectedIndex(0);
  }, [flat.length, selectedIndex]);

  const navigate = useCallback(
    (item: PaletteItem) => {
      pushRecent(item);
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((i) => (flat.length === 0 ? 0 : Math.min(flat.length - 1, i + 1)));
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        if (flat[selectedIndex]) {
          e.preventDefault();
          navigate(flat[selectedIndex]);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && /^[1-4]$/.test(e.key)) {
        const groupIdx = parseInt(e.key, 10) - 1;
        const targetType = TYPE_ORDER[groupIdx];
        const idx = flat.findIndex((it) => it.type === targetType);
        if (idx >= 0) {
          e.preventDefault();
          setSelectedIndex(idx);
          navigate(flat[idx]);
        }
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, selectedIndex, navigate, onClose]);

  // Scroll selection into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [selectedIndex, flat.length]);

  if (!open) return null;

  const trimmed = query.trim();
  const showRecent = !trimmed && recents.length > 0;
  const showEmpty = !trimmed && recents.length === 0 && !loading;
  const showNoResults = !!trimmed && !loading && groups.length === 0;

  let flatIdx = -1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "min(18vh, 140px)",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 640,
          maxHeight: 480,
          margin: "0 16px",
          background: "rgba(14,14,20,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center gap-3"
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ fontSize: 14, opacity: 0.6 }}>{"⌕"}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, contacts, opportunities, activities…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 15,
              color: "var(--color-client-text)",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "var(--color-client-text-dim)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            ESC
          </span>
        </div>

        <div
          ref={resultsRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {loading ? (
            <div style={{ padding: "24px 18px", fontSize: 13, color: "var(--color-client-text-dim)", textAlign: "center" }}>
              Loading…
            </div>
          ) : showRecent ? (
            <RecentList
              groups={groups}
              recents={recents}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              navigate={navigate}
              groupHeader="RECENT"
              flatStart={(idx) => { flatIdx = idx; return flatIdx; }}
            />
          ) : showEmpty ? (
            <div style={{ padding: "24px 18px", fontSize: 13, color: "var(--color-client-text-dim)", textAlign: "center" }}>
              Start typing to search…
            </div>
          ) : showNoResults ? (
            <div style={{ padding: "24px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--color-client-text-dim)", fontStyle: "italic" }}>
                No matches for &laquo;{query}&raquo;
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-client-text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 600,
                    padding: "8px 18px 4px",
                  }}
                >
                  {TYPE_LABELS[group.type].toUpperCase()} ({group.total})
                </div>
                {group.items.map((item) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  const isSelected = idx === selectedIndex;
                  return (
                    <PaletteRow
                      key={item.id}
                      item={item}
                      idx={idx}
                      isSelected={isSelected}
                      onSelect={() => setSelectedIndex(idx)}
                      onActivate={() => navigate(item)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="flex items-center gap-4"
          style={{
            padding: "8px 18px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 10,
            color: "var(--color-client-text-dim)",
          }}
        >
          <span>{"↑↓"} navigate</span>
          <span>{"↵"} open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function RecentList({
  groups,
  recents,
  selectedIndex,
  setSelectedIndex,
  navigate,
  groupHeader,
  flatStart,
}: {
  groups: PaletteGroup[];
  recents: PaletteItem[];
  selectedIndex: number;
  setSelectedIndex: (n: number) => void;
  navigate: (item: PaletteItem) => void;
  groupHeader: string;
  flatStart: (n: number) => number;
}) {
  // Use the recents directly — already shaped as PaletteItems.
  void groups;
  let i = -1;
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-client-text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontWeight: 600,
          padding: "8px 18px 4px",
        }}
      >
        {groupHeader} ({recents.length})
      </div>
      {recents.map((item) => {
        i += 1;
        const idx = flatStart(i);
        const isSelected = idx === selectedIndex;
        return (
          <PaletteRow
            key={`recent-${item.id}`}
            item={item}
            idx={idx}
            isSelected={isSelected}
            onSelect={() => setSelectedIndex(idx)}
            onActivate={() => navigate(item)}
          />
        );
      })}
    </div>
  );
}

function PaletteRow({
  item,
  idx,
  isSelected,
  onSelect,
  onActivate,
}: {
  item: PaletteItem;
  idx: number;
  isSelected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}) {
  return (
    <button
      data-index={idx}
      onClick={onActivate}
      onMouseEnter={onSelect}
      className="w-full flex items-center gap-3"
      style={{
        height: 40,
        padding: "0 18px",
        background: isSelected ? "rgba(96,165,250,0.15)" : "transparent",
        borderLeft: isSelected ? "2px solid rgba(96,165,250,0.85)" : "2px solid transparent",
        border: "none",
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--color-client-text)",
        transition: "background 0.1s",
      }}
      onMouseOver={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseOut={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 14,
          width: 22,
          textAlign: "center",
          flexShrink: 0,
          opacity: 0.85,
        }}
      >
        {TYPE_ICONS[item.type]}
      </span>
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-client-text-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.subtitle}
        </div>
      </div>
      {isSelected && (
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", opacity: 0.6 }}>
          {"↵"}
        </span>
      )}
    </button>
  );
}
