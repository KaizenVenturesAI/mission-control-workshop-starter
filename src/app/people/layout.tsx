"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";

const HR_TABS = [
  { label: "Org Chart", icon: "👥", path: "/people" },
  { label: "Agentic Org Chart", icon: "⊞", path: "/people/agentic-org-chart" },
  { label: "Performance Reviews", icon: "📊", path: "/people/performance-reviews" },
  { label: "Compensation", icon: "💰", path: "/people/compensation" },
  { label: "Payroll", icon: "🧾", path: "/people/payroll" },
];

export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <DashboardLayout>
      {/* HR Section Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em", margin: 0 }}>HR</h1>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>People, performance, and compensation management</p>
      </div>

      {/* Sub-navigation tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, padding: 4, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", width: "fit-content" }}>
        {HR_TABS.map((tab) => {
          const active = pathname === tab.path;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              scroll={false}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: active ? "1px solid rgba(96,165,250,0.2)" : "1px solid transparent",
                background: active ? "rgba(96,165,250,0.1)" : "transparent",
                color: active ? "#93c5fd" : "rgba(255,255,255,0.5)",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 13 }}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Active section content */}
      {children}
    </DashboardLayout>
  );
}
