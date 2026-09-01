"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TaskBoard } from "@/components/TaskBoard";

export default function TasksPage() {
  return (
    <DashboardLayout>
      <TaskBoard />
    </DashboardLayout>
  );
}
