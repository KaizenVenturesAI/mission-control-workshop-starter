"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GeographyFilter, OrgPerson } from "./types";

const NODE_WIDTH = 260;
const NODE_HEIGHT_LEADER = 140;
const NODE_HEIGHT_IC = 95;
const H_GAP = 40;
const V_GAP = 60;

/* ═══ Helpers ═══ */
function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function parseUsdRate(rate: string | null | undefined): number {
  if (!rate) return 0;
  if (rate.includes('R$')) return 0; // Skip BRL rates
  if (rate.toLowerCase().includes('variable')) return 0;
  if (rate.includes('/day')) {
    const cleaned = rate.replace(/[^0-9.]/g, "");
    return (parseFloat(cleaned) || 0) / 8; // approximate hourly from day rate
  }
  const cleaned = rate.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseBrlMonthly(comp: string | null | undefined): number {
  if (!comp) return 0;
  if (!comp.includes('R$')) return 0;
  if (comp.toLowerCase().includes('variable')) return 0;
  const cleaned = comp.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function getSubtreeIds(personId: string, byId: Map<string, OrgPerson>): string[] {
  const person = byId.get(personId);
  if (!person) return [];
  const ids = [personId];
  person.directReportIds.forEach((cid) => { ids.push(...getSubtreeIds(cid, byId)); });
  return ids;
}

interface TeamCostSummary {
  usdHourlyTotal: number;
  brlMonthlyTotal: number;
  usdCount: number;
  brlCount: number;
}

function getTeamCost(personId: string, byId: Map<string, OrgPerson>): TeamCostSummary {
  const ids = getSubtreeIds(personId, byId);
  const result: TeamCostSummary = { usdHourlyTotal: 0, brlMonthlyTotal: 0, usdCount: 0, brlCount: 0 };
  ids.forEach((id) => {
    const p = byId.get(id);
    if (!p) return;
    const usdRate = parseUsdRate(p.hourlyRate);
    const brlMonthly = parseBrlMonthly(p.monthlyComp) || parseBrlMonthly(p.hourlyRate ? (p.hourlyRate.includes('R$') ? `R$${parseFloat(p.hourlyRate.replace(/[^0-9.]/g,''))*160}/month` : null) : null);
    if (usdRate > 0) { result.usdHourlyTotal += usdRate; result.usdCount += 1; }
    if (brlMonthly > 0) { result.brlMonthlyTotal += brlMonthly; result.brlCount += 1; }
  });
  return result;
}

function formatTeamCost(cost: TeamCostSummary): string {
  const parts: string[] = [];
  if (cost.usdHourlyTotal > 0) parts.push(`$${cost.usdHourlyTotal.toLocaleString()}/hr`);
  if (cost.brlMonthlyTotal > 0) parts.push(`R$${cost.brlMonthlyTotal.toLocaleString()}/mo`);
  return parts.join(' + ') || '';
}

interface CoverageInfo {
  coaches: number;
  reception: number;
  facilities: number;
  marketing: number;
  other: number;
}

function getSubtreeCoverage(personId: string, byId: Map<string, OrgPerson>): CoverageInfo {
  const ids = getSubtreeIds(personId, byId);
  const coverage: CoverageInfo = { coaches: 0, reception: 0, facilities: 0, marketing: 0, other: 0 };
  ids.forEach((id) => {
    const p = byId.get(id);
    if (!p) return;
    const role = p.role.toLowerCase();
    const dept = p.department.toLowerCase();
    if (role.includes('coach') || role.includes('fitness')) coverage.coaches += 1;
    else if (role.includes('receptionist') || dept.includes('reception')) coverage.reception += 1;
    else if (role.includes('facilit')) coverage.facilities += 1;
    else if (dept.includes('marketing') || role.includes('editor') || role.includes('athlete')) coverage.marketing += 1;
    else coverage.other += 1;
  });
  return coverage;
}

function getOrgPath(personId: string, byId: Map<string, OrgPerson>): OrgPerson[] {
  const path: OrgPerson[] = [];
  let current = byId.get(personId);
  while (current) {
    path.unshift(current);
    current = current.managerId ? byId.get(current.managerId) : undefined;
  }
  return path;
}

/* ═══ Node Data ═══ */
interface OrgNodeData {
  person: OrgPerson;
  selected: boolean;
  muted: boolean;
  expanded: boolean;
  hasChildren: boolean;
  focused: boolean;
  teamCost: TeamCostSummary;
  teamCostLabel: string;
  coverage: CoverageInfo;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}

interface SharedReportHubData {
  width: number;
  height: number;
}

/* ═══ Custom Node ═══ */
function OrgNodeComponent({ data }: { data: OrgNodeData }) {
  const { person, selected, muted, expanded, hasChildren, focused, teamCostLabel, coverage, onSelect, onToggle, onFocus } = data;
  const isLeader = person.isLeader;

  return (
    <div
      onClick={() => onSelect(person.id)}
      style={{
        width: NODE_WIDTH,
        padding: isLeader ? "14px 16px" : "12px 14px",
        borderRadius: 20,
        background: muted
          ? "linear-gradient(180deg, rgba(22,22,30,0.6) 0%, rgba(14,14,22,0.65) 100%)"
          : focused
            ? "linear-gradient(180deg, rgba(30,25,40,0.96) 0%, rgba(20,18,30,0.96) 100%)"
            : "linear-gradient(180deg, rgba(24,24,34,0.96) 0%, rgba(16,16,24,0.96) 100%)",
        border: selected
          ? "1.5px solid rgba(232,67,147,0.5)"
          : focused
            ? "1.5px solid rgba(192,132,252,0.3)"
            : isLeader
              ? "1px solid rgba(96,165,250,0.2)"
              : "1px solid rgba(255,255,255,0.08)",
        boxShadow: selected
          ? "0 0 0 1px rgba(232,67,147,0.15), 0 12px 28px rgba(0,0,0,0.3)"
          : "0 8px 20px rgba(0,0,0,0.2)",
        opacity: muted ? 0.6 : 1,
        cursor: "pointer",
        color: "#f8fafc",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "transparent", border: "none" }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "transparent", border: "none" }} />

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", background: isLeader ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.07)", color: isLeader ? "#93c5fd" : "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: "hidden" }}>
          {person.photoUrl ? <img src={person.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(person.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.role}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{person.department}</span>
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{person.level}</span>
          </div>
          {person.directReports > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                <span>{person.directReports} direct · {person.totalDownstream} total</span>
                {teamCostLabel && <span style={{ color: "rgba(52,211,153,0.7)" }}>{teamCostLabel}</span>}
              </div>
              {(coverage.coaches > 0 || coverage.reception > 0 || coverage.facilities > 0 || coverage.marketing > 0) && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {coverage.coaches > 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.15)", color: "rgba(251,191,36,0.7)" }}>🎾 {coverage.coaches}</span>}
                  {coverage.reception > 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.15)", color: "rgba(96,165,250,0.7)" }}>🎙 {coverage.reception}</span>}
                  {coverage.facilities > 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.15)", color: "rgba(168,85,247,0.7)" }}>🔧 {coverage.facilities}</span>}
                  {coverage.marketing > 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(244,114,182,0.1)", border: "1px solid rgba(244,114,182,0.15)", color: "rgba(244,114,182,0.7)" }}>📣 {coverage.marketing}</span>}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {hasChildren && (
            <button onClick={(e) => { e.stopPropagation(); onToggle(person.id); }} style={{ width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: expanded ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, display: "grid", placeItems: "center" }}>
              {expanded ? "−" : "+"}
            </button>
          )}
          {person.directReports > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onFocus(person.id); }} title="Focus on this branch" style={{ width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11, display: "grid", placeItems: "center" }}>
              ⊕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SharedReportHubComponent({ data }: { data: SharedReportHubData }) {
  const width = Math.max(data.width, 1);
  const height = Math.max(data.height, 1);
  const midX = width / 2;
  const splitY = Math.min(34, Math.max(24, height * 0.45));

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible", pointerEvents: "none" }}>
      <path
        d={`M ${midX} ${height} L ${midX} ${splitY} M 0 ${splitY} L ${width} ${splitY} M 0 ${splitY} L 0 0 M ${width} ${splitY} L ${width} 0`}
        fill="none"
        stroke="rgba(96,165,250,0.36)"
        strokeWidth={1.6}
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const nodeTypes: NodeTypes = {
  orgNode: OrgNodeComponent as any,
  sharedReportHub: SharedReportHubComponent as any,
};

/* ═══ Layout Engine ═══ */
interface LayoutInput {
  people: OrgPerson[];
  byId: Map<string, OrgPerson>;
  roots: OrgPerson[];
  expandedIds: Set<string>;
  visibleIds: Set<string>;
  geoFilter: GeographyFilter;
  selectedId: string | null;
  focusedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}

function layoutTree(input: LayoutInput): { nodes: Node[]; edges: Edge[] } {
  const { people, byId, roots, expandedIds, visibleIds, geoFilter, selectedId, focusedId, onSelect, onToggle, onFocus } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const effectiveRoots = focusedId && byId.has(focusedId)
    ? [byId.get(focusedId)!]
    : roots.filter((r) => visibleIds.has(r.id));

  function getSubtreeWidth(personId: string): number {
    const person = byId.get(personId);
    if (!person) return NODE_WIDTH;
    const childIds = person.directReportIds.filter((cid) => {
      const child = byId.get(cid);
      return visibleIds.has(cid) && (child?.managerIds.length ?? 0) <= 1;
    });
    if (!expandedIds.has(personId) || childIds.length === 0) return NODE_WIDTH;
    const childWidths = childIds.map((cid) => getSubtreeWidth(cid));
    const totalChildWidth = childWidths.reduce((s, w) => s + w, 0) + (childWidths.length - 1) * H_GAP;
    return Math.max(NODE_WIDTH, totalChildWidth);
  }

  function placeNode(personId: string, x: number, y: number) {
    const person = byId.get(personId);
    if (!person) return;
    if (focusedId && !getSubtreeIds(focusedId, byId).includes(personId) && personId !== focusedId) return;

    const isLeader = person.isLeader;
    const h = isLeader ? NODE_HEIGHT_LEADER : NODE_HEIGHT_IC;
    const childIds = person.directReportIds.filter((cid) => {
      const child = byId.get(cid);
      return visibleIds.has(cid) && (child?.managerIds.length ?? 0) <= 1;
    });
    const hasVisibleChildren = childIds.length > 0;
    const expanded = expandedIds.has(personId);
    const muted = false;
    const isFocused = focusedId === personId;
    // Show individual rate on node, not rolled-up team total
    const individualRate = parseUsdRate(person.hourlyRate);
    const individualBrl = parseBrlMonthly(person.monthlyComp);
    const individualLabel = individualRate > 0 ? `$${individualRate}/hr` : individualBrl > 0 ? `R$${individualBrl.toLocaleString()}/mo` : '';
    const teamCost = { usdHourlyTotal: individualRate, brlMonthlyTotal: individualBrl, usdCount: individualRate > 0 ? 1 : 0, brlCount: individualBrl > 0 ? 1 : 0 };
    const teamCostLabel = individualLabel;
    const coverage = person.directReports > 0 ? getSubtreeCoverage(personId, byId) : { coaches: 0, reception: 0, facilities: 0, marketing: 0, other: 0 };

    nodes.push({
      id: person.id,
      type: "orgNode",
      position: { x, y },
      data: { person, selected: selectedId === person.id, muted, expanded, hasChildren: hasVisibleChildren, focused: isFocused, teamCost, teamCostLabel, coverage, onSelect, onToggle, onFocus } satisfies OrgNodeData,
    });

    if (expanded && hasVisibleChildren) {
      const childWidths = childIds.map((cid) => getSubtreeWidth(cid));
      const totalChildWidth = childWidths.reduce((s, w) => s + w, 0) + (childWidths.length - 1) * H_GAP;
      let childX = x + NODE_WIDTH / 2 - totalChildWidth / 2;
      const childY = y + h + V_GAP;

      childIds.forEach((cid, i) => {
        const cw = childWidths[i];
        const cx = childX + cw / 2 - NODE_WIDTH / 2;
        edges.push({
          id: `${person.id}-${cid}`,
          source: person.id,
          target: cid,
          style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.5, strokeDasharray: "6 4" },
          animated: false,
        });
        placeNode(cid, cx, childY);
        childX += cw + H_GAP;
      });
    }
  }

  const rootWidths = effectiveRoots.map((r) => getSubtreeWidth(r.id));
  const totalRootWidth = rootWidths.reduce((s, w) => s + w, 0) + (rootWidths.length - 1) * H_GAP * 2;
  let rootX = -totalRootWidth / 2;

  effectiveRoots.forEach((root, i) => {
    const rw = rootWidths[i];
    const rx = rootX + rw / 2 - NODE_WIDTH / 2;
    placeNode(root.id, rx, 0);
    rootX += rw + H_GAP * 2;
  });

  people
    .filter((person) => visibleIds.has(person.id) && person.managerIds.length > 1)
    .forEach((person, index) => {
      const managerNodes = person.managerIds
        .map((managerId) => nodes.find((node) => node.id === managerId))
        .filter((node): node is Node => Boolean(node));

      if (managerNodes.length < 2) return;

      const managerCenters = managerNodes.map((node) => node.position.x + NODE_WIDTH / 2);
      const leftCenter = Math.min(...managerCenters);
      const rightCenter = Math.max(...managerCenters);
      const childX = (leftCenter + rightCenter) / 2 - NODE_WIDTH / 2;
      const managerBottomY = Math.max(...managerNodes.map((node) => node.position.y + NODE_HEIGHT_LEADER));
      const childY = managerBottomY + V_GAP + NODE_HEIGHT_IC * index;

      if (!nodes.some((node) => node.id === person.id)) {
        placeNode(person.id, childX, childY);
      }

      const childNode = nodes.find((node) => node.id === person.id);
      if (!childNode) return;

      const hubLeft = leftCenter;
      const hubWidth = Math.max(rightCenter - leftCenter, 1);
      const hubHeight = Math.max(childNode.position.y - managerBottomY, 1);

      nodes.push({
        id: `${person.id}-shared-report-hub`,
        type: "sharedReportHub",
        position: { x: hubLeft, y: managerBottomY },
        data: { width: hubWidth, height: hubHeight } satisfies SharedReportHubData,
        draggable: false,
        selectable: false,
        style: { width: hubWidth, height: hubHeight, pointerEvents: "none" },
      });
  });

  return { nodes, edges };
}

/* ═══ Main Component ═══ */
export function OrgFlowGraph({
  people,
  byId,
  roots,
  expandedIds,
  visibleIds,
  geoFilter,
  selectedId,
  focusedId,
  focusedPath,
  onSelect,
  onToggle,
  onFocus,
  onClearFocus,
  onSearchFocus,
}: {
  people: OrgPerson[];
  byId: Map<string, OrgPerson>;
  roots: OrgPerson[];
  expandedIds: Set<string>;
  visibleIds: Set<string>;
  geoFilter: GeographyFilter;
  selectedId: string | null;
  focusedId: string | null;
  focusedPath: OrgPerson[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
  onClearFocus: () => void;
  onSearchFocus?: string | null;
}) {
  const reactFlow = useReactFlow();

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutTree({ people, byId, roots, expandedIds, visibleIds, geoFilter, selectedId, focusedId, onSelect, onToggle, onFocus }),
    [people, byId, roots, expandedIds, visibleIds, geoFilter, selectedId, focusedId, onSelect, onToggle, onFocus]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  // Fit view when layout changes
  useEffect(() => {
    const timer = setTimeout(() => { try { reactFlow.fitView({ padding: 0.15, duration: 300, minZoom: 0.45, maxZoom: 1.0 }); } catch {} }, 100);
    return () => clearTimeout(timer);
  }, [layoutNodes.length, focusedId]);

  // Search-to-focus: pan to searched node
  useEffect(() => {
    if (!onSearchFocus) return;
    const node = layoutNodes.find((n) => n.id === onSearchFocus);
    if (node) {
      const timer = setTimeout(() => {
        try {
          reactFlow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + 50, { zoom: 1.2, duration: 400 });
        } catch {}
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [onSearchFocus, layoutNodes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Breadcrumb / Org Path */}
      {focusedPath.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", marginBottom: 8, borderRadius: 12, background: "rgba(192,132,252,0.06)", border: "1px solid rgba(192,132,252,0.12)", flexWrap: "wrap" }}>
          <button onClick={onClearFocus} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Full Org</button>
          {focusedPath.map((p, i) => (
            <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>→</span>
              <button onClick={() => onFocus(p.id)} style={{ fontSize: 11, color: i === focusedPath.length - 1 ? "#c084fc" : "rgba(255,255,255,0.6)", background: "transparent", border: "none", cursor: "pointer", fontWeight: i === focusedPath.length - 1 ? 600 : 400 }}>
                {p.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ width: "100%", height: 600, borderRadius: 16, overflow: "hidden" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.45, maxZoom: 1.0 }}
          minZoom={0.15}
          maxZoom={2.5}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background color="rgba(255,255,255,0.03)" gap={30} size={1} />
          <Controls showInteractive={false} style={{ background: "rgba(18,18,26,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as unknown as OrgNodeData;
              if (!d?.person) return "transparent";
              if (d?.person?.id === selectedId) return "rgba(232,67,147,0.6)";
              return d?.person?.isLeader ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.15)";
            }}
            maskColor="rgba(0,0,0,0.6)"
            style={{ background: "rgba(14,14,22,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
