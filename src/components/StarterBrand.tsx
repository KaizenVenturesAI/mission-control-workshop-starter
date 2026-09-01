"use client";

import type React from "react";
import { clientBrand } from "@/config/brand";

export function StarterBrandMark({
  size = 36,
  animated = false,
  subtle = false,
  style,
}: {
  size?: number;
  animated?: boolean;
  subtle?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={animated ? "kv-mark-shell kv-mark-shell--animated" : "kv-mark-shell"}
      style={{
        width: size,
        height: Math.round(size * 0.84),
        borderRadius: Math.max(6, Math.round(size * 0.14)),
        opacity: subtle ? 0.72 : 1,
        ...style,
      }}
    >
      <span
        aria-label={`${clientBrand.shortName} mark`}
        style={{
          display: "grid",
          placeItems: "center",
          width: "100%",
          height: "100%",
          borderRadius: "inherit",
          background: `linear-gradient(135deg, ${clientBrand.colors.surface} 0%, ${clientBrand.colors.accent} 58%, ${clientBrand.colors.accentSecondary} 100%)`,
          color: clientBrand.colors.text,
          fontSize: Math.max(11, Math.round(size * 0.3)),
          fontWeight: 800,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {clientBrand.initials}
      </span>
    </span>
  );
}

export function StarterLoadingScreen({ label = `Loading ${clientBrand.productName}` }: { label?: string }) {
  const streams = [clientBrand.initials, "AI", "OPS", "CRM", "512", "297", "497", "MC"];

  return (
    <div className="kv-loader-screen">
      <div className="kv-loader-grid" aria-hidden="true" />
      <div className="kv-loader-streams" aria-hidden="true">
        {streams.map((stream, index) => (
          <span key={`${stream}-${index}`} style={{ left: `${8 + index * 12}%`, animationDelay: `${index * 0.22}s` }}>
            {stream}
          </span>
        ))}
      </div>
      <div className="kv-loader-core" role="status" aria-live="polite">
        <div className="kv-loader-orbit" aria-hidden="true" />
        <StarterBrandMark size={108} animated />
        <div className="kv-loader-copy">
          <div>{label}</div>
          <span>Initializing {clientBrand.shortName} systems</span>
        </div>
      </div>
    </div>
  );
}
