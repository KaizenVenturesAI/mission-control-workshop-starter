"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ClientMeetings } from "@/components/ClientMeetings";
import { StrategyRuns } from "@/components/StrategyRuns";

function StrategyPageContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "meetings" ? "meetings" : "board";

  return (
    <>
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          marginBottom: 20,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--color-client-border)",
          borderRadius: 999,
        }}
      >
        <Link href="/strategy?tab=board" scroll={false} style={getTabStyle(tab === "board")}>
          Weekly Strategy Review
        </Link>
        <Link href="/strategy?tab=meetings" scroll={false} style={getTabStyle(tab === "meetings")}>
          Example Client Meetings
        </Link>
      </div>

      {tab === "meetings" ? <ClientMeetings /> : <StrategyRuns />}
    </>
  );
}

function getTabStyle(active: boolean) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 999,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 600,
    color: active ? "rgba(247,248,248,0.96)" : "var(--color-client-text-secondary)",
    background: active ? "rgba(218,218,219,0.16)" : "transparent",
    border: active ? "1px solid rgba(218,218,219,0.32)" : "1px solid transparent",
    boxShadow: active ? "inset 0 0 0 1px rgba(247,248,248,0.06), 0 0 18px rgba(218,218,219,0.14)" : "none",
  } satisfies React.CSSProperties;
}

export default function StrategyPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <StrategyPageContent />
      </Suspense>
    </DashboardLayout>
  );
}
