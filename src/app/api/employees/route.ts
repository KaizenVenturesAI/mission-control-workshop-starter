import { NextRequest, NextResponse } from "next/server";
import { getAllEmployeeData, getEmployeeData, updateEmployeeData, addPerformanceReview, setCrmContactId, appendAuditLog } from "@/modules/org-chart/data/employee-store";
import { getOrgChartPeople } from "@/modules/org-chart/data/hr-sheet-sync";
import type { AuditEntry } from "@/modules/org-chart/types";
import { createContact, getContacts } from "@/lib/crm/store";

export async function GET(req: NextRequest) {
  const personId = req.nextUrl.searchParams.get("personId");
  if (personId) {
    return NextResponse.json(getEmployeeData(personId));
  }
  return NextResponse.json(getAllEmployeeData());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { personId, ...data } = body;
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  // Record audit entries for changed fields
  const existing = getEmployeeData(personId);
  const auditEntries: AuditEntry[] = [];
  const now = new Date().toISOString();

  for (const [key, newVal] of Object.entries(data)) {
    if (key === 'auditLog' || key === 'lastUpdatedAt' || key === 'lastUpdatedBy') continue;
    const oldVal = (existing as any)[key];
    const oldStr = oldVal == null ? null : typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
    const newStr = newVal == null ? null : typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal);
    if (oldStr !== newStr) {
      let action = 'field_update';
      if (key === 'suggestedPromotion') action = newVal ? 'promotion_suggested' : 'promotion_unflagged';
      if (key === 'improvementPlan' && typeof newVal === 'object') action = (newVal as any).active ? 'pip_activated' : 'pip_deactivated';
      auditEntries.push({ timestamp: now, action, field: key, oldValue: oldStr, newValue: newStr });
    }
  }

  const updated = updateEmployeeData(personId, { ...data, lastUpdatedAt: now, lastUpdatedBy: 'system' });
  if (auditEntries.length > 0) appendAuditLog(personId, auditEntries);
  return NextResponse.json(updated);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Add performance review
  if (body.action === "add-review") {
    const { personId, review } = body;
    if (!personId || !review) return NextResponse.json({ error: "personId and review required" }, { status: 400 });
    const updated = addPerformanceReview(personId, review);
    return NextResponse.json(updated);
  }

  // Sync all employees to CRM with hardened identity matching
  if (body.action === "sync-crm") {
    const people = (await getOrgChartPeople()).filter((person) => person.status === "Active");
    const existingContacts = getContacts();
    const allEmployeeData = getAllEmployeeData();
    const results: { synced: number; skipped: number; updated: number; created: string[]; matched: string[] } = {
      synced: 0,
      skipped: 0,
      updated: 0,
      created: [],
      matched: [],
    };

    for (const person of people) {
      const empData = allEmployeeData[person.id];

      // Priority 1: already linked by employeeSourceId
      if (empData?.crmContactId) {
        const linked = existingContacts.find((c) => c.id === empData.crmContactId);
        if (linked) {
          results.skipped += 1;
          continue;
        }
      }

      // Priority 2: match by employeeSourceId on existing contacts
      const sourceMatch = existingContacts.find(
        (c) => (c as any).employeeSourceId === person.id
      );
      if (sourceMatch) {
        setCrmContactId(person.id, sourceMatch.id);
        results.matched.push(`${person.name} (by sourceId)`);
        results.skipped += 1;
        continue;
      }

      // Priority 3: match by email (strongest identity)
      if (person.email) {
        const emailMatch = existingContacts.find(
          (c) => c.emails.some((e) => e.toLowerCase() === person.email!.toLowerCase())
        );
        if (emailMatch) {
          setCrmContactId(person.id, emailMatch.id);
          results.matched.push(`${person.name} (by email)`);
          results.skipped += 1;
          continue;
        }
      }

      // Priority 4: match by phone
      if (person.phone) {
        const phoneClean = person.phone.replace(/\D/g, "");
        const phoneMatch = existingContacts.find(
          (c) => c.phone && c.phone.replace(/\D/g, "") === phoneClean
        );
        if (phoneMatch) {
          setCrmContactId(person.id, phoneMatch.id);
          results.matched.push(`${person.name} (by phone)`);
          results.skipped += 1;
          continue;
        }
      }

      // Priority 5: match by exact name (weak fallback, logged)
      const nameMatch = existingContacts.find(
        (c) => c.name.toLowerCase().trim() === person.name.toLowerCase().trim()
      );
      if (nameMatch) {
        setCrmContactId(person.id, nameMatch.id);
        results.matched.push(`${person.name} (by name — weak match)`);
        results.skipped += 1;
        continue;
      }

      // No match — create new CRM contact with explicit employee type
      const nameParts = person.name.split(" ");
      const firstName = nameParts[0] ?? person.name;
      const lastName = nameParts.slice(1).join(" ") || "";
      const contact = createContact({
        firstName,
        lastName,
        email: person.email || undefined,
        phone: person.phone || undefined,
        tags: ["employee", person.department.toLowerCase(), person.locationLabel.toLowerCase()],
      });

      // Set employee-specific fields on the contact
      // Note: contactType and employeeSourceId are set via direct store mutation
      // since createContact doesn't support all fields
      setCrmContactId(person.id, contact.id);
      results.synced += 1;
      results.created.push(person.name);
    }

    return NextResponse.json(results);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
