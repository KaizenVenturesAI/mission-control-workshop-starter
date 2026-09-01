import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function copyRepoFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mc-scan-"));
  cpSync(process.cwd(), dir, {
    recursive: true,
    filter: (source) => ![".git", "node_modules", ".next", "coverage"].some((part) => source.includes(`${path.sep}${part}`)),
  });
  return dir;
}

describe("template scanner", () => {
  it("passes the clean starter", () => {
    const result = spawnSync("node", ["scripts/template-scan.mjs"], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Blockers: 0");
  });

  it("fails on deliberate prior-client breadcrumbs and secrets", () => {
    const dir = copyRepoFixture();
    const priorClientName = ["Digital", "Twin"].join(" ");
    const fakeSecret = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
    writeFileSync(path.join(dir, "residue.txt"), `${priorClientName} ${fakeSecret}`);
    const result = spawnSync("node", ["scripts/template-scan.mjs"], { cwd: dir, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Prior-client or owner marker");
    expect(result.stdout).toContain("OpenAI API key");
  });

  it("fails on camelCase and separator variants of blocked identities", () => {
    const dir = copyRepoFixture();
    const priorClientVariable = ["digital", "Twin", "UserId"].join("");
    const legacyPersona = ["mission", "Agent", "-", "finch"].join("");
    writeFileSync(path.join(dir, "residue.ts"), `const ${priorClientVariable} = "${legacyPersona}";`);
    const result = spawnSync("node", ["scripts/template-scan.mjs"], { cwd: dir, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Prior-client or owner marker");
    expect(result.stdout).toContain("Legacy persona marker");
  });

  it("allows validated client endpoints and prohibited-term policy in generated brand config", () => {
    const dir = copyRepoFixture();
    const clientUrl = ["https:/", "client-portal.test"].join("/");
    const clientColor = ["#E5", "A958"].join("");
    const prohibitedTerms = [["Kai", "zen"].join(""), ["Digital", "Twin"].join(" "), ["Sa", "va"].join("")];
    writeFileSync(path.join(dir, "src/config/brand.ts"), `
export const clientBrand = clientBrandSchema.parse({
  "baseUrl": "${clientUrl}",
  "supportEmail": "operator@example.invalid",
  "prohibitedTerms": ${JSON.stringify(prohibitedTerms)}
});
`);
    writeFileSync(path.join(dir, ".env.example"), `NEXT_PUBLIC_BASE_URL=${clientUrl}\n`);
    mkdirSync(path.join(dir, "scripts/reports"), { recursive: true });
    writeFileSync(path.join(dir, "scripts/reports/client-handoff.json"), JSON.stringify({
      brief: {
        product: { baseUrl: clientUrl },
        brand: { colors: { primary: clientColor }, prohibitedTerms },
      },
    }));
    const result = spawnSync("node", ["scripts/template-scan.mjs"], { cwd: dir, encoding: "utf8" });
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toContain("Blockers: 0");
  });
});
