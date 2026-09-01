export type CanonicalDevOwner = "Alex" | "Morgan" | "Example Client Mission Agent" | "Example Client" | "Unknown / Unmapped";

export interface RawDevAttribution {
  name?: string | null;
  email?: string | null;
  login?: string | null;
}

const OWNER_PATTERNS: Array<{ owner: CanonicalDevOwner; tests: RegExp[] }> = [
  {
    owner: "Alex",
    tests: [/^alex(\s+operator)?$/i, /alex@example\.invalid/i],
  },
  {
    owner: "Morgan",
    tests: [/^morgan(\s+operator)?$/i, /morgan@example\.invalid/i],
  },
  {
    owner: "Example Client Mission Agent",
    tests: [/^operationsAgent$/i, /operations-agent@example\.invalid/i],
  },
  {
    owner: "Example Client",
    tests: [/^example client operations$/i, /^exampleclient$/i, /ops@example\.invalid/i],
  },
];

export function normalizeDevOwner(...attributions: RawDevAttribution[]): CanonicalDevOwner {
  const values = attributions
    .flatMap((attr) => [attr.name, attr.email, attr.login])
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());

  for (const value of values) {
    for (const pattern of OWNER_PATTERNS) {
      if (pattern.tests.some((test) => test.test(value))) return pattern.owner;
    }
  }

  return "Unknown / Unmapped";
}
