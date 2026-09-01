"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { clientBrand } from "@/config/brand";
import { getNavigationModules } from "@/config/modules";
import { useResponsive } from "@/lib/useMediaQuery";
import { StarterBrandMark } from "./StarterBrand";
// Auth removed from Sidebar - SWC dead-code elimination bug strips useAuthContext

const NAV_ITEMS = getNavigationModules().map((item) => ({ ...item, shortcut: item.key === "search" ? "⌘K" : undefined }));

export function Sidebar({ mobileOpen, onClose, onLock }: { mobileOpen?: boolean; onClose?: () => void; onLock?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isMobile, isTablet } = useResponsive();
  const [tabletHover, setTabletHover] = useState(false);
  
  
  

  // On tablet: collapsed by default, expand on hover
  const tabletCollapsed = isTablet && !tabletHover;
  const showLabels = isMobile ? true : isTablet ? tabletHover : !collapsed;
  const sidebarWidth = isMobile ? 260 : (tabletCollapsed ? 64 : (collapsed ? 64 : 240));

  // Mobile: render as overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 200,
              transition: "opacity 0.3s",
            }}
          />
        )}
        {/* Slide-in sidebar */}
        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: sidebarWidth,
            background: "linear-gradient(180deg, rgba(12,12,18,0.98) 0%, rgba(8,8,13,0.99) 100%)",
            borderRight: "1px solid var(--color-client-border)",
            zIndex: 210,
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.3s ease-out",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {renderBrand(true)}
          {renderNav(true, pathname, onClose)}
        </aside>
      </>
    );
  }

  // Tablet & Desktop
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full transition-all duration-300 ease-out"
      style={{
        width: sidebarWidth,
        background: "linear-gradient(180deg, rgba(12,12,18,0.98) 0%, rgba(8,8,13,0.99) 100%)",
        borderRight: "1px solid var(--color-client-border)",
      }}
      onMouseEnter={isTablet ? () => setTabletHover(true) : undefined}
      onMouseLeave={isTablet ? () => setTabletHover(false) : undefined}
    >
      {/* Brand + Collapse Toggle */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ padding: showLabels ? "16px 14px 16px 18px" : "16px 8px", justifyContent: showLabels ? "space-between" : "center" }}
      >
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <StarterBrandMark size={42} />
          {showLabels && (
            <div className="min-w-0">
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--color-client-text)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                }}
              >
                {clientBrand.shortName}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-client-text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Mission Control
              </div>
            </div>
          )}
        </div>
        {/* Notion-style collapse toggle */}
        {!isTablet && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.35)",
              fontSize: 16,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.35)";
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "≡" : "«"}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 flex flex-col gap-1 overflow-y-auto"
        style={{ padding: showLabels ? "0 12px" : "0 8px" }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl transition-all duration-150"
              style={{
                padding: showLabels ? "10px 12px" : "10px 0",
                justifyContent: showLabels ? "flex-start" : "center",
                background: isActive
                  ? "rgba(218,218,219,0.12)"
                  : "transparent",
                color: isActive
                  ? "var(--color-client-text)"
                  : "var(--color-client-text-secondary)",
                border: isActive
                  ? "1px solid rgba(218,218,219,0.24)"
                  : "1px solid transparent",
                fontSize: 13,
                minHeight: 44,
              }}
              title={!showLabels ? item.label : undefined}
            >
              <span
                style={{
                  fontSize: 16,
                  width: 20,
                  textAlign: "center",
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                {item.icon}
              </span>
              {showLabels && <span className="flex-1">{item.label}</span>}
              {showLabels && item.shortcut && (
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "1px 6px" }}>{item.shortcut}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div
        className="flex-shrink-0 flex flex-col gap-2"
        style={{
          padding: showLabels ? "16px 12px" : "16px 8px",
          borderTop: "1px solid var(--color-client-border)",
        }}
      >
        {onLock && (
          <button
            onClick={onLock}
            className="w-full flex items-center justify-center gap-2 rounded-lg transition-colors"
            style={{
              padding: "8px",
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--color-client-text-dim)",
              fontSize: 12,
              minHeight: 36,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
            title="Lock"
            aria-label="Lock Mission Control"
          >
            <span style={{ fontSize: 14 }}>🔒</span>
            {showLabels && <span>Lock</span>}
          </button>
        )}

      </div>
    </aside>
  );
}

function renderBrand(showLabels: boolean) {
  return (
    <div
      className="flex items-center gap-3 flex-shrink-0"
      style={{ padding: "20px 18px" }}
    >
      <StarterBrandMark size={42} />
      {showLabels && (
        <div className="min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {clientBrand.shortName}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Mission Control
          </div>
        </div>
      )}
    </div>
  );
}

function renderNav(showLabels: boolean, pathname: string, onClose?: () => void) {
  return (
    <nav
      className="flex-1 flex flex-col gap-1 overflow-y-auto"
      style={{ padding: "0 12px" }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl transition-all duration-150"
            style={{
              padding: "10px 12px",
              justifyContent: "flex-start",
              background: isActive ? "rgba(218,218,219,0.12)" : "transparent",
              color: isActive ? "var(--color-client-text)" : "var(--color-client-text-secondary)",
              border: isActive ? "1px solid rgba(218,218,219,0.24)" : "1px solid transparent",
              fontSize: 13,
              minHeight: 44,
            }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0, opacity: isActive ? 1 : 0.6 }}>
              {item.icon}
            </span>
            {showLabels && <span className="flex-1">{item.label}</span>}
            {showLabels && item.shortcut && (
              <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "1px 6px" }}>{item.shortcut}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
