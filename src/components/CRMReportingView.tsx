"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CRMPicker } from "@/components/CRMPicker";
import { useResponsive } from "@/lib/useMediaQuery";
import type { CRMConsoleDistributionItem, CRMConsolePayload } from "@/lib/crm/consoleTypes";

type ReportingScope = "global" | "leads" | "accounts" | "opportunities" | "contacts";

const REPORTING_SCOPES: Array<{ key: ReportingScope; label: string; detail: string }> = [
  { key: "global", label: "Global CRM", detail: "Console-wide record health and backend status" },
  { key: "leads", label: "Lead reporting", detail: "Inbound status, routing, and stale lead signals" },
  { key: "accounts", label: "Account reporting", detail: "Ownership, relationship coverage, and account quality" },
  { key: "opportunities", label: "Opportunity reporting", detail: "Open pipeline, next steps, and stage health" },
  { key: "contacts", label: "Contact reporting", detail: "Owner coverage, activity freshness, and follow-up state" },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatTimestamp(value?: string): string {
  if (!value) return "Not generated";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not generated";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function CRMReportingView({
  consoleData,
  consoleLoading = false,
}: {
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialScope = REPORTING_SCOPES.some((item) => item.key === searchParams.get("report"))
    ? (searchParams.get("report") as ReportingScope)
    : "global";
  const [scope, setScope] = useState<ReportingScope>(initialScope);
  const { isMobile } = useResponsive();
  const selectedScope = REPORTING_SCOPES.find((item) => item.key === scope) ?? REPORTING_SCOPES[0];
  const healthIssueCount = useMemo(
    () => consoleData?.healthSummary.filter((item) => item.tone !== "ok").length ?? 0,
    [consoleData],
  );

  useEffect(() => {
    const reportParam = searchParams.get("report");
    if (REPORTING_SCOPES.some((item) => item.key === reportParam)) {
      setScope(reportParam as ReportingScope);
    } else {
      setScope("global");
    }
  }, [searchParams]);

  if (consoleLoading && !consoleData) {
    return <ReportingShell>Loading CRM reporting...</ReportingShell>;
  }

  if (!consoleData) {
    return (
      <ReportingShell>
        <EmptyState title="Reporting is unavailable" body="The CRM console read model did not return data. Core CRM routes should continue to work." />
      </ReportingShell>
    );
  }

  const updateScope = (nextScope: ReportingScope) => {
    setScope(nextScope);
    const params = new URLSearchParams(searchParams.toString());
    params.set("object", "reporting");
    if (nextScope === "global") params.delete("report");
    else params.set("report", nextScope);
    router.replace(`/contacts?${params.toString()}`, { scroll: false });
  };

  return (
    <ReportingShell>
      <section style={panelStyle}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 360px) 1fr", gap: 16, alignItems: "end" }}>
          <CRMPicker
            label="Report scope"
            options={REPORTING_SCOPES}
            value={scope}
            onChange={(value) => updateScope((value as ReportingScope | null) ?? "global")}
            getKey={(option) => option.key}
            getLabel={(option) => option.label}
            getSecondaryLabel={(option) => option.detail}
            searchable={false}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 750, color: "var(--color-client-text)", marginBottom: 4 }}>{selectedScope.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-client-text-muted)" }}>{selectedScope.detail}</div>
          </div>
        </div>
      </section>

      {scope === "global" ? (
        <GlobalReport data={consoleData} healthIssueCount={healthIssueCount} />
      ) : scope === "leads" ? (
        <LeadReport data={consoleData} />
      ) : scope === "accounts" ? (
        <AccountReport data={consoleData} />
      ) : scope === "opportunities" ? (
        <OpportunityReport data={consoleData} />
      ) : (
        <ContactReport data={consoleData} />
      )}
    </ReportingShell>
  );
}

function ReportingShell({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1440, margin: "0 auto" }}>{children}</div>;
}

function GlobalReport({ data, healthIssueCount }: { data: CRMConsolePayload; healthIssueCount: number }) {
  return (
    <>
      <MetricGrid>
        <Metric label="Leads" value={data.counts.leads} href="/contacts?object=leads" />
        <Metric label="Contacts" value={data.counts.contacts} href="/contacts" />
        <Metric label="Accounts" value={data.counts.accounts} href="/contacts?object=accounts" />
        <Metric label="Opportunities" value={data.counts.opportunities} href="/contacts?object=opportunities" />
        <Metric label="Open opportunities" value={data.counts.openOpportunities} href="/contacts?object=opportunities&lens=open" />
        <Metric label="Action queue" value={data.counts.queue} href="/contacts?object=queue" tone={data.counts.queue ? "watch" : "ok"} />
        <Metric label="Health issues" value={healthIssueCount} href="/contacts?object=health" tone={healthIssueCount ? "watch" : "ok"} />
        <Metric label="Console generated" value={formatTimestamp(data.generatedAt)} />
      </MetricGrid>
      <section style={panelStyle}>
        <SectionTitle title="Backend read model" detail={`${data.backend.sourceMode} / ${data.backend.readPath} / ${data.durationMs}ms`} />
        <div style={diagnosticGridStyle}>
          <Diagnostic label="Backend status" value={data.backend.status} />
          <Diagnostic label="Configured backend" value={data.backend.backend} />
          <Diagnostic label="Configured read model" value={data.backend.readModel} />
          <Diagnostic label="Console read path" value={data.diagnostics.readPath} />
          <Diagnostic label="URL configured" value={data.backend.urlConfigured ? "Yes" : "No"} />
          <Diagnostic label="Server secret configured" value={data.backend.secretConfigured ? "Yes" : "No"} />
          <Diagnostic label="Degraded sources" value={data.diagnostics.degradedSources.length ? data.diagnostics.degradedSources.join(", ") : "None"} />
        </div>
      </section>
    </>
  );
}

function LeadReport({ data }: { data: CRMConsolePayload }) {
  const report = data.reporting.leads;
  return (
    <>
      <MetricGrid>
        <Metric label="Total leads" value={report.total} href="/contacts?object=leads" />
        <Metric label="Active leads" value={report.active} href="/contacts?object=leads&lens=active" />
        <Metric label="Unassigned" value={report.unassigned} href="/contacts?object=leads&lens=unassigned" tone={report.unassigned ? "watch" : "ok"} />
        <Metric label="Stale leads" value={report.stale} href="/contacts?object=leads&lens=stale" tone={report.stale ? "risk" : "ok"} />
      </MetricGrid>
      <DistributionRow sections={[
        { title: "Status distribution", items: report.status },
        { title: "Lead type", items: report.type },
        { title: "Market", items: report.market },
        { title: "Source", items: report.source },
      ]} />
    </>
  );
}

function AccountReport({ data }: { data: CRMConsolePayload }) {
  const report = data.reporting.accounts;
  return (
    <MetricGrid>
      <Metric label="Total accounts" value={report.total} href="/contacts?object=accounts" />
      <Metric label="Missing owner" value={report.missingOwner} href="/contacts?object=accounts&lens=missing-owner" tone={report.missingOwner ? "watch" : "ok"} />
      <Metric label="Missing website/domain" value={report.missingWebsite} href="/contacts?object=accounts&lens=missing-website" tone={report.missingWebsite ? "watch" : "ok"} />
      <Metric label="No linked contacts" value={report.noLinkedContacts} href="/contacts?object=accounts&lens=no-linked-contacts" tone={report.noLinkedContacts ? "watch" : "ok"} />
      <Metric label="Strategic/enterprise" value={report.strategic} href="/contacts?object=accounts&lens=strategic" />
    </MetricGrid>
  );
}

function OpportunityReport({ data }: { data: CRMConsolePayload }) {
  const report = data.reporting.opportunities;
  return (
    <>
      <MetricGrid>
        <Metric label="Total opportunities" value={report.total} href="/contacts?object=opportunities" />
        <Metric label="Open opportunities" value={report.open} href="/contacts?object=opportunities&lens=open" />
        <Metric label="Overdue" value={report.overdue} href="/contacts?object=opportunities&lens=stale" tone={report.overdue ? "risk" : "ok"} />
        <Metric label="Missing next step" value={report.missingNextStep} href="/contacts?object=opportunities&lens=needs-next-step" tone={report.missingNextStep ? "watch" : "ok"} />
        <Metric label="Open pipeline" value={formatCurrency(report.pipelineValue)} href="/contacts?object=opportunities&lens=open" />
      </MetricGrid>
      <DistributionRow sections={[{ title: "Stage distribution", items: report.stage }]} />
    </>
  );
}

function ContactReport({ data }: { data: CRMConsolePayload }) {
  const report = data.reporting.contacts;
  return (
    <MetricGrid>
      <Metric label="Total contacts" value={report.total} href="/contacts" />
      <Metric label="Missing owner" value={report.missingOwner} href="/contacts?lens=missing-owner" tone={report.missingOwner ? "watch" : "ok"} />
      <Metric label="Stale contacts" value={report.stale} href="/contacts?lens=stale" tone={report.stale ? "watch" : "ok"} />
      <Metric label="Without account" value={report.withoutAccount} href="/contacts" tone={report.withoutAccount ? "watch" : "ok"} />
      <Metric label="Follow-up needed" value={report.followUpNeeded} href="/contacts?lens=follow-up" tone={report.followUpNeeded ? "watch" : "ok"} />
    </MetricGrid>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>{children}</section>;
}

function Metric({ label, value, href, tone = "neutral" }: { label: string; value: number | string; href?: string; tone?: "neutral" | "ok" | "watch" | "risk" }) {
  const color = tone === "ok" ? "#34D399" : tone === "watch" ? "#FBBF24" : tone === "risk" ? "#F87171" : "#93C5FD";
  const body = (
    <div style={{ ...panelStyle, minHeight: 94, borderColor: `${color}33` }}>
      <div style={{ fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)" }}>{label}</div>
      <div style={{ marginTop: 12, fontSize: 26, lineHeight: 1, fontWeight: 800, color }}>{typeof value === "number" ? formatNumber(value) : value}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{body}</Link> : body;
}

function DistributionRow({ sections }: { sections: Array<{ title: string; items: CRMConsoleDistributionItem[] }> }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      {sections.map((section) => (
        <div key={section.title} style={panelStyle}>
          <SectionTitle title={section.title} detail={`${section.items.reduce((sum, item) => sum + item.value, 0)} records`} />
          {section.items.length ? <DistributionBars items={section.items.slice(0, 8)} /> : <EmptyState title="No reportable records" body="This slice has no records with usable values yet." />}
        </div>
      ))}
    </section>
  );
}

function DistributionBars({ items }: { items: CRMConsoleDistributionItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={`${item.key}-${item.label}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: "var(--color-client-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>{formatNumber(item.value)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, height: "100%", borderRadius: 999, background: "#60A5FA" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 14, color: "var(--color-client-text)" }}>{title}</h2>
      {detail ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-client-text-muted)" }}>{detail}</p> : null}
    </div>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, color: "var(--color-client-text)" }}>{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "var(--color-client-text-muted)" }}>
      <div style={{ fontSize: 13, fontWeight: 750, color: "var(--color-client-text)" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  padding: 14,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(8,13,23,0.52)",
};

const diagnosticGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};
