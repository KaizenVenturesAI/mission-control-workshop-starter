import { describe, expect, it } from "vitest";
import { clientBrand, clientBrandSchema } from "@/config/brand";
import { getNavigationModules, moduleConfig, moduleConfigSchema } from "@/config/modules";

describe("starter configuration", () => {
  it("validates the typed brand config", () => {
    expect(clientBrandSchema.parse(clientBrand)).toEqual(clientBrand);
    expect(clientBrand.slug).toMatch(/^[a-z0-9][a-z0-9-]+[a-z0-9]$/);
  });

  it("keeps core modules enabled and optional modules explicit", () => {
    for (const item of moduleConfig) expect(moduleConfigSchema.parse(item).key).toBe(item.key);
    expect(moduleConfig.filter((item) => item.core).every((item) => item.enabled && item.configured)).toBe(true);
    expect(moduleConfig.filter((item) => !item.core).every((item) => item.configured === false)).toBe(true);
    expect(getNavigationModules().map((item) => item.key)).toContain("crm");
  });
});
