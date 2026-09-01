"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactsView } from "@/components/ContactsView";
import { AccountsView } from "@/components/AccountsView";
import { OpportunitiesView } from "@/components/OpportunitiesView";
import { InboundLeadsDashboard } from "@/modules/revenue/InboundLeadsDashboard";
import { CRMSearchBar } from "@/components/CRMSearchBar";
import { CRMActivityFeed } from "@/components/CRMActivityFeed";
import { DuplicatesView } from "@/components/DuplicatesView";
import { AuditLogView } from "@/components/AuditLogView";
import { CRMShell, type CRMObject } from "@/components/CRMShell";
import { CRMHealthView } from "@/components/CRMHealthView";
import { BDIntakeView } from "@/components/BDIntakeView";
import { CRMReportingView } from "@/components/CRMReportingView";
import { useCRMConsoleData } from "@/lib/crm/useCRMConsoleData";

function CRMPageInner() {
  const searchParams = useSearchParams();
  const [activeObject, setActiveObject] = useState<CRMObject>("contacts");
  const { data: consoleData, loading: consoleLoading, refresh: refreshConsoleData } = useCRMConsoleData();

  useEffect(() => {
    const obj = searchParams.get("object");
    if (
      obj === "leads" ||
      obj === "accounts" ||
      obj === "opportunities" ||
      obj === "bd" ||
      obj === "queue" ||
      obj === "health" ||
      obj === "reporting" ||
      obj === "duplicates" ||
      obj === "audit"
    ) {
      setActiveObject(obj);
    } else {
      setActiveObject("contacts");
    }
  }, [searchParams]);

  const counts = useMemo<Partial<Record<CRMObject, number>>>(() => {
    if (!consoleData) return {};
    return {
      leads: consoleData.counts.leads,
      contacts: consoleData.counts.contacts,
      accounts: consoleData.counts.accounts,
      opportunities: consoleData.counts.opportunities,
      bd: consoleData.counts.bdDrafts,
      queue: consoleData.counts.queue,
      health: consoleData.healthSummary.filter((item) => item.tone !== "ok").length,
      reporting: consoleData.healthSummary.filter((item) => item.tone !== "ok").length,
    };
  }, [consoleData]);

  return (
    <DashboardLayout>
      <div className="mission-crm-fullscreen" style={{ width: "100%", maxWidth: "none" }}>
        <CRMSearchBar consoleData={consoleData ?? undefined} consoleLoading={consoleLoading} />
        <CRMActivityFeed consoleData={consoleData ?? undefined} consoleLoading={consoleLoading} />
        <CRMShell activeObject={activeObject} counts={counts}>
          {activeObject === "leads" ? (
            <InboundLeadsDashboard />
          ) : activeObject === "contacts" ? (
            <ContactsView
              consoleData={consoleData ?? undefined}
              consoleLoading={consoleLoading}
              onConsoleRefresh={refreshConsoleData}
            />
          ) : activeObject === "accounts" ? (
            <AccountsView
              embedded
              consoleData={consoleData ?? undefined}
              consoleLoading={consoleLoading}
              onConsoleRefresh={refreshConsoleData}
            />
          ) : activeObject === "bd" ? (
            <BDIntakeView />
          ) : activeObject === "duplicates" ? (
            <DuplicatesView />
          ) : activeObject === "audit" ? (
            <AuditLogView />
          ) : activeObject === "queue" ? (
            <CRMHealthView mode="queue" consoleData={consoleData ?? undefined} consoleLoading={consoleLoading} />
          ) : activeObject === "health" ? (
            <CRMHealthView mode="health" consoleData={consoleData ?? undefined} consoleLoading={consoleLoading} />
          ) : activeObject === "reporting" ? (
            <CRMReportingView consoleData={consoleData ?? undefined} consoleLoading={consoleLoading} />
          ) : (
            <OpportunitiesView
              embedded
              consoleData={consoleData ?? undefined}
              consoleLoading={consoleLoading}
              onConsoleRefresh={refreshConsoleData}
            />
          )}
        </CRMShell>
      </div>
    </DashboardLayout>
  );
}

export default function ContactsPage() {
  return (
    <Suspense>
      <CRMPageInner />
    </Suspense>
  );
}
