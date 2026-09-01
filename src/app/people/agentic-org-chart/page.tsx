"use client";

import { Suspense } from "react";
import { AgenticOrgChart } from "@/components/AgenticOrgChart";

export default function AgenticOrgChartPage() {
  return (
    <Suspense fallback={null}>
      <AgenticOrgChart />
    </Suspense>
  );
}
