"use client";

import { useMemo, useState } from "react";
import { agents } from "@/data/agents";
import { OrgChart } from "./OrgChart";

type ModuleKey =
  | "ownership-map"
  | "directory"
  | "system-status"
  | "activity-feed"
  | "bindings-channels"
  | "model-routing";

const MODULES: { key: ModuleKey; label: string; status: "live" | "scaffold" }[] = [
  { key: "ownership-map", label: "Agent Ownership Map", status: "live" },
  { key: "directory", label: "Agent Directory", status: "scaffold" },
  { key: "system-status", label: "System Status", status: "scaffold" },
  { key: "activity-feed", label: "Activity Feed", status: "scaffold" },
  { key: "bindings-channels", label: "Bindings & Channels", status: "scaffold" },
  { key: "model-routing", label: "Model Routing", status: "scaffold" },
];

export function AppShell() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("ownership-map");

  const overview = useMemo(() => {
    const blocked = agents.filter((a) => a.status === "blocked").length;
    const degraded = agents.filter((a) => a.status === "degraded").length;
    const verifiedModels = agents.filter((a) => a.provider === "OpenAI Codex").length;
    return { blocked, degraded, tracked: agents.length, verifiedModels };
  }, []);

  return (
    <div className="h-screen flex overflow-hidden mission-app-shell">
      <aside className="mission-sidebar mission-sidebar-compact">
        <div className="mission-brand-mark mission-brand-mark-large">K</div>

        <button className="mission-launcher-button" aria-label="Mission Control modules">
          <span className="mission-launcher-icon">⌘</span>
          <span className="mission-launcher-text">Modules</span>
        </button>

        <div className="mission-sidebar-stack">
          <div className="mission-sidebar-mini-card">
            <div className="mission-sidebar-mini-label">Live module</div>
            <div className="mission-sidebar-mini-value">{MODULES.find((m) => m.key === activeModule)?.label}</div>
          </div>
          <div className="mission-sidebar-mini-card">
            <div className="mission-sidebar-mini-label">Tracked</div>
            <div className="mission-sidebar-mini-value">{overview.tracked}</div>
          </div>
          <div className="mission-sidebar-mini-card">
            <div className="mission-sidebar-mini-label">Urgent</div>
            <div className="mission-sidebar-mini-value">{overview.blocked + overview.degraded}</div>
          </div>
        </div>
      </aside>

      <div className="mission-main-shell">
        <div className="mission-main-header mission-main-header-tight">
          <div>
            <div className="mission-main-eyebrow">Mission Control</div>
            <h1 className="mission-main-title">{MODULES.find((m) => m.key === activeModule)?.label}</h1>
          </div>
          <div className="mission-truth-strip">
            <span className="truth-chip truth-chip-verified">verified</span>
            <span className="truth-chip truth-chip-seeded">seeded</span>
            <span className="truth-chip truth-chip-inferred">inferred</span>
            <span className="truth-chip truth-chip-unknown">unknown</span>
          </div>
        </div>

        <div className="mission-module-switcher-row">
          {MODULES.map((module) => (
            <button
              key={module.key}
              onClick={() => setActiveModule(module.key)}
              className={`mission-module-pill ${activeModule === module.key ? "active" : ""}`}
            >
              <span>{module.label}</span>
              <span className={`mission-nav-state mission-nav-state-${module.status}`}>{module.status}</span>
            </button>
          ))}
        </div>

        <div className="mission-module-frame">
          {activeModule === "ownership-map" ? (
            <OrgChart />
          ) : (
            <ModulePlaceholder moduleKey={activeModule} />
          )}
        </div>
      </div>
    </div>
  );
}

function ModulePlaceholder({ moduleKey }: { moduleKey: ModuleKey }) {
  const copy: Record<ModuleKey, { title: string; body: string; bullets: string[] }> = {
    "ownership-map": {
      title: "Agent Ownership Map",
      body: "Live module. Current org graph work now sits here as one Mission Control section rather than the whole app.",
      bullets: ["Graph retained as sub-tool", "Truth-state labels preserved", "Ready for relationship intelligence later"],
    },
    directory: {
      title: "Agent Directory",
      body: "Structured list/grid of all agents with role, owner, model routing, and operating status.",
      bullets: ["Directory view scaffolded", "Will support filtering + verification badges", "Intended to become primary browse surface"],
    },
    "system-status": {
      title: "System Status",
      body: "Top-level health layer for agent count, degraded/blocked systems, active sessions, and incident visibility.",
      bullets: ["Scaffold only", "Next step: real health counters", "Will replace invented summary logic"],
    },
    "activity-feed": {
      title: "Activity Feed",
      body: "Recent system events: replies, failures, escalations, and configuration changes with trust labels.",
      bullets: ["Scaffold only", "Will unify agent actions into one timeline", "Needs verified event sourcing"],
    },
    "bindings-channels": {
      title: "Bindings & Channels",
      body: "Centralized view of real channel bindings, account identities, mention rules, and operational surfaces.",
      bullets: ["Scaffold only", "No fabricated emails or fake bindings", "Will map to real configured identities only"],
    },
    "model-routing": {
      title: "Model Routing",
      body: "Actual configured and active model paths per agent with verification state and routing health.",
      bullets: ["Scaffold only", "OpenAI Codex verification should appear here", "Wrong model labels removed"],
    },
  };

  const data = copy[moduleKey];
  return (
    <div className="module-placeholder">
      <div className="module-placeholder-card">
        <div className="module-placeholder-eyebrow">Scaffold</div>
        <h2>{data.title}</h2>
        <p>{data.body}</p>
        <ul>
          {data.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
