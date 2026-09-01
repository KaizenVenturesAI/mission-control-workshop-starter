"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { RevenueDashboard } from "@/modules/revenue/RevenueDashboard";

export default function RevenuePage() {
  return (
    <DashboardLayout>
      <RevenueDashboard />
    </DashboardLayout>
  );
}
