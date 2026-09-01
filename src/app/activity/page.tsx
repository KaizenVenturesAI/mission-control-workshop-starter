"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { ActivityFeed } from "@/components/ActivityFeed";

export default function ActivityPage() {
  return (
    <DashboardLayout>
      <ActivityFeed />
    </DashboardLayout>
  );
}
