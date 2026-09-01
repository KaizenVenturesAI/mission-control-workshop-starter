"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SearchableAccountSelect, type AccountOption } from "@/components/SearchableAccountSelect";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export type ConvertLeadPath = "A" | "B" | "C";

function getLeadName(lead: InboundLeadRecord): string {
  return lead.name || lead.companyName || lead.contactName || "Unknown lead";
}

function defaultEmail(lead: InboundLeadRecord, allowPhoneFallback: boolean): string {
  if (lead.email) return lead.email;
  if (!allowPhoneFallback || !lead.phone) return "";
  const normalized = lead.phone.replace(/[^0-9a-z]/gi, "").toLowerCase();
  return normalized ? `phone-${normalized}@lead.local` : "";
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--color-client-text)",
  fontSize: 13,
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--color-client-text-dim)",
  marginBottom: 6,
};

const radioStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  width: "100%",
  textAlign: "left",
  padding: "12px",
  borderRadius: 10,
  border: active ? "1px solid rgba(218,218,219,0.45)" : "1px solid rgba(255,255,255,0.08)",
  background: active ? "rgba(218,218,219,0.10)" : "rgba(255,255,255,0.04)",
  color: "var(--color-client-text)",
  cursor: "pointer",
});

function ModalShell({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 240 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          maxWidth: "92vw",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
          padding: 22,
          zIndex: 241,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-client-text)" }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "var(--color-client-text-secondary)", cursor: "pointer" }}>X</button>
        </div>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>{footer}</div>
      </div>
    </>,
    document.body,
  );
}

export function ConvertLeadModal({
  lead,
  accounts,
  accountsLoading,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  lead: InboundLeadRecord;
  accounts: AccountOption[];
  accountsLoading: boolean;
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { path: ConvertLeadPath; existingAccountId?: string; accountName?: string; contactName: string; contactEmail: string }) => Promise<void>;
}) {
  const isInstallProgramLead = lead.type === "academy-la" || lead.type === "academy-miami";
  const academyLocation = lead.type === "academy-la" ? "LA" : "Miami";
  const initialPath: ConvertLeadPath = isInstallProgramLead ? "B" : lead.expectedRecordType === "company" ? "A" : "B";
  const [path, setPath] = useState<ConvertLeadPath>(initialPath);
  const [accountName, setAccountName] = useState(lead.companyName || getLeadName(lead));
  const [existingAccountId, setExistingAccountId] = useState("");
  const [contactName, setContactName] = useState(lead.contactName || getLeadName(lead));
  const [contactEmail, setContactEmail] = useState(defaultEmail(lead, true));

  const requiresExistingAccount = path === "C";
  const canSubmit = contactName.trim() && (!requiresExistingAccount || existingAccountId);

  return (
    <ModalShell
      title={`Convert lead: ${getLeadName(lead)}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={submitting} style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-secondary)", cursor: submitting ? "not-allowed" : "pointer" }}>Cancel</button>
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={() => onSubmit({ path, existingAccountId: existingAccountId || undefined, accountName: accountName.trim() || undefined, contactName: contactName.trim(), contactEmail: contactEmail.trim() })}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(218,218,219,0.45)", background: canSubmit ? "rgba(218,218,219,0.18)" : "rgba(255,255,255,0.04)", color: canSubmit ? "#F4C7CA" : "var(--color-client-text-dim)", fontWeight: 700, cursor: submitting || !canSubmit ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Converting..." : "Convert ->"}
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {[
          ["A", "Path A - Company Lead", "Create new Contact + new Account (or link to existing Account)"],
          ["B", isInstallProgramLead ? `Path B - Example Client Install ${academyLocation}` : "Path B - Person Lead (B2C)", isInstallProgramLead ? `Create Contact under the Example Client install account for ${academyLocation} instead of a Person Account` : "Create new Contact + auto-spawn matching Person Account"],
          ["C", "Path C - Contact only", "Create just a Contact, link to existing Account"],
        ].map(([value, title, description]) => (
          <button key={value} type="button" onClick={() => setPath(value as ConvertLeadPath)} style={radioStyle(path === value)}>
            <input type="radio" checked={path === value} readOnly style={{ marginTop: 2, accentColor: "#dadadb" }} />
            <span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{title}</span>
              <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "var(--color-client-text-dim)", lineHeight: 1.4 }}>{description}</span>
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {path === "A" && (
          <>
            <div>
              <label style={labelStyle}>Account name</label>
              <input value={accountName} onChange={(event) => setAccountName(event.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Or link to existing Account:</label>
              <SearchableAccountSelect accounts={accounts} value={existingAccountId} loading={accountsLoading} onChange={(id) => setExistingAccountId(id)} onCreateNew={(name) => { setAccountName(name); setExistingAccountId(""); }} placeholder="Search existing accounts..." />
            </div>
          </>
        )}
        {path === "C" && (
          <div>
            <label style={labelStyle}>Existing Account:</label>
            <SearchableAccountSelect accounts={accounts} value={existingAccountId} loading={accountsLoading} onChange={(id) => setExistingAccountId(id)} onCreateNew={() => undefined} placeholder="Select an account..." />
          </div>
        )}
        <div>
          <label style={labelStyle}>Contact name</label>
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Contact email</label>
          <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} style={inputStyle} />
        </div>
        {path === "B" && (
          <div style={{ fontSize: 12, color: "#F4C7CA", background: "rgba(218,218,219,0.08)", border: "1px solid rgba(218,218,219,0.18)", borderRadius: 8, padding: "9px 10px" }}>
            {isInstallProgramLead ? `This will use the Example Client install account for ${academyLocation} and attach the lead as a contact.` : "Person Account will be created automatically with the same name."}
          </div>
        )}
        {error ? <div style={{ fontSize: 12, color: "#F87171" }}>{error}</div> : null}
      </div>
    </ModalShell>
  );
}

export function BulkConvertLeadModal({
  count,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  count: number;
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (path: "A" | "B") => Promise<void>;
}) {
  const [path, setPath] = useState<"A" | "B">("A");
  const title = useMemo(() => `Convert ${count} lead${count === 1 ? "" : "s"}`, [count]);
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={submitting} style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-secondary)", cursor: submitting ? "not-allowed" : "pointer" }}>Cancel</button>
          <button type="button" disabled={submitting} onClick={() => onSubmit(path)} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(218,218,219,0.45)", background: "rgba(218,218,219,0.18)", color: "#F4C7CA", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Converting..." : `Convert ${count} leads ->`}
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <button type="button" onClick={() => setPath("A")} style={radioStyle(path === "A")}>
          <input type="radio" checked={path === "A"} readOnly style={{ marginTop: 2, accentColor: "#dadadb" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>All as Path A - Company</span>
        </button>
        <button type="button" onClick={() => setPath("B")} style={radioStyle(path === "B")}>
          <input type="radio" checked={path === "B"} readOnly style={{ marginTop: 2, accentColor: "#dadadb" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>All as Path B - Person</span>
        </button>
        {error ? <div style={{ fontSize: 12, color: "#F87171" }}>{error}</div> : null}
      </div>
    </ModalShell>
  );
}
