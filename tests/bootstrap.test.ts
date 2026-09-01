import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

describe("client bootstrap", () => {
  it("supports deterministic fictional dry runs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mc-demo-"));
    mkdirSync(path.join(root, "public/brand"), { recursive: true });
    mkdirSync(path.join(root, "public/icons"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "starter", scripts: {} }));
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.next/\n");
    writeFileSync(path.join(root, ".github/workflows/verify.yml"), "name: Verify\n");
    writeFileSync(path.join(root, "brief.json"), readFileSync("docs/brand-brief.example.json", "utf8"));
    writeFileSync(path.join(root, "public/brand/starter-logo.svg"), '<svg width="256" height="128" xmlns="http://www.w3.org/2000/svg"></svg>');
    writeFileSync(path.join(root, "public/icons/icon-512.svg"), '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"></svg>');
    writeFileSync(path.join(root, "public/brand/starter-og.svg"), '<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"></svg>');
    const command = [path.resolve("scripts/bootstrap-client.ts"), "--brief=brief.json", "--dry-run", "--allow-demo-assets"];
    const first = spawnSync(path.resolve("node_modules/.bin/tsx"), command, { cwd: root, encoding: "utf8" });
    const second = spawnSync(path.resolve("node_modules/.bin/tsx"), command, { cwd: root, encoding: "utf8" });
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout.replace(/Elapsed: .*s/g, "Elapsed: <time>")).toBe(second.stdout.replace(/Elapsed: .*s/g, "Elapsed: <time>"));
    expect(first.stdout).toContain("Dry run: yes");
    expect(first.stdout).toContain("Production ready: no — demo assets are for fictional dry runs only");
  });

  it("refuses incomplete production asset briefs", () => {
    const brief = JSON.parse(readFileSync("docs/brand-brief.example.json", "utf8"));
    delete brief.assets.logo;
    delete brief.assets.favicon;
    delete brief.assets.socialPreview;
    const dir = mkdtempSync(path.join(tmpdir(), "mc-brief-"));
    const briefPath = path.join(dir, "brief.json");
    writeFileSync(briefPath, JSON.stringify(brief));
    const result = spawnSync("npm", ["run", "bootstrap:client", "--", `--brief=${briefPath}`, "--dry-run"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production bootstrap requires logo, favicon, and socialPreview assets");
  });

  it("requires an explicit exception for undersized source assets and records non-readiness", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mc-low-res-"));
    const assets = path.join(root, "assets");
    mkdirSync(assets, { recursive: true });
    await sharp({ create: { width: 74, height: 72, channels: 4, background: { r: 214, g: 160, b: 45, alpha: 1 } } }).png().toFile(path.join(assets, "logo.png"));
    await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 214, g: 160, b: 45, alpha: 1 } } }).png().toFile(path.join(assets, "favicon.png"));
    await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toFile(path.join(assets, "social.png"));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "starter", scripts: {} }));
    const brief = JSON.parse(readFileSync("docs/brand-brief.example.json", "utf8"));
    brief.assets = { logo: "assets/logo.png", favicon: "assets/favicon.png", socialPreview: "assets/social.png", license: "Client supplied", attribution: "Client" };
    writeFileSync(path.join(root, "brief.json"), JSON.stringify(brief));
    const script = path.resolve("scripts/bootstrap-client.ts");
    const tsx = path.resolve("node_modules/.bin/tsx");

    const blocked = spawnSync(tsx, [script, "--brief=brief.json"], { cwd: root, encoding: "utf8" });
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("dimensions 74x72 are below the required 128x64");

    const allowed = spawnSync(tsx, [script, "--brief=brief.json", "--allow-low-resolution-assets"], { cwd: root, encoding: "utf8" });
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain("Production ready: no");
    const report = readFileSync(path.join(root, "scripts/reports/example-client-handoff.json"), "utf8");
    expect(report).toContain('"belowMinimum": true');
    expect(report).toContain('"productionReady": false');

    const exportDir = path.join(root, "export");
    const exportAttempt = spawnSync(tsx, [script, "--brief=brief.json", "--allow-low-resolution-assets", `--export-dir=${exportDir}`], { cwd: root, encoding: "utf8" });
    expect(exportAttempt.status).not.toBe(0);
    expect(exportAttempt.stderr).toContain("Client export requires complete, production-resolution client assets");
  });

  it("preserves raster asset types and generates correctly sized icon derivatives", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mc-bootstrap-"));
    const assets = path.join(root, "assets");
    mkdirSync(assets, { recursive: true });
    await sharp({ create: { width: 256, height: 128, channels: 4, background: { r: 214, g: 160, b: 45, alpha: 0.9 } } }).png().toFile(path.join(assets, "logo.png"));
    await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 214, g: 160, b: 45, alpha: 1 } } }).png().toFile(path.join(assets, "favicon.png"));
    await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toFile(path.join(assets, "social.png"));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "starter", scripts: {} }));
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.next/\n");
    writeFileSync(path.join(root, ".github/workflows/verify.yml"), "name: Verify\n");
    const brief = JSON.parse(readFileSync("docs/brand-brief.example.json", "utf8"));
    brief.company.displayName = "Northstar Group";
    brief.company.repositoryName = "northstar-mission-control";
    brief.brand.prohibitedTerms = ["Confidential Prior Owner"];
    brief.assets = {
      logo: "assets/logo.png",
      favicon: "assets/favicon.png",
      socialPreview: "assets/social.png",
      license: "Client supplied",
      attribution: "Northstar Group",
    };
    writeFileSync(path.join(root, "brief.json"), JSON.stringify(brief));

    const result = spawnSync(path.resolve("node_modules/.bin/tsx"), [path.resolve("scripts/bootstrap-client.ts"), "--brief=brief.json"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(root, "public/brand/client-logo.png")).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(readFileSync(path.join(root, "public/brand/client-og.png")).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    await expect(sharp(path.join(root, "public/icons/icon-192.png")).metadata()).resolves.toMatchObject({ width: 192, height: 192, format: "png" });
    await expect(sharp(path.join(root, "public/icons/icon-512.png")).metadata()).resolves.toMatchObject({ width: 512, height: 512, format: "png" });
    await expect(sharp(path.join(root, "public/icons/apple-touch-icon.png")).metadata()).resolves.toMatchObject({ width: 180, height: 180, format: "png" });
    expect(readFileSync(path.join(root, "src/config/brand.ts"), "utf8")).toContain('"logoPath": "/brand/client-logo.png"');
    expect(readFileSync(path.join(root, "src/config/brand.ts"), "utf8")).not.toContain("Confidential Prior Owner");
    expect(readFileSync(path.join(root, "scripts/reports/example-client-handoff.json"), "utf8")).not.toContain("Confidential Prior Owner");
    expect(readFileSync(path.join(root, "src/data/settings-users.json"), "utf8")).toContain('operator@example-client.example');
    const manifest = JSON.parse(readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
    expect(manifest.name).toBe("Northstar Group Mission Control");
    expect(manifest.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ]);

    const exportDir = mkdtempSync(path.join(tmpdir(), "mc-client-export-"));
    const exported = spawnSync(path.resolve("node_modules/.bin/tsx"), [path.resolve("scripts/bootstrap-client.ts"), "--brief=brief.json", `--export-dir=${exportDir}`], { cwd: root, encoding: "utf8" });
    expect(exported.status, exported.stderr).toBe(0);
    expect(existsSync(path.join(exportDir, "brief.json"))).toBe(false);
    expect(existsSync(path.join(exportDir, "assets/logo.png"))).toBe(false);
    expect(existsSync(path.join(exportDir, "assets/favicon.png"))).toBe(false);
    expect(existsSync(path.join(exportDir, "assets/social.png"))).toBe(false);
    expect(existsSync(path.join(exportDir, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(exportDir, ".github/workflows/verify.yml"))).toBe(true);
  });
});
