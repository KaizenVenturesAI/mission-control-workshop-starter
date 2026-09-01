"use client";

import { useState, useEffect, useCallback } from "react";
import { AsteriskNote } from "@/components/ProvenanceSystem";

type Priority = "critical" | "high" | "medium" | "low";
type ColumnId = "planning" | "inbox" | "assigned" | "in-progress" | "testing" | "review" | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  assigneeColor: string;
  priority: Priority;
  column: ColumnId;
  createdDate: string;
}

const COLUMNS: { id: ColumnId; label: string; accent?: string; accentBg?: string; accentBorder?: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "inbox", label: "Inbox" },
  { id: "assigned", label: "Assigned" },
  {
    id: "in-progress",
    label: "In Progress",
    accent: "#FBBF24",
    accentBg: "rgba(251,191,36,0.06)",
    accentBorder: "rgba(251,191,36,0.24)",
  },
  { id: "testing", label: "Testing" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; color: string }> = {
  critical: { label: "Critical", bg: "rgba(218,218,219,0.15)", color: "#dadadb" },
  high: { label: "High", bg: "rgba(240,160,48,0.15)", color: "#f0a030" },
  medium: { label: "Medium", bg: "rgba(96,165,250,0.15)", color: "#60A5FA" },
  low: { label: "Low", bg: "rgba(85,85,106,0.15)", color: "#8888a0" },
};

const AGENT_COLORS: Record<string, string> = {
  "Sales Follow-Up Agent": "#dadadb",
  "Delivery / Install Agent": "#60A5FA",
  "Strategy Review Agent": "#34D399",
  "Engineering Agent": "#f0a030",
  "Example Client Mission Agent": "#dadadb",
  "Marketing Agent": "#60A5FA",
  "Operations Agent": "#34D399",
};

const SEED_TASKS: Task[] = [
  { id: "t1", title: "Review active referral opportunities", description: "Evaluate partner fit, next action, and owner for warm AI operating-system referrals.", assignee: "Sales Follow-Up Agent", assigneeColor: AGENT_COLORS["Sales Follow-Up Agent"], priority: "high", column: "in-progress", createdDate: "Mar 24, 2026" },
  { id: "t2", title: "Prepare Example Client install checklist", description: "Confirm tools, permissions, training agenda, and handoff artifacts for the next client sprint.", assignee: "Delivery / Install Agent", assigneeColor: AGENT_COLORS["Delivery / Install Agent"], priority: "medium", column: "review", createdDate: "Mar 23, 2026" },
  { id: "t3", title: "Draft weekly strategy review", description: "Summarize pipeline movement, blocked follow-ups, agent status, and decisions needed from Alex.", assignee: "Strategy Review Agent", assigneeColor: AGENT_COLORS["Strategy Review Agent"], priority: "high", column: "planning", createdDate: "Mar 25, 2026" },
  { id: "t4", title: "Fix Mission Control SSR bug", description: "Resolve server-side rendering hydration mismatch on agent detail drawer component.", assignee: "Engineering Agent", assigneeColor: AGENT_COLORS["Engineering Agent"], priority: "critical", column: "done", createdDate: "Mar 20, 2026" },
  { id: "t5", title: "Scope Mission Control build offer", description: "Turn current Example Client dashboard patterns into a repeatable client Mission Control package.", assignee: "Delivery / Install Agent", assigneeColor: AGENT_COLORS["Delivery / Install Agent"], priority: "medium", column: "inbox", createdDate: "Mar 26, 2026" },
  { id: "t6", title: "Update Example Client knowledge base", description: "Add new SOPs, update agent capability docs, and refresh partnership playbooks.", assignee: "Example Client Mission Agent", assigneeColor: AGENT_COLORS["Example Client Mission Agent"], priority: "medium", column: "in-progress", createdDate: "Mar 22, 2026" },
  { id: "t7", title: "Prepare Founders Club workshop deck", description: "Design presentation deck for upcoming Founders Club agentic systems workshop event.", assignee: "Marketing Agent", assigneeColor: AGENT_COLORS["Marketing Agent"], priority: "high", column: "assigned", createdDate: "Mar 25, 2026" },
  { id: "t8", title: "Audit agent permissions matrix", description: "Review and document current agent access levels, channel bindings, and escalation paths.", assignee: "Example Client Mission Agent", assigneeColor: AGENT_COLORS["Example Client Mission Agent"], priority: "low", column: "planning", createdDate: "Mar 26, 2026" },
  { id: "t9", title: "Document Mac mini install bottlenecks", description: "Capture setup steps that slow down client installs and identify what can be templatized safely.", assignee: "Operations Agent", assigneeColor: AGENT_COLORS["Operations Agent"], priority: "medium", column: "testing", createdDate: "Mar 21, 2026" },
  { id: "t10", title: "Publish install-night follow-up assets", description: "Prepare post-event follow-up copy, CRM tagging, and offer routing for OpenClaw install nights.", assignee: "Marketing Agent", assigneeColor: AGENT_COLORS["Marketing Agent"], priority: "high", column: "assigned", createdDate: "Mar 24, 2026" },
];

const STORAGE_KEY = "client-mc-tasks";

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [movingTask, setMovingTask] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setTasks(JSON.parse(stored)); } catch { setTasks(SEED_TASKS); }
    } else {
      setTasks(SEED_TASKS);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, mounted]);

  const moveTask = useCallback((taskId: string, newColumn: ColumnId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column: newColumn } : t));
    setMovingTask(null);
  }, []);

  const allAgents = [...new Set(SEED_TASKS.map(t => t.assignee))];

  const filteredTasks = filterAgent ? tasks.filter(t => t.assignee === filterAgent) : tasks;

  if (!mounted) return null;

  return (
    <div className="fade-in-up" style={{ maxWidth: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Task Management
        </span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.03em" }}>
          Task Board
        </h1>
        <button
          onClick={() => setShowNewForm(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(96,165,250,0.2), rgba(167,139,250,0.2))",
            border: "1px solid rgba(96,165,250,0.3)",
            color: "var(--color-client-blue)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New Task
        </button>
      </div>
      <p style={{ fontSize: 14, color: "var(--color-client-text-secondary)", marginBottom: 20 }}>
        Click a task to view details. Use the move button to change columns.
      </p>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 20 }}>
        <button
          onClick={() => setFilterAgent(null)}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: 11,
            border: "1px solid",
            borderColor: !filterAgent ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)",
            background: !filterAgent ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.03)",
            color: !filterAgent ? "var(--color-client-blue)" : "var(--color-client-text-secondary)",
            cursor: "pointer",
          }}
        >
          All
        </button>
        {allAgents.map(agent => (
          <button
            key={agent}
            onClick={() => setFilterAgent(filterAgent === agent ? null : agent)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 11,
              border: "1px solid",
              borderColor: filterAgent === agent ? `${AGENT_COLORS[agent]}60` : "rgba(255,255,255,0.08)",
              background: filterAgent === agent ? `${AGENT_COLORS[agent]}18` : "rgba(255,255,255,0.03)",
              color: filterAgent === agent ? AGENT_COLORS[agent] : "var(--color-client-text-secondary)",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: AGENT_COLORS[agent], marginRight: 6 }} />
            {agent}
          </button>
        ))}
      </div>

      {/* Kanban Board */}
      <div style={{ overflowX: "auto", paddingBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, minWidth: COLUMNS.length * 220 }}>
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.column === col.id);
            return (
              <div
                key={col.id}
                style={{
                  flex: 1,
                  minWidth: 200,
                  background: col.accentBg ?? "rgba(255,255,255,0.02)",
                  border: `1px solid ${col.accentBorder ?? "var(--color-client-border)"}`,
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: col.accent ?? "var(--color-client-text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)" }}>
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {colTasks.map(task => (
                    <div key={task.id}>
                      <div
                        onClick={() => setSelectedTask(task)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 10,
                          background: "var(--color-client-card)",
                          border: "1px solid var(--color-client-border)",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(96,165,250,0.3)")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-client-border)")}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 6, lineHeight: 1.4 }}>
                          {task.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 10, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {task.description}
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: task.assigneeColor, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: "var(--color-client-text-secondary)" }}>{task.assignee}</span>
                          </div>
                          <span style={{
                            padding: "2px 7px",
                            borderRadius: 999,
                            fontSize: 9,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            background: PRIORITY_CONFIG[task.priority].bg,
                            color: PRIORITY_CONFIG[task.priority].color,
                          }}>
                            {PRIORITY_CONFIG[task.priority].label}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: "var(--color-client-text-dim)", marginTop: 6 }}>{task.createdDate}</div>
                      </div>
                      {/* Move buttons */}
                      {movingTask === task.id && (
                        <div style={{ padding: "6px 0", display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {COLUMNS.filter(c => c.id !== task.column).map(c => (
                            <button
                              key={c.id}
                              onClick={() => moveTask(task.id, c.id)}
                              style={{
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 9,
                                background: "rgba(96,165,250,0.08)",
                                border: "1px solid rgba(96,165,250,0.2)",
                                color: "var(--color-client-blue)",
                                cursor: "pointer",
                              }}
                            >
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setMovingTask(movingTask === task.id ? null : task.id); }}
                        style={{
                          width: "100%",
                          padding: "4px",
                          marginTop: 4,
                          borderRadius: 6,
                          fontSize: 9,
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.06)",
                          color: "var(--color-client-text-dim)",
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        {movingTask === task.id ? "Cancel" : "Move →"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.08)" }}>
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          This module contains placeholder/seeded content. Tasks are stored locally and not synced to external systems.
        </span>
      </div>
      <AsteriskNote />

      {/* Task Detail Modal */}
      {selectedTask && (
        <div
          onClick={() => setSelectedTask(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          className="backdrop-enter"
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--color-client-surface)",
              border: "1px solid var(--color-client-border)",
              borderRadius: 16,
              padding: 28,
              maxWidth: 520,
              width: "100%",
            }}
            className="drawer-enter"
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: PRIORITY_CONFIG[selectedTask.priority].bg,
                color: PRIORITY_CONFIG[selectedTask.priority].color,
              }}>
                {selectedTask.priority}
              </span>
              <button onClick={() => setSelectedTask(null)} style={{ fontSize: 18, color: "var(--color-client-text-dim)", background: "none", border: "none", cursor: "pointer" }}>×</button>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 12 }}>{selectedTask.title}</h2>
            <p style={{ fontSize: 13, color: "var(--color-client-text-secondary)", lineHeight: 1.7, marginBottom: 20 }}>{selectedTask.description}</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Assignee</span>
                <div className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedTask.assigneeColor }} />
                  <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>{selectedTask.assignee}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Status</span>
                <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>{COLUMNS.find(c => c.id === selectedTask.column)?.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Created</span>
                <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>{selectedTask.createdDate}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {showNewForm && <NewTaskForm onClose={() => setShowNewForm(false)} onAdd={(task) => { setTasks(prev => [...prev, task]); setShowNewForm(false); }} />}
    </div>
  );
}

function NewTaskForm({ onClose, onAdd }: { onClose: () => void; onAdd: (task: Task) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("Example Client Mission Agent");
  const [priority, setPriority] = useState<Priority>("medium");
  const [column, setColumn] = useState<ColumnId>("inbox");

  const allAgents = Object.keys(AGENT_COLORS);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      id: `t-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      assignee,
      assigneeColor: AGENT_COLORS[assignee] || "#8888a0",
      priority,
      column,
      createdDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--color-client-border)",
    color: "var(--color-client-text)",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
      className="backdrop-enter"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--color-client-surface)", border: "1px solid var(--color-client-border)", borderRadius: 16, padding: 28, maxWidth: 480, width: "100%" }}
        className="drawer-enter"
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-client-text)" }}>New Task</h2>
          <button onClick={onClose} style={{ fontSize: 18, color: "var(--color-client-text-dim)", background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Task description..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Assignee</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)} style={{ ...inputStyle, cursor: "pointer" }}>
                {(["critical", "high", "medium", "low"] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Column</label>
              <select value={column} onChange={e => setColumn(e.target.value as ColumnId)} style={{ ...inputStyle, cursor: "pointer" }}>
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: title.trim() ? "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(167,139,250,0.25))" : "rgba(255,255,255,0.04)",
              border: "1px solid",
              borderColor: title.trim() ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)",
              color: title.trim() ? "var(--color-client-blue)" : "var(--color-client-text-dim)",
              fontSize: 13,
              fontWeight: 600,
              cursor: title.trim() ? "pointer" : "not-allowed",
            }}
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
