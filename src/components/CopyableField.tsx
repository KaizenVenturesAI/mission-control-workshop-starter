"use client";

import { useCallback, useState, type CSSProperties } from "react";

/**
 * CopyableField — inline label + value with a copy-to-clipboard icon.
 * Shows a brief "Copied!" flash on click. Use anywhere contact info is displayed.
 *
 * Usage:
 *   <CopyableField label="Email" value="anna@example.com" />
 *   <CopyableField value="415-300-7156" />  // no label, inline mode
 */

export function CopyableField({
  label,
  value,
  size = "md",
  mono = false,
  inline = false,
}: {
  label?: string;
  value: string | undefined | null;
  size?: "sm" | "md";
  mono?: boolean;
  inline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [value]);

  if (!value) return null;

  const isSm = size === "sm";
  const fontSize = isSm ? 11 : 13;
  const labelFontSize = isSm ? 10 : 11;

  if (inline) {
    return (
      <span
        className="copyable-field"
        onClick={handleCopy}
        style={{
          ...inlineWrapStyle,
          fontSize,
          cursor: "pointer",
        }}
        title={`Copy: ${value}`}
      >
        <span style={{ color: "var(--color-client-text)", fontFamily: mono ? "monospace" : "inherit" }}>
          {value}
        </span>
        <span className="copy-icon" style={iconStyle}>
          {copied ? "✓" : "⎘"}
        </span>
        {copied && <span style={copiedFlashStyle}>Copied!</span>}
      </span>
    );
  }

  return (
    <div
      className="copyable-field flex items-start gap-2"
      style={{ marginBottom: isSm ? 4 : 8 }}
    >
      {label && (
        <span
          style={{
            fontSize: labelFontSize,
            color: "var(--color-client-text-dim)",
            minWidth: isSm ? 48 : 64,
            paddingTop: 1,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
      )}
      <span
        onClick={handleCopy}
        style={{
          ...fieldWrapStyle,
          fontSize,
          fontFamily: mono ? "monospace" : "inherit",
          cursor: "pointer",
        }}
        title={`Copy: ${value}`}
      >
        <span style={{ color: "var(--color-client-text)" }}>{value}</span>
        <span className="copy-icon" style={iconStyle}>
          {copied ? "✓" : "⎘"}
        </span>
        {copied && <span style={copiedFlashStyle}>Copied!</span>}
      </span>
    </div>
  );
}

/**
 * CopyableText — minimal inline variant for use in headers/subtitles.
 * Just the text + copy icon on hover, no label.
 */
export function CopyableText({
  value,
  style,
  className,
}: {
  value: string | undefined | null;
  style?: CSSProperties;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  if (!value) return null;

  return (
    <span
      className={`copyable-field ${className ?? ""}`}
      onClick={handleCopy}
      style={{
        ...inlineWrapStyle,
        cursor: "pointer",
        ...style,
      }}
      title={`Copy: ${value}`}
    >
      {value}
      <span className="copy-icon" style={iconStyle}>
        {copied ? "✓" : "⎘"}
      </span>
      {copied && <span style={copiedFlashStyle}>Copied!</span>}
    </span>
  );
}

/* ── Styles ── */

const inlineWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  position: "relative",
};

const fieldWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  position: "relative",
  borderRadius: 4,
  padding: "1px 4px",
  marginLeft: -4,
  transition: "background 0.15s",
};

const iconStyle: CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.3)",
  opacity: 1,
  transition: "color 0.15s",
  flexShrink: 0,
  lineHeight: 1,
};

const copiedFlashStyle: CSSProperties = {
  position: "absolute",
  right: -48,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 10,
  fontWeight: 600,
  color: "#34D399",
  whiteSpace: "nowrap",
  animation: "fade-in 0.15s ease-out",
};
