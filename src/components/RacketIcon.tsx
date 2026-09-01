import React from "react";

interface RacketIconProps {
  expanded: boolean;
  size?: number;
  color?: string;
}

export default function RacketIcon({ expanded, size = 24, color = "currentColor" }: RacketIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "inline-block",
        transition: "transform 0.2s ease",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      {/* Racket head - clean oval */}
      <ellipse cx="12" cy="9" rx="7" ry="8" stroke={color} strokeWidth="2" fill="none" />
      {/* Simplified strings - 2 horizontal, 1 vertical cross */}
      <line x1="6" y1="7" x2="18" y2="7" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="6" y1="11" x2="18" y2="11" stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1="12" y1="1.5" x2="12" y2="16.5" stroke={color} strokeWidth="1" opacity="0.6" />
      {/* Handle - thicker for visibility */}
      <line x1="12" y1="17" x2="12" y2="23" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
