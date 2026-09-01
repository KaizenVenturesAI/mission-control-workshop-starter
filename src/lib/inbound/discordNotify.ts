/**
 * Discord notification hook for new inbound leads.
 *
 * Fires a Discord message to DISCORD_INBOUND_ALERTS_CHANNEL_ID when
 * new leads are detected during sync.  If the env var is missing, or the
 * webhook call fails, this logs and continues — it NEVER blocks sync.
 *
 * Sprint 7 — speed-to-lead alerting layer.
 */

import type { InboundLeadRecord, InboundLeadType } from "@/modules/revenue/inboundLeadsTypes";

const TYPE_EMOJI: Record<InboundLeadType, string> = {
  corporate: "🏢",
  partnership: "🤝",
  "academy-la": "⚙",
  "academy-miami": "◆",
};

const TYPE_LABEL: Record<InboundLeadType, string> = {
  corporate: "Mission Control Builds",
  partnership: "Referral Partnerships",
  "academy-la": "Half-Day Install",
  "academy-miami": "Full-Day Install",
};

function formatReceivedTime(iso: string): string {
  try {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function buildDiscordMessage(leads: InboundLeadRecord[]): string {
  if (leads.length === 0) return "";

  const lines: string[] = [];

  if (leads.length === 1) {
    const lead = leads[0];
    const emoji = TYPE_EMOJI[lead.type];
    const label = TYPE_LABEL[lead.type];
    lines.push(`**${emoji} New ${label} lead**`);
    lines.push(`> **Name:** ${lead.name || "Unknown"}`);
    if (lead.companyName && lead.companyName !== lead.name) {
      lines.push(`> **Company:** ${lead.companyName}`);
    }
    lines.push(`> **Email:** ${lead.email || "—"}`);
    lines.push(`> **Received:** ${formatReceivedTime(lead.receivedAt)}`);
    if (lead.assignedTo) lines.push(`> **Assigned to:** ${lead.assignedTo}`);
  } else {
    lines.push(`**📥 ${leads.length} new leads synced**`);
    lines.push("");
    for (const lead of leads) {
      const emoji = TYPE_EMOJI[lead.type];
      const label = TYPE_LABEL[lead.type];
      const name = lead.name || "Unknown";
      const email = lead.email ? ` — ${lead.email}` : "";
      const time = formatReceivedTime(lead.receivedAt);
      lines.push(`${emoji} **${label}**: ${name}${email} *(${time})*`);
    }
  }

  lines.push("");
  lines.push("_Open Mission Control → /inbound to respond_");
  return lines.join("\n");
}

/**
 * Send Discord notifications for new leads.
 * Fails gracefully — logs errors, never throws.
 */
export async function notifyDiscordNewLeads(newLeads: InboundLeadRecord[]): Promise<void> {
  if (newLeads.length === 0) return;

  // Prefer webhook URL (simpler, no bot token needed) — fallback to bot token + channel ID
  const webhookUrl = process.env.DISCORD_LEADS_WEBHOOK_URL?.trim();
  const channelId = process.env.DISCORD_INBOUND_ALERTS_CHANNEL_ID?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

  const hasWebhook = !!webhookUrl;
  const hasBotAuth = !!(channelId && botToken);

  if (!hasWebhook && !hasBotAuth) {
    console.log("[inbound/discord] No Discord credentials configured — skipping lead alert. Set DISCORD_LEADS_WEBHOOK_URL in .env.local to activate.");
    return;
  }

  const content = buildDiscordMessage(newLeads);
  if (!content) return;

  try {
    let url: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };

    if (hasWebhook) {
      url = webhookUrl!;
    } else {
      url = `https://discord.com/api/v10/channels/${channelId}/messages`;
      headers["Authorization"] = `Bot ${botToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      console.error(`[inbound/discord] Discord API returned ${response.status}: ${body}`);
      return;
    }

    console.log(`[inbound/discord] Alert sent for ${newLeads.length} new lead(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[inbound/discord] Failed to send Discord alert: ${message}`);
    // Intentionally swallowed — sync must never fail due to notification errors.
  }
}
