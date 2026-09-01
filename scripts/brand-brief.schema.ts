import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const brandBriefSchema = z.object({
  company: z.object({
    legalName: z.string().min(2),
    displayName: z.string().min(2),
    shortName: z.string().min(2).max(24),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/),
    repositoryName: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/),
  }),
  product: z.object({
    name: z.string().min(2),
    tagline: z.string().min(8),
    audience: z.string().min(8),
    tone: z.array(z.string().min(2)).min(1),
    supportEmail: z.string().email(),
    baseUrl: z.string().url(),
  }),
  brand: z.object({
    initials: z.string().regex(/^[A-Z0-9]{2,4}$/),
    colors: z.object({
      primary: hex,
      secondary: hex,
      accent: hex,
      background: hex,
      surface: hex,
      border: hex,
      text: hex,
      textSecondary: hex,
    }),
    typography: z.object({
      sans: z.string().min(2),
      mono: z.string().min(2),
    }),
    prohibitedTerms: z.array(z.string().min(2)).default([]),
  }),
  assets: z.object({
    logo: z.string().optional(),
    favicon: z.string().optional(),
    socialPreview: z.string().optional(),
    license: z.string().min(2),
    attribution: z.string().min(2),
  }),
  modules: z.object({
    optionalEnabled: z.array(z.string()).default([]),
  }).default({ optionalEnabled: [] }),
});

export type BrandBrief = z.infer<typeof brandBriefSchema>;
