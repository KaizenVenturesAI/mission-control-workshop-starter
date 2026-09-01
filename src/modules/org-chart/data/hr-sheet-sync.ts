import seedPeople from "./people.json";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { PersonRecord } from "../types";

const SOURCE_NAME = "public.hr_org_chart_people";

type OrgChartPeopleStore = {
  people: PersonRecord[];
  lastSyncedAt: string | null;
  lastError: string | null;
  source: string;
};

type SupabaseOrgChartPerson = {
  id: string;
  name: string;
  manager_names: string[] | null;
  location: string | null;
  location_label: string | null;
  level: string | null;
  status: "Active" | "Inactive" | string | null;
  department: string | null;
  role: string | null;
  hourly_rate: string | null;
  monthly_comp: string | null;
  coaching_rate: string | null;
  payment_method: string | null;
  payment_username: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
  profile_title: string | null;
  bio: string | null;
};

const FALLBACK_PEOPLE = seedPeople as PersonRecord[];
let lastStore: OrgChartPeopleStore = {
  people: FALLBACK_PEOPLE,
  lastSyncedAt: null,
  lastError: null,
  source: "local-seed",
};

function writeStore(store: OrgChartPeopleStore) {
  lastStore = store;
}

function fromSupabaseRow(row: SupabaseOrgChartPerson): PersonRecord {
  const managerNames = row.manager_names ?? [];
  return {
    id: row.id,
    name: row.name,
    managerName: managerNames[0] ?? null,
    managerNames,
    location: row.location ?? "South Florida",
    locationLabel: row.location_label ?? "All",
    level: row.level ?? "IC1",
    status: row.status === "Inactive" ? "Inactive" : "Active",
    department: row.department ?? "Unassigned",
    role: row.role ?? "Team Member",
    hourlyRate: row.hourly_rate,
    monthlyComp: row.monthly_comp,
    coachingRate: row.coaching_rate,
    paymentMethod: row.payment_method,
    paymentUsername: row.payment_username,
    phone: row.phone,
    email: row.email,
    address: row.address,
    photoUrl: row.photo_url,
    profileTitle: row.profile_title,
    bio: row.bio,
  };
}

function toSupabaseRow(person: PersonRecord, sortOrder: number) {
  return {
    id: person.id,
    name: person.name,
    manager_names: person.managerNames ?? (person.managerName ? [person.managerName] : []),
    location: person.location || "South Florida",
    location_label: person.locationLabel || "All",
    level: person.level,
    status: person.status,
    department: person.department,
    role: person.role,
    hourly_rate: person.hourlyRate ?? null,
    monthly_comp: person.monthlyComp ?? null,
    coaching_rate: person.coachingRate ?? null,
    payment_method: person.paymentMethod ?? null,
    payment_username: person.paymentUsername ?? null,
    phone: person.phone ?? null,
    email: person.email ?? null,
    address: person.address ?? null,
    photo_url: person.photoUrl ?? null,
    profile_title: person.profileTitle ?? null,
    bio: person.bio ?? null,
    sort_order: sortOrder,
    raw: { seededBy: "example-client-mission-control" },
  };
}

async function readSupabasePeople(): Promise<PersonRecord[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("hr_org_chart_people")
    .select("id,name,manager_names,location,location_label,level,status,department,role,hourly_rate,monthly_comp,coaching_rate,payment_method,payment_username,phone,email,address,photo_url,profile_title,bio")
    .eq("status", "Active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => fromSupabaseRow(row as SupabaseOrgChartPerson));
}

async function upsertSupabaseSeed(): Promise<PersonRecord[]> {
  const supabase = createServiceSupabaseClient();
  const rows = FALLBACK_PEOPLE.map((person, index) => toSupabaseRow(person, (index + 1) * 10));
  const { error } = await supabase.from("hr_org_chart_people").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return readSupabasePeople();
}

export async function getOrgChartPeople(): Promise<PersonRecord[]> {
  if (shouldUseSupabaseBackend()) {
    try {
      const people = await readSupabasePeople();
      if (people.length > 0) {
        writeStore({ people, lastSyncedAt: new Date().toISOString(), lastError: null, source: SOURCE_NAME });
        return people;
      }
    } catch (error) {
      writeStore({
        ...lastStore,
        lastError: error instanceof Error ? error.message : "Supabase org chart read failed",
      });
    }
  }

  return FALLBACK_PEOPLE;
}

export function getOrgChartPeopleMeta() {
  return {
    lastSyncedAt: lastStore.lastSyncedAt,
    lastError: lastStore.lastError,
    source: lastStore.source,
    count: lastStore.people.filter((person) => person.status === "Active").length,
  };
}

export async function syncOrgChartPeopleFromSheet() {
  const lastSyncedAt = new Date().toISOString();

  if (shouldUseSupabaseBackend()) {
    try {
      const people = await upsertSupabaseSeed();
      writeStore({ people, lastSyncedAt, lastError: null, source: SOURCE_NAME });
      return {
        people,
        lastSyncedAt,
        source: SOURCE_NAME,
        activeCount: people.length,
        inactiveCount: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase org chart seed failed";
      writeStore({ people: FALLBACK_PEOPLE, lastSyncedAt, lastError: message, source: "local-seed" });
      return {
        people: FALLBACK_PEOPLE,
        lastSyncedAt,
        source: "local-seed",
        activeCount: FALLBACK_PEOPLE.length,
        inactiveCount: 0,
        warning: message,
      };
    }
  }

  writeStore({ people: FALLBACK_PEOPLE, lastSyncedAt, lastError: null, source: "local-seed" });
  return {
    people: FALLBACK_PEOPLE,
    lastSyncedAt,
    source: "local-seed",
    activeCount: FALLBACK_PEOPLE.length,
    inactiveCount: 0,
  };
}
