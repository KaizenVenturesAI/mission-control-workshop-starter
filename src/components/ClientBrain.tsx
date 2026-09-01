"use client";

import { useEffect, useMemo, useState } from "react";

type Evidence = {
  sourceId: string | null;
  sourceTitle: string;
  sourceDate: string | null;
  sourceType: string | null;
  quote: string | null;
  confidence: number | null;
};

type ReviewItem = {
  id: string;
  recordType: "claim" | "decision" | "risk" | "promise";
  text: string;
  domain: string;
  priority: string;
  confidence: number;
  source: string;
  evidence?: Evidence;
};

type BrainOverview = {
  managerBrief: {
    title: string;
    posture: string;
    headline: string;
    recommendedFocus: string;
  };
  decisionInbox: Array<{
    id: string;
    kind: "contradiction" | "memory_review";
    recordType?: "claim" | "decision" | "risk" | "promise";
    title: string;
    domain: string;
    severity: string;
    businessImpact: string;
    decisionNeeded: string;
    recommendedAction: string;
    evidence: string;
  }>;
  readiness: Array<{
    id: string;
    name: string;
    domain: string;
    score: number;
    status: string;
    blockers: string[];
    nextBestAction: string;
    counts: { decisions: number; risks: number; promises: number; contradictions: number; candidates: number };
  }>;
  entityProfiles: Array<{
    id: string;
    name: string;
    type: string;
    domain: string;
    summary: string;
    facts: string[];
    decisions: string[];
    risks: string[];
    promises: string[];
    contradictions: string[];
    lastSource: string | null;
  }>;
  memoryDiff: {
    window: string;
    headline: string;
    sources: Array<{ id: string; title: string; date: string; type: string }>;
    decisions: Array<{ id: string; text: string; domain: string; trust: string }>;
    risks: Array<{ id: string; text: string; domain: string; severity: string }>;
    promises: Array<{ id: string; text: string; domain: string; status: string }>;
    contradictions: Array<{ id: string; title: string; domain: string; question: string | null }>;
  };
  obsidianExport: {
    defaultOutputDir: string;
    mapOfMapsPath: string;
    strategy: string;
  };
  recentSourceDocuments: Array<{ id: string; source_type: string; title: string; processed_status: string; processed_at: string | null }>;
  contradictions: Array<{ id: string; title: string; description: string; domain: string; severity: string; recommended_resolution: string | null; managerial_question: string | null; evidence_summary: string | null }>;
  compiledPages: Array<{ id: string; title: string; domain: string; freshness_status: string; last_generated_at: string; markdown: string; summary: string }>;
  contextPacks: Array<{ id: string; name: string; audience: string; domain: string; token_budget: number; freshness_status: string; last_generated_at: string; markdown: string }>;
  reviewQueue: ReviewItem[];
  counts: Record<string, number>;
};

const domains = ["all", "leadership", "pipeline", "install_program", "mission_control_builds", "referral_partnerships", "marketing", "finance", "agent_ops", "systems"];
const modes = [
  { value: "approved_only", label: "Approved only" },
  { value: "approved_plus_candidate", label: "Approved + candidate" },
  { value: "contradiction_mode", label: "Contradictions" },
  { value: "raw_evidence", label: "Raw evidence" },
];

const shell: React.CSSProperties = { display: "grid", gap: 18, color: "var(--color-client-text)" };
const card: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
  padding: 16,
  minWidth: 0,
  boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
};
const quietCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  background: "rgba(0,0,0,0.16)",
  padding: 14,
  minWidth: 0,
};
const button: React.CSSProperties = {
  minHeight: 34,
  borderRadius: 7,
  border: "1px solid rgba(96,165,250,0.34)",
  background: "rgba(96,165,250,0.16)",
  color: "#DCEBFF",
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
const ghostButton: React.CSSProperties = {
  ...button,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.82)",
};

function formatDomain(domain: string): string {
  return domain.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", minute: "2-digit" });
}

function toneFor(value: string): "danger" | "warn" | "good" | "neutral" {
  if (["critical", "high", "rejected", "Not ready yet"].includes(value)) return "danger";
  if (["medium", "Needs decisions", "Mostly ready", "candidate"].includes(value)) return "warn";
  if (["fresh", "approved", "Ready to use"].includes(value)) return "good";
  return "neutral";
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "danger" | "warn" | "good" | "neutral" }) {
  const styles = {
    danger: { color: "#fecaca", background: "rgba(239,68,68,0.13)" },
    warn: { color: "#fde68a", background: "rgba(245,158,11,0.12)" },
    good: { color: "#bbf7d0", background: "rgba(34,197,94,0.12)" },
    neutral: { color: "rgba(255,255,255,0.72)", background: "rgba(255,255,255,0.07)" },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", minHeight: 24, borderRadius: 999, padding: "0 9px", fontSize: 11, fontWeight: 700, ...styles }}>{children}</span>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.2 }}>{title}</h2>
      {subtitle ? <p style={{ margin: 0, color: "var(--color-client-text-secondary)", fontSize: 13 }}>{subtitle}</p> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: "var(--color-client-text-dim)", fontSize: 13, padding: "12px 0" }}>{text}</div>;
}

function ProgressBar({ score }: { score: number }) {
  const tone = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
      <div style={{ width: `${Math.max(4, Math.min(100, score))}%`, height: "100%", background: tone }} />
    </div>
  );
}

export function ClientBrain() {
  const [overview, setOverview] = useState<BrainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"decisions" | "readiness" | "profiles" | "changes" | "review" | "artifacts" | "maps">("decisions");
  const [question, setQuestion] = useState("What decision should I make next?");
  const [domain, setDomain] = useState("all");
  const [mode, setMode] = useState("approved_plus_candidate");
  const [queryResult, setQueryResult] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ title: string; markdown: string } | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [exportResult, setExportResult] = useState<{ outputDir: string; fileCount: number; generatedAt: string } | null>(null);

  async function refresh() {
    setLoading(true);
    const response = await fetch("/api/brain/overview", { cache: "no-store" });
    setOverview(await response.json());
    setLoading(false);
  }

  async function runAction(name: string, url: string, body?: unknown) {
    setBusy(name);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (result.page) setPreview({ title: result.page.title, markdown: result.page.markdown });
    if (result.pack) setPreview({ title: result.pack.name, markdown: result.pack.markdown });
    if (result.outputDir) setExportResult({ outputDir: result.outputDir, fileCount: result.fileCount, generatedAt: result.generatedAt });
    setBusy(null);
    await refresh();
    return result;
  }

  async function resolveContradiction(id: string) {
    const resolution = window.prompt("What decision should Knowledge Brain remember as the resolution?");
    if (!resolution?.trim()) return;
    await runAction(`resolve-${id}`, `/api/brain/contradictions/${id}/resolve`, { resolution, resolvedBy: "Alex" });
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const counts = useMemo(() => overview?.counts ?? {}, [overview]);
  const topReadiness = overview?.readiness?.[0];
  const topDecision = overview?.decisionInbox?.[0];

  if (loading && !overview) {
    return <div style={{ color: "var(--color-client-text-secondary)" }}>Loading Knowledge Brain...</div>;
  }

  return (
    <div style={shell}>
      <header style={{ ...card, display: "grid", gap: 18, background: "linear-gradient(135deg, rgba(30,64,175,0.24), rgba(6,78,59,0.13) 46%, rgba(0,0,0,0.18))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 860 }}>
            <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Mission Control Intelligence</div>
            <h1 style={{ fontSize: 34, lineHeight: 1.06, margin: "6px 0 0", fontWeight: 820 }}>Knowledge Brain</h1>
            <p style={{ color: "rgba(255,255,255,0.76)", margin: "10px 0 0", fontSize: 15, maxWidth: 780 }}>
              A business memory system that preserves source evidence, spots contradictions, and turns meetings into decisions you can manage.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button} disabled={busy !== null} onClick={() => runAction("detect", "/api/brain/detect-contradictions", { domain: "all" })}>Find Contradictions</button>
            <button style={ghostButton} disabled={busy !== null} onClick={() => runAction("meetings", "/api/brain/ingest-meetings", { force: true })}>Refresh Meetings</button>
            <button style={ghostButton} disabled={busy !== null} onClick={() => runAction("pack", "/api/brain/context-pack", { pack: "founder-brief", audience: "founder", tokenBudget: 1800 })}>Founder Pack</button>
            <button style={ghostButton} disabled={busy !== null} onClick={() => runAction("obsidian", "/api/brain/export-obsidian", {})}>Export Maps</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={quietCard}>
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Next Decision</div>
            <div style={{ fontSize: 17, fontWeight: 760, marginTop: 8 }}>{topDecision?.decisionNeeded ?? overview?.managerBrief.headline}</div>
            <p style={{ margin: "8px 0 0", color: "var(--color-client-text-secondary)", fontSize: 13 }}>{topDecision?.businessImpact ?? "No major contradiction is currently blocking the system."}</p>
          </div>
          <div style={quietCard}>
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Lowest Readiness</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginTop: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 760 }}>{topReadiness?.name ?? "No initiative"}</div>
              <div style={{ fontSize: 24, fontWeight: 820 }}>{topReadiness?.score ?? 0}%</div>
            </div>
            <div style={{ marginTop: 8 }}><ProgressBar score={topReadiness?.score ?? 0} /></div>
            <p style={{ margin: "8px 0 0", color: "var(--color-client-text-secondary)", fontSize: 13 }}>{topReadiness?.nextBestAction ?? overview?.managerBrief.recommendedFocus}</p>
          </div>
          <div style={quietCard}>
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Memory Health</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
              {[
                ["Decisions", counts.decisions ?? 0],
                ["Open Tensions", counts.contradictions ?? 0],
                ["To Review", counts.reviewQueue ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ borderRadius: 8, background: "rgba(255,255,255,0.055)", padding: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
                  <div style={{ color: "var(--color-client-text-dim)", fontSize: 11 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={quietCard}>
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Obsidian Map</div>
            <div style={{ fontSize: 15, fontWeight: 760, marginTop: 8 }}>Map of Maps ready</div>
            <p style={{ margin: "8px 0 0", color: "var(--color-client-text-secondary)", fontSize: 13 }}>{overview?.obsidianExport.strategy}</p>
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, marginTop: 8, wordBreak: "break-word" }}>{exportResult ? `${exportResult.fileCount} files exported to ${exportResult.outputDir}` : overview?.obsidianExport.mapOfMapsPath}</div>
          </div>
        </div>
      </header>

      <section style={card}>
        <SectionTitle title="Ask The Brain" subtitle="Choose how cautious the answer should be before agents or humans rely on it." />
        <form
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await runAction("query", "/api/brain/query", { question, domain, mode, maxTokens: 2000, includeSources: true });
            setQueryResult(result);
          }}
        >
          <input value={question} onChange={(event) => setQuestion(event.target.value)} style={{ minHeight: 40, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.18)", color: "var(--color-client-text)", padding: "0 12px" }} />
          <select value={domain} onChange={(event) => setDomain(event.target.value)} style={{ minHeight: 40, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "#10131a", color: "var(--color-client-text)", padding: "0 10px" }}>
            {domains.map((item) => <option key={item} value={item}>{formatDomain(item)}</option>)}
          </select>
          <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ minHeight: 40, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "#10131a", color: "var(--color-client-text)", padding: "0 10px" }}>
            {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button style={button} disabled={busy !== null}>Ask</button>
        </form>
        {queryResult ? (
          <pre style={{ marginTop: 12, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12, color: "rgba(255,255,255,0.78)", background: "rgba(0,0,0,0.22)", borderRadius: 8, padding: 12 }}>{JSON.stringify(queryResult, null, 2)}</pre>
        ) : null}
      </section>

      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["decisions", "Decision Inbox"],
          ["readiness", "Readiness"],
          ["profiles", "Entity Profiles"],
          ["changes", "What Changed"],
          ["review", "Review Memory"],
          ["artifacts", "Packs & Pages"],
          ["maps", "Map of Maps"],
        ].map(([key, label]) => (
          <button key={key} style={activeTab === key ? button : ghostButton} onClick={() => setActiveTab(key as typeof activeTab)}>{label}</button>
        ))}
      </nav>

      {activeTab === "decisions" ? (
        <section style={card}>
          <SectionTitle title="Managerial Decision Inbox" subtitle="These are the places where the business needs a decision, an owner, or a truth source." />
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {(overview?.decisionInbox ?? []).length ? overview?.decisionInbox.map((item) => (
              <div key={`${item.kind}-${item.id}`} style={{ ...quietCard, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 780 }}>{item.decisionNeeded}</div>
                    <div style={{ color: "var(--color-client-text-secondary)", fontSize: 13, marginTop: 5 }}>{item.title}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <Pill tone={toneFor(item.severity)}>{item.severity}</Pill>
                    <Pill>{formatDomain(item.domain)}</Pill>
                    <Pill>{item.kind === "contradiction" ? "tension" : "trust review"}</Pill>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Why It Matters</div>
                    <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{item.businessImpact}</p>
                  </div>
                  <div>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Recommended Move</div>
                    <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{item.recommendedAction}</p>
                  </div>
                  <div>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Evidence</div>
                    <p style={{ margin: "5px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{item.evidence}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.kind === "contradiction" ? (
                    <>
                      <button style={button} disabled={busy !== null} onClick={() => runAction(`task-${item.id}`, `/api/brain/contradictions/${item.id}/action-item`, { actor: "Alex" })}>Create Decision Task</button>
                      <button style={ghostButton} disabled={busy !== null} onClick={() => resolveContradiction(item.id)}>Resolve Memory</button>
                    </>
                  ) : item.recordType ? (
                    <>
                      <button style={button} disabled={busy !== null} onClick={() => runAction(`approve-${item.id}`, "/api/brain/review-memory", { recordType: item.recordType, recordId: item.id, trustStatus: "approved", reviewedBy: "Alex" })}>Approve Memory</button>
                      <button style={ghostButton} disabled={busy !== null} onClick={() => runAction(`reject-${item.id}`, "/api/brain/review-memory", { recordType: item.recordType, recordId: item.id, trustStatus: "rejected", reviewedBy: "Alex" })}>Reject</button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : <Empty text="No decisions need attention right now." />}
          </div>
        </section>
      ) : null}

      {activeTab === "readiness" ? (
        <section style={card}>
          <SectionTitle title="Program Readiness" subtitle="A practical score for whether each initiative has enough trusted memory, decisions, and ownership to move cleanly." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
            {(overview?.readiness ?? []).map((item) => (
              <div key={item.id} style={quietCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 780 }}>{item.name}</div>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 12 }}>{formatDomain(item.domain)}</div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 820 }}>{item.score}%</div>
                </div>
                <div style={{ marginTop: 10 }}><ProgressBar score={item.score} /></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <Pill tone={toneFor(item.status)}>{item.status}</Pill>
                  <Pill>{item.counts.decisions} decisions</Pill>
                  <Pill>{item.counts.contradictions} tensions</Pill>
                  <Pill>{item.counts.candidates} to review</Pill>
                </div>
                <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, margin: "12px 0 0" }}>{item.nextBestAction}</p>
                {item.blockers.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--color-client-text-secondary)", fontSize: 13 }}>
                    {item.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "profiles" ? (
        <section style={card}>
          <SectionTitle title="Entity Profiles" subtitle="Generated living profiles for programs, partners, venues, people, and systems the business keeps referencing." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 14 }}>
            {(overview?.entityProfiles ?? []).map((item) => (
              <div key={item.id} style={quietCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 780 }}>{item.name}</div>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 12 }}>{item.type} · {formatDomain(item.domain)}</div>
                  </div>
                  {item.contradictions.length ? <Pill tone="danger">{item.contradictions.length} tensions</Pill> : <Pill tone="good">clean</Pill>}
                </div>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, margin: "10px 0" }}>{item.summary}</p>
                {[
                  ["Decisions", item.decisions],
                  ["Risks", item.risks],
                  ["Promises", item.promises],
                ].map(([label, values]) => (
                  <div key={label as string} style={{ marginTop: 10 }}>
                    <div style={{ color: "var(--color-client-text-dim)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{label as string}</div>
                    {(values as string[]).length ? (values as string[]).slice(0, 3).map((value) => <div key={value} style={{ color: "var(--color-client-text-secondary)", fontSize: 13, marginTop: 4 }}>{value}</div>) : <div style={{ color: "var(--color-client-text-dim)", fontSize: 13, marginTop: 4 }}>Nothing recorded yet.</div>}
                  </div>
                ))}
                {item.lastSource ? <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, marginTop: 10 }}>Latest source: {item.lastSource}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "changes" ? (
        <section style={card}>
          <SectionTitle title="What Changed" subtitle={overview?.memoryDiff.headline} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
            {[
              ["New / Updated Sources", overview?.memoryDiff.sources.map((item) => `${item.title} (${item.date})`) ?? []],
              ["Decisions Captured", overview?.memoryDiff.decisions.map((item) => item.text) ?? []],
              ["Risks Surfaced", overview?.memoryDiff.risks.map((item) => item.text) ?? []],
              ["Promises Captured", overview?.memoryDiff.promises.map((item) => item.text) ?? []],
              ["New Tensions", overview?.memoryDiff.contradictions.map((item) => item.question ?? item.title) ?? []],
            ].map(([label, values]) => (
              <div key={label as string} style={quietCard}>
                <div style={{ fontSize: 15, fontWeight: 780 }}>{label as string}</div>
                {(values as string[]).length ? (values as string[]).slice(0, 6).map((value) => <div key={value} style={{ color: "var(--color-client-text-secondary)", fontSize: 13, marginTop: 8 }}>{value}</div>) : <Empty text="No recent changes." />}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "review" ? (
        <section style={card}>
          <SectionTitle title="Memory Review" subtitle="Candidate memories are useful for internal thinking, but approved memory is what agents should rely on." />
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {(overview?.reviewQueue ?? []).length ? overview?.reviewQueue.map((item) => (
              <div key={`${item.recordType}-${item.id}`} style={{ ...quietCard, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 720 }}>{item.text}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Pill>{item.recordType}</Pill>
                    <Pill>{formatDomain(item.domain)}</Pill>
                    <Pill tone={toneFor(item.priority)}>{item.priority}</Pill>
                  </div>
                </div>
                <div style={{ color: "var(--color-client-text-dim)", fontSize: 12 }}>{item.source}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={button} disabled={busy !== null} onClick={() => runAction(`approve-${item.id}`, "/api/brain/review-memory", { recordType: item.recordType, recordId: item.id, trustStatus: "approved", reviewedBy: "Alex", reviewNote: "Approved in Mission Control Brain review." })}>Approve</button>
                  <button style={ghostButton} disabled={busy !== null} onClick={() => runAction(`reject-${item.id}`, "/api/brain/review-memory", { recordType: item.recordType, recordId: item.id, trustStatus: "rejected", reviewedBy: "Alex", reviewNote: "Rejected in Mission Control Brain review." })}>Reject</button>
                  {item.evidence ? <button style={ghostButton} onClick={() => setEvidence(item.evidence ?? null)}>Show Evidence</button> : null}
                </div>
              </div>
            )) : <Empty text="No candidate memory awaiting review." />}
          </div>
        </section>
      ) : null}

      {activeTab === "artifacts" ? (
        <section style={card}>
          <SectionTitle title="Generated Artifacts" subtitle="These are compiled outputs over the structured Brain. They are useful, but the source memory remains authoritative." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button style={button} disabled={busy !== null} onClick={() => runAction("compile", "/api/brain/compile", { pageType: "weekly_brief", domain: "leadership", title: "Weekly Founder Brief" })}>Compile Founder Brief</button>
            <button style={ghostButton} disabled={busy !== null} onClick={() => runAction("pack", "/api/brain/context-pack", { pack: "founder-brief", audience: "founder", tokenBudget: 1800 })}>Generate Founder Pack</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
            {[...(overview?.compiledPages ?? []).map((item) => ({ id: item.id, title: item.title, meta: `${formatDomain(item.domain)} · ${item.freshness_status} · ${formatDate(item.last_generated_at)}`, markdown: item.markdown })), ...(overview?.contextPacks ?? []).map((item) => ({ id: item.id, title: item.name, meta: `${item.audience} · ${item.token_budget} tokens · ${item.freshness_status}`, markdown: item.markdown }))].map((item) => (
              <button key={item.id} onClick={() => setPreview({ title: item.title, markdown: item.markdown })} style={{ ...quietCard, textAlign: "left", color: "var(--color-client-text)", cursor: "pointer" }}>
                <div style={{ fontWeight: 780 }}>{item.title}</div>
                <div style={{ color: "var(--color-client-text-dim)", marginTop: 6, fontSize: 12 }}>{item.meta}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "maps" ? (
        <section style={card}>
          <SectionTitle title="Map Of Maps" subtitle="Generated markdown that lets agents route themselves before reading larger files." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
            <div style={quietCard}>
              <div style={{ fontSize: 16, fontWeight: 780 }}>How agents should use it</div>
              <p style={{ color: "var(--color-client-text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                Agents start with the Map of Maps, read one relevant domain map, then query Knowledge Brain for structured records. Raw source files are only for evidence, quotes, or dispute resolution.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Pill>maps first</Pill>
                <Pill>packs second</Pill>
                <Pill>raw evidence last</Pill>
              </div>
            </div>
            <div style={quietCard}>
              <div style={{ fontSize: 16, fontWeight: 780 }}>Export destination</div>
              <p style={{ color: "var(--color-client-text-secondary)", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>
                {exportResult?.outputDir ?? overview?.obsidianExport.defaultOutputDir}
              </p>
              <button style={button} disabled={busy !== null} onClick={() => runAction("obsidian", "/api/brain/export-obsidian", {})}>Regenerate Obsidian Maps</button>
              {exportResult ? <div style={{ color: "var(--color-client-text-dim)", fontSize: 12, marginTop: 10 }}>Exported {exportResult.fileCount} files at {formatDate(exportResult.generatedAt)}.</div> : null}
            </div>
            <div style={quietCard}>
              <div style={{ fontSize: 16, fontWeight: 780 }}>Generated files</div>
              {["MAP_OF_MAPS.md", "00_AGENT_ROUTING.md", "01_DECISION_INBOX.md", "02_INITIATIVE_READINESS.md", "03_WHAT_CHANGED.md", "04_ENTITY_PROFILES.md", "domains/*.md"].map((item) => (
                <div key={item} style={{ color: "var(--color-client-text-secondary)", fontSize: 13, marginTop: 7 }}>{item}</div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {evidence ? (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <SectionTitle title="Source Evidence" subtitle={`${evidence.sourceTitle}${evidence.sourceDate ? ` · ${evidence.sourceDate}` : ""}`} />
            <button style={ghostButton} onClick={() => setEvidence(null)}>Close</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {evidence.sourceType ? <Pill>{evidence.sourceType}</Pill> : null}
            {evidence.confidence ? <Pill>{Math.round(evidence.confidence * 100)}% confidence</Pill> : null}
          </div>
          <p style={{ color: "rgba(255,255,255,0.84)", fontSize: 14, lineHeight: 1.55, margin: "12px 0 0" }}>{evidence.quote ?? "No quote captured for this record yet."}</p>
        </section>
      ) : null}

      {preview ? (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <SectionTitle title={preview.title} />
            <button style={ghostButton} onClick={() => setPreview(null)}>Close</button>
          </div>
          <pre style={{ marginTop: 12, maxHeight: 420, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12, color: "rgba(255,255,255,0.82)", background: "rgba(0,0,0,0.24)", borderRadius: 8, padding: 12 }}>{preview.markdown}</pre>
        </section>
      ) : null}
    </div>
  );
}
