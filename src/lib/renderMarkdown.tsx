import React from "react";

/**
 * Parse inline markdown (bold, italic, code, links) into React elements.
 * No external libraries — just regex splitting.
 */
export function renderInlineMarkdown(text: string): React.ReactNode {
  // Combined pattern: **bold**, *italic*, `code`, [text](url)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] !== undefined) {
      // **bold**
      parts.push(
        <strong key={key++} style={{ fontWeight: 600, color: "var(--color-client-text)" }}>
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      // *italic*
      parts.push(
        <em key={key++} style={{ fontStyle: "italic" }}>
          {match[3]}
        </em>
      );
    } else if (match[4] !== undefined) {
      // `code`
      parts.push(
        <code
          key={key++}
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.9em",
            background: "rgba(255,255,255,0.06)",
            padding: "1px 5px",
            borderRadius: 3,
          }}
        >
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [text](url)
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#60a5fa", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          {match[5]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no markdown was found, return original string (avoids unnecessary wrapper)
  if (parts.length === 0) return text;
  if (parts.length === 1 && typeof parts[0] === "string") return text;

  return <>{parts}</>;
}
