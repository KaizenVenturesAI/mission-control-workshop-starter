// ── Dev Log Data Model ───────────────────────────────────────────────────

export type SprintStatus = "completed" | "in-progress" | "planned" | "blocked" | "review";
export type ProjectStatus = "active" | "completed" | "paused";

export interface SprintEntry {
  id: string;
  name: string;
  date: string;
  day: string; // ISO date for grouping, e.g. "2026-03-28"
  status: SprintStatus;
  completionPct: number; // 0-100
  projectedCompletion: string; // e.g. "Delivered", "Today", "This week"
  summary: string;
  keyChanges: string[];
  architectureNotes?: string;
  trustNotes?: string;
  blockers?: string;
  contributors: string[];
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  channel: string;
  contributors: string[];
  status: ProjectStatus;
  lastUpdated: string;
  sprints: SprintEntry[];
}

// ── Seed Data ────────────────────────────────────────────────────────────

export const PROJECTS: Project[] = [];
