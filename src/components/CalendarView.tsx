"use client";

import { useState, useMemo } from "react";
import { AsteriskNote } from "@/components/ProvenanceSystem";

interface CronJob {
  id: string;
  name: string;
  agent: string;
  color: string;
  schedule: { type: "recurring"; startHour: number; startMin: number; endHour?: number; intervalMin?: number } | { type: "once"; hour: number; min: number };
  days: number[]; // 0=Sun, 1=Mon, ...6=Sat
}

const CRON_JOBS: CronJob[] = [
  { id: "c1", name: "Mission Agent heartbeat", agent: "Example Client Mission Agent", color: "#dadadb", schedule: { type: "recurring", startHour: 7, startMin: 0, endHour: 23, intervalMin: 60 }, days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "c2", name: "Mission Control lead check", agent: "Delivery / Install Agent", color: "#60A5FA", schedule: { type: "recurring", startHour: 7, startMin: 0, endHour: 21, intervalMin: 60 }, days: [1, 2, 3, 4, 5] },
  { id: "c3", name: "Daily briefing", agent: "Executive Assistant Agent", color: "#A78BFA", schedule: { type: "once", hour: 7, min: 0 }, days: [1, 2, 3, 4, 5] },
  { id: "c4", name: "Weather check", agent: "Operations Agent", color: "#34D399", schedule: { type: "once", hour: 6, min: 30 }, days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "c5", name: "Email digest", agent: "Example Client Mission Agent", color: "#dadadb", schedule: { type: "once", hour: 8, min: 0 }, days: [1, 2, 3, 4, 5] },
  { id: "c6", name: "Partnership pipeline sync", agent: "Sales Follow-Up Agent", color: "#f0a030", schedule: { type: "once", hour: 9, min: 0 }, days: [1, 3, 5] },
  { id: "c7", name: "Social media scheduler", agent: "Marketing Agent", color: "#60A5FA", schedule: { type: "once", hour: 10, min: 0 }, days: [1, 2, 3, 4, 5] },
  { id: "c8", name: "End-of-day summary", agent: "Example Client Mission Agent", color: "#dadadb", schedule: { type: "once", hour: 18, min: 0 }, days: [1, 2, 3, 4, 5] },
  { id: "c9", name: "Dev Log update", agent: "Example Client Mission Agent", color: "#dadadb", schedule: { type: "once", hour: 23, min: 59 }, days: [0, 1, 2, 3, 4, 5, 6] },

];

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CalendarView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);

  const today = new Date();
  const weekStart = useMemo(() => {
    const ws = getWeekStart(today);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const getJobsForDayHour = (dayIndex: number, hour: number): CronJob[] => {
    const dayOfWeek = weekDays[dayIndex].getDay();
    return CRON_JOBS.filter(job => {
      if (!job.days.includes(dayOfWeek)) return false;
      if (job.schedule.type === "once") {
        return job.schedule.hour === hour;
      } else {
        const s = job.schedule;
        return hour >= s.startHour && hour < (s.endHour ?? s.startHour + 1);
      }
    });
  };

  return (
    <div className="fade-in-up" style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Schedule
        </span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.03em", marginBottom: 6 }}>
        Calendar
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-client-text-secondary)", marginBottom: 20 }}>
        Weekly view of scheduled cron jobs and recurring agent tasks.
      </p>

      {/* Navigation */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-client-border)", color: "var(--color-client-text-secondary)", fontSize: 12, cursor: "pointer" }}
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={{ padding: "6px 14px", borderRadius: 8, background: weekOffset === 0 ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.04)", border: "1px solid", borderColor: weekOffset === 0 ? "rgba(96,165,250,0.3)" : "var(--color-client-border)", color: weekOffset === 0 ? "var(--color-client-blue)" : "var(--color-client-text-secondary)", fontSize: 12, cursor: "pointer" }}
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-client-border)", color: "var(--color-client-text-secondary)", fontSize: 12, cursor: "pointer" }}
          >
            Next →
          </button>
        </div>
        <span style={{ fontSize: 14, color: "var(--color-client-text)", fontWeight: 500 }}>
          {formatDate(weekDays[0])} — {formatDate(weekDays[6])}
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3" style={{ marginBottom: 16 }}>
        {CRON_JOBS.map(job => (
          <div
            key={job.id}
            className="flex items-center gap-2"
            style={{ fontSize: 10, color: "var(--color-client-text-secondary)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: job.color, flexShrink: 0 }} />
            {job.name}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{ overflowX: "auto", border: "1px solid var(--color-client-border)", borderRadius: 14 }}>
        <div style={{ minWidth: 900 }}>
          {/* Day Headers */}
          <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", borderBottom: "1px solid var(--color-client-border)" }}>
            <div style={{ padding: "10px 8px", fontSize: 10, color: "var(--color-client-text-dim)" }} />
            {weekDays.map((day, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 8px",
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: isToday(day) ? "var(--color-client-blue)" : "var(--color-client-text-secondary)",
                  background: isToday(day) ? "rgba(96,165,250,0.06)" : "transparent",
                  borderLeft: "1px solid var(--color-client-border)",
                }}
              >
                <div>{DAY_NAMES[day.getDay()]}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: isToday(day) ? "var(--color-client-blue)" : "var(--color-client-text)", marginTop: 2 }}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>

          {/* Hour Rows */}
          {HOURS.map(hour => (
            <div
              key={hour}
              style={{
                display: "grid",
                gridTemplateColumns: "60px repeat(7, 1fr)",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                minHeight: 44,
              }}
            >
              <div style={{ padding: "6px 8px", fontSize: 10, color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </div>
              {weekDays.map((day, dayIdx) => {
                const jobs = getJobsForDayHour(dayIdx, hour);
                return (
                  <div
                    key={dayIdx}
                    style={{
                      borderLeft: "1px solid var(--color-client-border)",
                      padding: "3px 4px",
                      background: isToday(day) ? "rgba(96,165,250,0.02)" : "transparent",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {jobs.map(job => (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        style={{
                          padding: "3px 6px",
                          borderRadius: 5,
                          background: `${job.color}18`,
                          borderLeft: `2px solid ${job.color}`,
                          fontSize: 9,
                          color: job.color,
                          cursor: "pointer",
                          lineHeight: 1.3,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {job.name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div
          onClick={() => setSelectedJob(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
          className="backdrop-enter"
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--color-client-surface)", border: "1px solid var(--color-client-border)", borderRadius: 16, padding: 28, maxWidth: 420, width: "100%" }}
            className="drawer-enter"
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-3">
                <span style={{ width: 10, height: 10, borderRadius: 4, background: selectedJob.color }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-client-text)" }}>{selectedJob.name}</h2>
              </div>
              <button onClick={() => setSelectedJob(null)} style={{ fontSize: 18, color: "var(--color-client-text-dim)", background: "none", border: "none", cursor: "pointer" }}>×</button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Agent</span>
                <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>{selectedJob.agent}</span>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Schedule</span>
                <span style={{ fontSize: 13, color: "var(--color-client-text)", fontFamily: "var(--font-mono)" }}>
                  {selectedJob.schedule.type === "once"
                    ? `${selectedJob.schedule.hour.toString().padStart(2, "0")}:${selectedJob.schedule.min.toString().padStart(2, "0")} daily`
                    : `Every ${selectedJob.schedule.intervalMin}min, ${selectedJob.schedule.startHour}:00–${selectedJob.schedule.endHour}:00`
                  }
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Days</span>
                <div className="flex gap-2">
                  {DAY_NAMES.map((name, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "3px 6px",
                        borderRadius: 5,
                        fontSize: 10,
                        background: selectedJob.days.includes(i) ? `${selectedJob.color}20` : "rgba(255,255,255,0.03)",
                        color: selectedJob.days.includes(i) ? selectedJob.color : "var(--color-client-text-dim)",
                        border: `1px solid ${selectedJob.days.includes(i) ? `${selectedJob.color}30` : "rgba(255,255,255,0.05)"}`,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", width: 70 }}>Type</span>
                <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>
                  {selectedJob.schedule.type === "once" ? "Scheduled (once daily)" : "Recurring interval"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.08)" }}>
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          This module contains placeholder/seeded content. Schedule data is based on configured cron definitions.
        </span>
      </div>
      <AsteriskNote />
    </div>
  );
}
