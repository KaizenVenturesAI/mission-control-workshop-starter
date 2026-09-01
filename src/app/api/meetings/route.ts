import { NextResponse } from "next/server";
import { meetingBriefingSchema } from "@/data/meetings";
import { createMeeting, getMeetings } from "@/lib/meetings/store";

export const dynamic = "force-dynamic";

function sortMeetings<T extends { createdAt: string; date: string }>(meetings: T[]): T[] {
  return [...meetings].sort((a, b) => {
    const createdDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdDelta !== 0) return createdDelta;
    return new Date(`${b.date}T00:00:00`).getTime() - new Date(`${a.date}T00:00:00`).getTime();
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department")?.trim().toLowerCase();
  const participant = searchParams.get("participant")?.trim().toLowerCase();
  const search = searchParams.get("search")?.trim().toLowerCase();
  const from = searchParams.get("from")?.trim();

  const meetings = sortMeetings(getMeetings()).filter((meeting) => {
    if (department && !meeting.departments.some((item) => item.toLowerCase() === department)) {
      return false;
    }

    if (participant && !meeting.participants.some((item) => item.name.toLowerCase().includes(participant))) {
      return false;
    }

    if (from && meeting.date < from) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      meeting.title,
      meeting.executiveSummary,
      meeting.strategicNote ?? "",
      ...meeting.departments,
      ...meeting.participants.map((item) => `${item.name} ${item.role} ${item.company} ${item.department ?? ""}`),
      ...meeting.whatsHandled,
      ...meeting.nextSteps,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });

  return NextResponse.json(meetings, { headers: { "Cache-Control": "no-cache" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meeting = createMeeting(meetingBriefingSchema.parse(body));
    return NextResponse.json(meeting, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
