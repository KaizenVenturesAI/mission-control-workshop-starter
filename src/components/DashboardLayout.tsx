"use client";

import "@/lib/localStorageShim";
import { useState, useEffect, Component, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AuthProvider, LockedScreen, LoginScreen, SetPasswordScreen, useAuthContext } from "./AuthGate";
import { StarterLoadingScreen } from "./StarterBrand";
import { CommandPalette } from "./CommandPalette";
import { useResponsive } from "@/lib/useMediaQuery";

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Home", icon: "◈" },
  { href: "/contacts", label: "CRM", icon: "☷" },
  { href: "/action-board", label: "Actions", icon: "☰" },
  { href: "/strategy", label: "Strategy", icon: "◆" },
  { href: "/search", label: "Search", icon: "⌕" },
];

function clearBrowserStorageAndReload() {
  try {
    window.localStorage?.clear();
  } catch {
    // Safari can deny storage access; reload still gives the app a clean pass.
  }
  window.location.reload();
}

/* ─── Error Boundary ─── */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error; info?: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info: info.componentStack ?? "" });
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[MC ErrorBoundary]", error, info.componentStack);
    }
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? "Unknown error";
      const stack = this.state.info ?? this.state.error?.stack ?? "";
      return (
        <div style={{ padding: 40, color: "#fff", background: "#0a0a0f", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#888", marginTop: 0, marginBottom: 12, textAlign: "center" }}>Try refreshing the page or clearing your browser cache.</p>
          <pre style={{ maxWidth: 720, width: "100%", whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 12, fontSize: 12, color: "#f87171", marginBottom: 12 }}>{msg}</pre>
          {stack ? (
            <details style={{ maxWidth: 720, width: "100%", color: "#888", fontSize: 11, marginBottom: 16 }}>
              <summary style={{ cursor: "pointer" }}>Stack trace</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{stack}</pre>
            </details>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { window.location.reload(); }} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Reload</button>
            <button onClick={clearBrowserStorageAndReload} style={{ padding: "10px 20px", background: "rgb(232,67,147)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Clear Cache & Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const pathname = usePathname();
  const { isMobile } = useResponsive();
  const { user, loading, locked, passwordRecoveryMode, lock } = useAuthContext();
  const isCRMRoute = pathname === "/contacts" || pathname === "/accounts" || pathname === "/opportunities" || pathname === "/inbound";

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) {
    return <StarterLoadingScreen />;
  }
  if (passwordRecoveryMode) return <SetPasswordScreen />;
  if (!user) return <LoginScreen />;
  if (locked) return <LockedScreen />;

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--color-client-bg)" }}>
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} onLock={lock} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onHamburger={isMobile ? () => setMobileMenuOpen(true) : undefined} />
        <main
          className={`flex-1 overflow-y-auto mission-main-scroll${isCRMRoute ? " mission-crm-main" : ""}`}
          style={{
            padding: isMobile ? "10px 10px calc(88px + env(safe-area-inset-bottom))" : isCRMRoute ? "clamp(12px, 1.15vw, 24px)" : 24,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary mobile navigation" className="mission-mobile-bottom-nav">
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="mission-mobile-bottom-link"
            aria-current={active ? "page" : undefined}
            style={{
              color: active ? "var(--color-client-text)" : "var(--color-client-text-dim)",
              background: active ? "rgba(218,218,219,0.12)" : "transparent",
              borderColor: active ? "rgba(218,218,219,0.24)" : "transparent",
            }}
          >
            <span className="mission-mobile-bottom-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DashboardInner>{children}</DashboardInner>
      </AuthProvider>
    </ErrorBoundary>
  );
}
