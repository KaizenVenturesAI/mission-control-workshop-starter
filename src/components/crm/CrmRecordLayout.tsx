"use client";

import type React from "react";
import { CrmIdHeader } from "@/components/CrmIdDisplay";

export const crmActionButtonStyle: React.CSSProperties = {
  minHeight: 32,
  padding: "0 11px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 650,
  lineHeight: 1,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--color-client-text-secondary)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

export const crmPrimaryActionButtonStyle: React.CSSProperties = {
  ...crmActionButtonStyle,
  background: "rgba(218,218,219,0.14)",
  border: "1px solid rgba(218,218,219,0.28)",
  color: "#F4C7CA",
};

export const crmSuccessActionButtonStyle: React.CSSProperties = {
  ...crmActionButtonStyle,
  background: "rgba(218,218,219,0.12)",
  border: "1px solid rgba(218,218,219,0.24)",
  color: "#F4C7CA",
};

export const crmDangerActionButtonStyle: React.CSSProperties = {
  ...crmActionButtonStyle,
  background: "rgba(248,113,113,0.08)",
  border: "1px solid rgba(248,113,113,0.22)",
  color: "#F87171",
};

type CrmBadgeTone = "neutral" | "blue" | "green" | "amber" | "purple" | "red";

export function CrmBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: CrmBadgeTone;
}) {
  const tones: Record<CrmBadgeTone, { color: string; bg: string; border: string }> = {
    neutral: { color: "var(--color-client-text-secondary)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.09)" },
    blue: { color: "#F4C7CA", bg: "rgba(218,218,219,0.12)", border: "rgba(218,218,219,0.25)" },
    green: { color: "#F4C7CA", bg: "rgba(218,218,219,0.12)", border: "rgba(218,218,219,0.25)" },
    amber: { color: "#FBBF24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" },
    purple: { color: "#D8DCE3", bg: "rgba(196,201,209,0.12)", border: "rgba(196,201,209,0.25)" },
    red: { color: "#FCA5A5", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      minHeight: 22,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 650,
      color: t.color,
      background: t.bg,
      border: `1px solid ${t.border}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function CrmRecordHeader({
  eyebrow,
  title,
  subtitle,
  avatarLabel,
  avatarUrl,
  avatarGradient = "linear-gradient(135deg, rgba(218,218,219,0.72), rgba(232,67,147,0.62))",
  badges,
  meta,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  avatarLabel?: string;
  avatarUrl?: string;
  avatarGradient?: string;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          background: avatarGradient,
          color: "#fff",
          fontSize: 22,
          fontWeight: 750,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8 }} />
        ) : (
          (avatarLabel || "?").slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <div style={{ marginBottom: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", fontWeight: 700 }}>{eyebrow}</div> : null}
        <div style={{ fontSize: 22, lineHeight: 1.18, fontWeight: 700, color: "var(--color-client-text)", letterSpacing: 0 }}>
          {title}
        </div>
        {subtitle ? <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.45, color: "var(--color-client-text-secondary)" }}>{subtitle}</div> : null}
        {badges ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 10 }}>{badges}</div> : null}
        {meta ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 9, fontSize: 12, color: "var(--color-client-text-dim)" }}>{meta}</div> : null}
      </div>
      {actions ? <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 8 }}>{actions}</div> : null}
    </div>
  );
}

export function CrmActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
        {children}
      </div>
    </div>
  );
}

export type CrmHighlightItem = {
  label: string;
  value: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "purple" | "red" | "neutral";
  helper?: React.ReactNode;
};

export function CrmHighlightsGrid({ items }: { items: CrmHighlightItem[] }) {
  const toneColor: Record<NonNullable<CrmHighlightItem["tone"]>, string> = {
    blue: "#dadadb",
    green: "#dadadb",
    amber: "#FBBF24",
    purple: "#C4C9D1",
    red: "#F87171",
    neutral: "var(--color-client-text)",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8, marginBottom: 16 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            minHeight: 72,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", marginBottom: 5, fontWeight: 750 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 750, color: toneColor[item.tone ?? "neutral"] }}>
            {item.value}
          </div>
          {item.helper ? <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.35, color: "var(--color-client-text-dim)" }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}

export type CrmRecordSignal = {
  label: string;
  detail: React.ReactNode;
  tone?: "green" | "amber" | "red" | "neutral";
};

export function CrmRecordSignalPanel({ title = "Data quality", signals }: { title?: string; signals: CrmRecordSignal[] }) {
  const toneStyle: Record<NonNullable<CrmRecordSignal["tone"]>, { color: string; bg: string; border: string }> = {
    green: { color: "#F4C7CA", bg: "rgba(218,218,219,0.10)", border: "rgba(218,218,219,0.24)" },
    amber: { color: "#FBBF24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.24)" },
    red: { color: "#FCA5A5", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.26)" },
    neutral: { color: "var(--color-client-text-secondary)", bg: "rgba(255,255,255,0.035)", border: "rgba(255,255,255,0.08)" },
  };
  return (
    <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ marginBottom: 8, fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", fontWeight: 750 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {signals.map((signal) => {
          const tone = toneStyle[signal.tone ?? "neutral"];
          return (
            <span
              key={signal.label}
              title={typeof signal.detail === "string" ? signal.detail : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 28,
                padding: "4px 9px",
                borderRadius: 6,
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                color: tone.color,
                fontSize: 11,
                fontWeight: 650,
                whiteSpace: "nowrap",
              }}
            >
              <span>{signal.label}</span>
              <span style={{ color: "var(--color-client-text-dim)", fontWeight: 500 }}>{signal.detail}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function CrmNextBestActionPanel({
  title = "Next best action",
  action,
  detail,
  tone = "amber",
}: {
  title?: string;
  action: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "green" | "amber" | "red" | "neutral";
}) {
  const toneStyle: Record<NonNullable<CrmRecordSignal["tone"]>, { color: string; bg: string; border: string }> = {
    green: { color: "#F4C7CA", bg: "rgba(218,218,219,0.08)", border: "rgba(218,218,219,0.22)" },
    amber: { color: "#FBBF24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.22)" },
    red: { color: "#FCA5A5", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.24)" },
    neutral: { color: "var(--color-client-text-secondary)", bg: "rgba(255,255,255,0.025)", border: "rgba(255,255,255,0.08)" },
  };
  const t = toneStyle[tone];
  return (
    <div style={{ margin: "10px 0 14px", padding: "11px 12px", borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
      <div style={{ marginBottom: 5, fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", fontWeight: 750 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: t.color, fontWeight: 700 }}>
        {action}
      </div>
      {detail ? <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: "var(--color-client-text-dim)" }}>{detail}</div> : null}
    </div>
  );
}

export function CrmRecordPath({
  steps,
  current,
}: {
  steps: string[];
  current?: string;
}) {
  const activeIndex = current ? steps.findIndex((step) => step === current) : -1;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 4, margin: "4px 0 16px", overflowX: "auto", paddingBottom: 2 }}>
      {steps.map((step, index) => {
        const complete = activeIndex >= 0 && index < activeIndex;
        const active = index === activeIndex;
        return (
          <div
            key={step}
            style={{
              minWidth: 96,
              flex: "1 0 96px",
              minHeight: 30,
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: active ? "1px solid rgba(218,218,219,0.44)" : "1px solid rgba(255,255,255,0.08)",
              background: active ? "rgba(218,218,219,0.16)" : complete ? "rgba(218,218,219,0.10)" : "rgba(255,255,255,0.035)",
              color: active ? "#F4C7CA" : complete ? "#F4C7CA" : "var(--color-client-text-secondary)",
              fontSize: 11,
              fontWeight: active ? 800 : 650,
              whiteSpace: "nowrap",
            }}
          >
            {step}
          </div>
        );
      })}
    </div>
  );
}

type CrmLinkedRecordTone = "blue" | "green" | "amber" | "purple" | "neutral";

export function CrmLinkedRecordAction({
  label,
  displayId,
  href,
  detail,
  tone = "neutral",
}: {
  label: string;
  displayId: string;
  href: string;
  detail?: React.ReactNode;
  tone?: CrmLinkedRecordTone;
}) {
  const toneStyle: Record<CrmLinkedRecordTone, { color: string; bg: string; border: string }> = {
    neutral: { color: "var(--color-client-text-secondary)", bg: "rgba(255,255,255,0.035)", border: "rgba(255,255,255,0.08)" },
    blue: { color: "#F4C7CA", bg: "rgba(218,218,219,0.10)", border: "rgba(218,218,219,0.22)" },
    green: { color: "#F4C7CA", bg: "rgba(218,218,219,0.10)", border: "rgba(218,218,219,0.22)" },
    amber: { color: "#FBBF24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.22)" },
    purple: { color: "#D8DCE3", bg: "rgba(196,201,209,0.10)", border: "rgba(196,201,209,0.22)" },
  };
  const t = toneStyle[tone];
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        minHeight: 38,
        padding: "8px 10px",
        borderRadius: 8,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        textDecoration: "none",
        minWidth: 0,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", fontWeight: 750 }}>
          {label}
        </span>
        {detail ? (
          <span style={{ marginTop: 2, fontSize: 11, color: "var(--color-client-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {detail}
          </span>
        ) : null}
      </span>
      <span style={{ flexShrink: 0, fontFamily: "monospace", fontSize: 11, fontWeight: 750 }}>
        {displayId}
      </span>
    </a>
  );
}

export function CrmDrawerSection({
  title,
  action,
  children,
  compact = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section style={{ marginTop: compact ? 14 : 20, paddingTop: compact ? 14 : 18, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: compact ? 10 : 14 }}>
        <h3 style={{ margin: 0, fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "var(--color-client-text-dim)", fontWeight: 750 }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CrmRecordFooter({ rawId, entityType }: { rawId: string; entityType: "lead" | "contact" | "account" | "opportunity" }) {
  return (
    <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0, color: "rgba(255,255,255,0.32)", marginBottom: 6, fontWeight: 700 }}>
        Record ID
      </div>
      <CrmIdHeader rawId={rawId} entityType={entityType} />
    </div>
  );
}
