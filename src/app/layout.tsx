import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { clientBrand } from "@/config/brand";
import "@/lib/localStorageShim";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(clientBrand.baseUrl),
  title: `${clientBrand.shortName} ${clientBrand.productName}`,
  description: clientBrand.description,
  applicationName: `${clientBrand.shortName} ${clientBrand.productName}`,
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: `${clientBrand.shortName} ${clientBrand.productName}`,
    description: clientBrand.description,
    siteName: `${clientBrand.shortName} ${clientBrand.productName}`,
    images: [
      {
        url: clientBrand.assets.ogImagePath,
        width: 1200,
        height: 630,
        alt: `${clientBrand.shortName} ${clientBrand.productName}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${clientBrand.shortName} ${clientBrand.productName}`,
    description: clientBrand.description,
    images: [clientBrand.assets.ogImagePath],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: `${clientBrand.shortName} ${clientBrand.productName}`,
  },
  icons: {
    icon: [
      { url: clientBrand.assets.icon192Path, sizes: "any", type: assetMimeType(clientBrand.assets.icon192Path) },
      { url: clientBrand.assets.icon192Path, sizes: "192x192", type: assetMimeType(clientBrand.assets.icon192Path) },
      { url: clientBrand.assets.icon512Path, sizes: "512x512", type: assetMimeType(clientBrand.assets.icon512Path) },
    ],
    apple: [
      {
        url: clientBrand.assets.appleTouchIconPath,
        sizes: "180x180",
        type: assetMimeType(clientBrand.assets.appleTouchIconPath),
      },
    ],
  },
};

function assetMimeType(assetPath: string): "image/png" | "image/svg+xml" {
  return assetPath.toLowerCase().endsWith(".png") ? "image/png" : "image/svg+xml";
}

const brandCssVariables = {
  "--color-client-bg": clientBrand.colors.background,
  "--color-client-surface": clientBrand.colors.surface,
  "--color-client-surface-raised": clientBrand.colors.surface,
  "--color-client-surface-hover": clientBrand.colors.border,
  "--color-client-card": clientBrand.colors.surface,
  "--color-client-border": clientBrand.colors.border,
  "--color-client-border-subtle": clientBrand.colors.border,
  "--color-client-text": clientBrand.colors.text,
  "--color-client-text-secondary": clientBrand.colors.textSecondary,
  "--color-client-text-dim": clientBrand.colors.textSecondary,
  "--color-client-pink": clientBrand.colors.accent,
  "--color-client-pink-dim": `${clientBrand.colors.accent}20`,
  "--color-client-blue": clientBrand.colors.accent,
  "--color-client-blue-dim": `${clientBrand.colors.accent}20`,
  "--color-client-purple": clientBrand.colors.accentSecondary,
  "--color-client-purple-dim": `${clientBrand.colors.accentSecondary}20`,
  "--font-sans": `${clientBrand.typography.sans}, Inter, Geist, sans-serif`,
  "--font-mono": `${clientBrand.typography.mono}, SFMono-Regular, monospace`,
} as CSSProperties;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" style={brandCssVariables}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
