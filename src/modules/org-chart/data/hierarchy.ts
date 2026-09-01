import rawPeople from "./people.json";
import type { GeographyFilter, OrgPerson, OrgTreeNode, PersonRecord } from "../types";

const ROOT_ORDER = ["Alex", "Example Client Morgan", "Example Client Admin", "Example Client Operator"];
const LEVEL_ORDER = ["L5", "L4", "L3", "L2", "IC4", "IC3", "IC2", "IC1"];

const people = rawPeople as PersonRecord[];

function comparePeople(a: OrgPerson, b: OrgPerson) {
  const levelDiff = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
  if (levelDiff !== 0) return levelDiff;
  return a.name.localeCompare(b.name);
}

function computeDepth(personId: string, byId: Map<string, OrgPerson>): number {
  const person = byId.get(personId);
  if (!person || !person.managerId) return 0;
  return 1 + computeDepth(person.managerId, byId);
}

function computeTotalDownstream(personId: string, byId: Map<string, OrgPerson>): number {
  const person = byId.get(personId);
  if (!person) return 0;
  return person.allDirectReportIds.reduce((sum, childId) => sum + 1 + computeTotalDownstream(childId, byId), 0);
}

export function buildOrgPeopleFromRecords(records: PersonRecord[]) {
  const activeRecords = records.filter((person) => person.status === "Active");
  const idByName = new Map(activeRecords.map((person) => [person.name, person.id]));

  const normalized: OrgPerson[] = activeRecords.map((person) => ({
    ...person,
    managerNames: person.managerNames ?? (person.managerName ? [person.managerName] : []),
    managerId: (person.managerNames?.[0] ?? person.managerName) ? idByName.get(person.managerNames?.[0] ?? person.managerName!) ?? null : null,
    managerIds: (person.managerNames ?? (person.managerName ? [person.managerName] : []))
      .map((managerName) => idByName.get(managerName))
      .filter((id): id is string => Boolean(id)),
    secondaryManagerIds: [],
    directReportIds: [],
    allDirectReportIds: [],
    directReports: 0,
    totalDownstream: 0,
    depth: 0,
    isLeader: person.level.startsWith("L"),
    isRoot: !person.managerName,
  }));

  const byId = new Map(normalized.map((person) => [person.id, person]));

  normalized.forEach((person) => {
    person.secondaryManagerIds = person.managerIds.slice(1);
    person.managerIds.forEach((managerId, index) => {
      const manager = byId.get(managerId);
      manager?.allDirectReportIds.push(person.id);
      if (index === 0) manager?.directReportIds.push(person.id);
    });
  });

  normalized.forEach((person) => {
    person.directReportIds.sort((a, b) => comparePeople(byId.get(a)!, byId.get(b)!));
    person.allDirectReportIds.sort((a, b) => comparePeople(byId.get(a)!, byId.get(b)!));
    person.directReports = person.allDirectReportIds.length;
    person.depth = computeDepth(person.id, byId);
    person.totalDownstream = computeTotalDownstream(person.id, byId);
    person.isLeader = person.level.startsWith("L") || person.directReports > 0;
    person.isRoot = !person.managerId;
  });

  normalized.sort((a, b) => {
    const rootDiff = ROOT_ORDER.indexOf(a.name) - ROOT_ORDER.indexOf(b.name);
    if (a.isRoot && b.isRoot && rootDiff !== 0) return rootDiff;
    return comparePeople(a, b);
  });

  return {
    people: normalized,
    byId,
    roots: normalized.filter((person) => person.isRoot).sort((a, b) => ROOT_ORDER.indexOf(a.name) - ROOT_ORDER.indexOf(b.name)),
  };
}

export function buildOrgPeople() {
  return buildOrgPeopleFromRecords(people);
}

export function buildTree(personId: string, byId: Map<string, OrgPerson>): OrgTreeNode {
  const person = byId.get(personId);
  if (!person) {
    throw new Error(`Missing person for id: ${personId}`);
  }

  return {
    person,
    children: person.directReportIds.map((childId) => buildTree(childId, byId)),
  };
}

export function getAncestorIds(personId: string, byId: Map<string, OrgPerson>) {
  const ancestors = new Set<string>();
  let current = byId.get(personId);
  while (current?.managerId) {
    ancestors.add(current.managerId);
    current = byId.get(current.managerId);
  }
  return ancestors;
}

export function getVisibleIds(filter: GeographyFilter, people: OrgPerson[], byId: Map<string, OrgPerson>) {
  if (filter === "All") return new Set(people.map((person) => person.id));

  const matching = people.filter((person) => person.locationLabel === filter);
  const visible = new Set<string>();

  matching.forEach((person) => {
    visible.add(person.id);
    getAncestorIds(person.id, byId).forEach((ancestorId) => visible.add(ancestorId));
  });

  return visible;
}

export function getPersonPath(personId: string, byId: Map<string, OrgPerson>) {
  const path: string[] = [];
  let current: OrgPerson | undefined = byId.get(personId);
  while (current) {
    path.unshift(current.id);
    current = current.managerId ? byId.get(current.managerId) : undefined;
  }
  return path;
}

export function getSearchResults(query: string, people: OrgPerson[]) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return people
    .filter((person) => {
      return [person.name, person.role, person.department].some((value) => value.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return a.name.localeCompare(b.name);
    });
}
