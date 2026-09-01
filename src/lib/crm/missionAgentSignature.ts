import { existsSync, readFileSync } from "fs";

export const CLIENT_OPERATOR_EMAIL = process.env.CLIENT_OPERATOR_EMAIL || "primary@example.invalid";
export const BD_DEFAULT_CC = process.env.CLIENT_DEFAULT_CC || "primary@example.invalid";
export const CLIENT_SIGNATURE_VERSION = "missionAgent-chief-of-staff-v1";
export const CLIENT_SIGNATURE_LOGO_CID = "example-client-email-logo";
export const CLIENT_SIGNATURE_LOGO_PATH = process.env.CLIENT_SIGNATURE_LOGO_PATH || "";
export const CLIENT_SIGNATURE_LOGO_DISPLAY = {
  width: 80,
  height: 80,
};

export function getMissionAgentSignatureText(): string {
  return [
    "Best,",
    "Example Client Mission Agent",
    "",
    "Chief of Staff to Alex",
    CLIENT_OPERATOR_EMAIL,
    "",
    "Example Client",
    "example.invalid",
  ].join("\n");
}

export function getMissionAgentSignatureHtml(): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111111;">',
    "  <tr>",
    '    <td style="padding:0 0 12px 0;">',
    "      Best,<br>",
    "      <strong>Example Client Mission Agent</strong><br><br>",
    "      Chief of Staff to Alex<br>",
    `      <a href="mailto:${CLIENT_OPERATOR_EMAIL}" style="color:#111111;text-decoration:none;">${CLIENT_OPERATOR_EMAIL}</a><br><br>`,
    "      Example Client<br>",
    '      <a href="https://example.invalid" style="color:#111111;text-decoration:none;">example.invalid</a>',
    "    </td>",
    "  </tr>",
    "  <tr>",
    '    <td style="padding:0;">',
    `      <img src="cid:${CLIENT_SIGNATURE_LOGO_CID}" alt="Example Client" width="${CLIENT_SIGNATURE_LOGO_DISPLAY.width}" height="${CLIENT_SIGNATURE_LOGO_DISPLAY.height}" style="display:block;border:0;width:${CLIENT_SIGNATURE_LOGO_DISPLAY.width}px;height:${CLIENT_SIGNATURE_LOGO_DISPLAY.height}px;max-width:${CLIENT_SIGNATURE_LOGO_DISPLAY.width}px;">`,
    "    </td>",
    "  </tr>",
    "</table>",
  ].join("\n");
}

export function getMissionAgentLogoAttachment(): { path: string; contentId: string; mimeType: string; fileName: string; contentBase64: string } | null {
  if (!CLIENT_SIGNATURE_LOGO_PATH || !existsSync(/*turbopackIgnore: true*/ CLIENT_SIGNATURE_LOGO_PATH)) {
    return null;
  }
  const content = readFileSync(/*turbopackIgnore: true*/ CLIENT_SIGNATURE_LOGO_PATH);
  return {
    path: CLIENT_SIGNATURE_LOGO_PATH,
    contentId: CLIENT_SIGNATURE_LOGO_CID,
    mimeType: "image/png",
    fileName: "example-client-email-logo.png",
    contentBase64: content.toString("base64"),
  };
}

export function appendMissionAgentSignatureText(body: string): string {
  const trimmed = body.trim();
  return `${trimmed}\n\n${getMissionAgentSignatureText()}`;
}

export function appendMissionAgentSignatureHtml(bodyHtml: string): string {
  return [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111111;">',
    bodyHtml,
    "</div>",
    '<div style="height:18px;line-height:18px;">&nbsp;</div>',
    getMissionAgentSignatureHtml(),
  ].join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToHtml(value: string): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px 0;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
