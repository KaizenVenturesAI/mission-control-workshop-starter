import { z } from "zod";

export const clientBrandSchema = z.object({
  clientName: z.string().min(2),
  productName: z.string().min(2),
  shortName: z.string().min(2).max(24),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/),
  initials: z.string().regex(/^[A-Z0-9]{2,4}$/),
  description: z.string().min(12),
  baseUrl: z.string().url(),
  supportEmail: z.string().email(),
  typography: z.object({ sans: z.string(), mono: z.string() }),
  colors: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    border: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  assets: z.object({
    logoPath: z.string(),
    ogImagePath: z.string(),
    icon192Path: z.string(),
    icon512Path: z.string(),
    appleTouchIconPath: z.string(),
  }),
});

export type ClientBrandConfig = z.infer<typeof clientBrandSchema>;

export const clientBrand = clientBrandSchema.parse({
  clientName: "Example Client",
  productName: "Mission Control",
  shortName: "ExampleCo",
  slug: "example-client",
  initials: "EC",
  description: "Private operating system starter for CRM, action tracking, agent work, and execution.",
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  supportEmail: "operator@example.invalid",
  typography: {
    sans: "Inter",
    mono: "Geist Mono",
  },
  colors: {
    background: "#090b0f",
    surface: "#111827",
    border: "#334155",
    text: "#f8fafc",
    textSecondary: "#cbd5e1",
    accent: "#14b8a6",
    accentSecondary: "#f59e0b",
  },
  assets: {
    logoPath: "/brand/starter-logo.svg",
    ogImagePath: "/brand/starter-og.svg",
    icon192Path: "/icons/icon-192.svg",
    icon512Path: "/icons/icon-512.svg",
    appleTouchIconPath: "/icons/apple-touch-icon.svg",
  },
} satisfies ClientBrandConfig);
