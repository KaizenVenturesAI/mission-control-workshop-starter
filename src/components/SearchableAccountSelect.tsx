"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";

export interface AccountOption {
  id: string;
  name: string;
  type?: string;
}

interface SearchableAccountSelectProps {
  accounts: AccountOption[];
  value: string; // accountId or empty
  onChange: (accountId: string, accountName: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  loading?: boolean;
}

export function SearchableAccountSelect({
  accounts,
  value,
  onChange,
  onCreateNew,
  placeholder = "Search or select an account…",
  loading = false,
}: SearchableAccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === value);

  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Focus create input when toggled
  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  const handleSelect = useCallback((account: AccountOption) => {
    onChange(account.id, account.name);
    setIsOpen(false);
    setSearch("");
    setIsCreating(false);
  }, [onChange]);

  const handleCreateSubmit = useCallback(() => {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreateNew(trimmed);
      setNewName("");
      setIsCreating(false);
      setIsOpen(false);
      setSearch("");
    }
  }, [newName, onCreateNew]);

  const triggerStyle: CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: selectedAccount ? "var(--color-client-text)" : "var(--color-client-text-dim)",
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    maxHeight: 260,
    overflowY: "auto",
    background: "#16161e",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    zIndex: 50,
    padding: "4px 0",
  };

  const searchInputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    background: "rgba(255,255,255,0.04)",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    color: "var(--color-client-text)",
    outline: "none",
    borderRadius: "8px 8px 0 0",
  };

  const optionStyle: CSSProperties = {
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--color-client-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    transition: "background 0.1s",
  };

  const createOptionStyle: CSSProperties = {
    ...optionStyle,
    color: "#dadadb",
    fontWeight: 600,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    position: "sticky",
    bottom: 0,
    background: "#16161e",
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setIsCreating(false); }}
        style={triggerStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(218,218,219,0.4)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {loading ? "Loading accounts…" : selectedAccount ? selectedAccount.name : placeholder}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 8, flexShrink: 0 }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={dropdownStyle}>
          {/* Search input */}
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to search…"
            style={searchInputStyle}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsOpen(false);
                setSearch("");
              }
            }}
          />

          {/* Account list */}
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px", fontSize: 12, color: "var(--color-client-text-dim)", textAlign: "center" }}>
                No accounts match &ldquo;{search}&rdquo;
              </div>
            )}
            {filtered.map((account) => (
              <div
                key={account.id}
                onClick={() => handleSelect(account)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                style={{
                  ...optionStyle,
                  background: account.id === value ? "rgba(34,197,94,0.08)" : "transparent",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {account.name}
                </span>
                {account.type && (
                  <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginLeft: 8, flexShrink: 0 }}>
                    {account.type}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Create New Account option */}
          {!isCreating ? (
            <div
              onClick={() => setIsCreating(true)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(34,211,153,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#16161e"; }}
              style={createOptionStyle}
            >
              <span>+ Create New Account</span>
            </div>
          ) : (
            <div style={{ ...createOptionStyle, flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 12px" }}>
              <span style={{ fontSize: 11, color: "#dadadb", fontWeight: 600 }}>New Account Name</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  ref={createInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter account name…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "var(--color-client-text)",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={!newName.trim()}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: newName.trim() ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(34,197,94,0.4)",
                    color: newName.trim() ? "#F4C7CA" : "var(--color-client-text-dim)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: newName.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
