"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ActionBoard } from "@/components/ActionBoard";

function ActionBoardContent() {
  return <ActionBoard />;
}

export default function ActionBoardPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <ActionBoardContent />
      </Suspense>
    </DashboardLayout>
  );
}
