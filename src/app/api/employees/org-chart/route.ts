import { NextResponse } from "next/server";
import seedPeople from "@/modules/org-chart/data/people.json";
import { getOrgChartPeople, getOrgChartPeopleMeta, syncOrgChartPeopleFromSheet } from "@/modules/org-chart/data/hr-sheet-sync";
import type { PersonRecord } from "@/modules/org-chart/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SEEDED_ORG_PEOPLE = seedPeople as PersonRecord[];

export async function GET() {
  const people = await getOrgChartPeople();
  const meta = getOrgChartPeopleMeta();
  return NextResponse.json({
    people: people.length > 0 ? people : SEEDED_ORG_PEOPLE,
    lastSyncedAt: meta.lastSyncedAt,
    source: meta.source,
    activeCount: people.length > 0 ? people.length : SEEDED_ORG_PEOPLE.length,
  });
}

export async function POST() {
  try {
    const syncResult = await syncOrgChartPeopleFromSheet();
    return NextResponse.json({
      ...syncResult,
      people: SEEDED_ORG_PEOPLE,
      source: syncResult.source ?? "local-seed",
      activeCount: SEEDED_ORG_PEOPLE.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HR org chart refresh failed";
    return NextResponse.json(
      {
        success: false,
        warning: message,
        people: SEEDED_ORG_PEOPLE,
        lastSyncedAt: null,
        source: "local-seed",
        activeCount: SEEDED_ORG_PEOPLE.length,
      },
    );
  }
}
