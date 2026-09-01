import { NextRequest, NextResponse } from "next/server";
import { getContacts, getAccounts, createAccount, createContact, linkContactToAccount, updateContact } from "@/lib/crm/store";
import { getAllEmployeeData, setCrmContactId } from "@/modules/org-chart/data/employee-store";
import { getOrgChartPeople } from "@/modules/org-chart/data/hr-sheet-sync";
import { agents } from "@/data/agents";

export async function POST(req: NextRequest) {
  const people = (await getOrgChartPeople()).filter((person) => person.status === "Active");
  const existingAccounts = getAccounts();
  const existingContacts = getContacts();
  const allEmployeeData = getAllEmployeeData();

  // 1. Find or create internal account
  let internalAccount = existingAccounts.find((a) => a.name === "Example Client Internal");
  if (!internalAccount) {
    internalAccount = createAccount({
      name: "Example Client Internal",
      type: "Partner",

      category: "Internal",
      operatingMarket: "Miami",
      notes: "Internal Example Client employee and agent account",
      industry: "Technology and advisory",
      relationshipStage: "Active",
    });
  }

  const results = {
    accountId: internalAccount.id,
    employeesLinked: 0,
    agentsSynced: 0,
    agentsCreated: [] as string[],
    employeesUpdated: [] as string[],
  };

  // 2. Link all existing employee contacts to internal account
  for (const person of people) {
    const empData = allEmployeeData[person.id];
    if (empData?.crmContactId) {
      const contact = existingContacts.find((c) => c.id === empData.crmContactId);
      if (contact) {
        // Update accountId to internal account
        if (contact.accountId !== internalAccount.id) {
          updateContact(contact.id, { accountId: internalAccount.id });
          results.employeesUpdated.push(person.name);
        }
        // Ensure employee tag
        if (!contact.tags.includes("employee")) {
          updateContact(contact.id, { tags: [...contact.tags, "employee"] });
        }
        results.employeesLinked += 1;
      }
    }
  }

  // 3. Sync agentic org chart agents to CRM
  for (const agent of agents) {
    // Check if agent already exists as a contact
    const existingAgent = existingContacts.find(
      (c) => c.name === agent.name && c.tags.includes("agent")
    );

    if (existingAgent) {
      // Link to internal account if not already
      if (existingAgent.accountId !== internalAccount.id) {
        updateContact(existingAgent.id, { accountId: internalAccount.id });
      }
      results.agentsSynced += 1;
    } else {
      // Create new agent contact
      const contact = createContact({
        firstName: agent.name.split(" ")[0] ?? agent.name,
        lastName: agent.name.split(" ").slice(1).join(" ") || "Agent",
        tags: ["agent", "internal", agent.role.toLowerCase()],
      });
      // Link to internal account
      linkContactToAccount(contact.id, internalAccount.id);
      // Update with agent-specific metadata
      updateContact(contact.id, {
        title: agent.role,
        company: "Example Client",
        accountId: internalAccount.id,
      });
      results.agentsCreated.push(agent.name);
      results.agentsSynced += 1;
    }
  }

  return NextResponse.json(results);
}
