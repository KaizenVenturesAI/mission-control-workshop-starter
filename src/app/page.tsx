"use client";

import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/DashboardLayout";

/* recharts uses browser-only APIs (window.ResizeObserver, etc.)
   Dynamic import with ssr:false prevents hydration crash on mobile/SSR */
const DashboardHome = dynamic(
  () =>
    import("@/components/DashboardHome").then((mod) => mod.DashboardHome),
  { ssr: false }
);

export default function Home() {
  return (
    <DashboardLayout>
      <DashboardHome />
    </DashboardLayout>
  );
}
