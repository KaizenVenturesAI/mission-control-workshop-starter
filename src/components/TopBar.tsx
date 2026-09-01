"use client";

import { agents } from "@/data/agents";
import { useResponsive } from "@/lib/useMediaQuery";
import { useAuthContext } from "./AuthGate";
import { useRouter } from "next/navigation";
import { resolveUserAvatar } from "@/lib/userAvatar";

export function TopBar({ onHamburger }: { onHamburger?: () => void }) {
  const activeCount = agents.filter((a) => a.status !== "parked").length;
  const { isMobile } = useResponsive();
  const { user, role } = useAuthContext();
  const router = useRouter();
  const avatar = user ? resolveUserAvatar(user) : null;

  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        padding: isMobile ? "10px 12px 8px" : "14px 24px",
        borderBottom: "1px solid var(--color-client-border)",
        background: "rgba(10,10,15,0.6)",
        backdropFilter: "blur(16px)",
        gap: 8,
        position: isMobile ? "sticky" : undefined,
        top: isMobile ? 0 : undefined,
        zIndex: isMobile ? 80 : undefined,
      }}
    >
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        {/* Hamburger button — mobile only */}
        {onHamburger && (
          <button
            onClick={onHamburger}
            aria-label="Open menu"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              width: 44,
              height: 44,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span style={{ display: "block", width: 18, height: 2, background: "var(--color-client-text-secondary)", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "var(--color-client-text-secondary)", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "var(--color-client-text-secondary)", borderRadius: 1 }} />
          </button>
        )}
        <h1
          style={{
            fontSize: isMobile ? 13 : 15,
            fontWeight: 600,
            color: "var(--color-client-text)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Example Client Mission Control
        </h1>
        {!isMobile && (
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full"
              style={{
                padding: "4px 10px",
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.15)",
                fontSize: 11,
                color: "var(--color-client-green)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--color-client-green)",
                  boxShadow: "0 0 8px var(--color-client-green)",
                }}
              />
              Local Core Healthy
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3" style={{ flexWrap: isMobile ? "nowrap" : undefined }}>
        {/* Mobile: just show green dot and count */}
        {isMobile ? (
          <>
            <span
              style={{
                fontSize: 10,
                color: "var(--color-client-text-dim)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {activeCount}/{agents.length}
            </span>
            <span
              className="rounded-full"
              style={{
                width: 8,
                height: 8,
                background: "var(--color-client-green)",
                boxShadow: "0 0 8px var(--color-client-green)",
                flexShrink: 0,
              }}
            />
          </>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-client-text-dim)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {activeCount} active · {agents.length} total
            </span>
            <span
              className="rounded-full"
              style={{
                padding: "4px 10px",
                background: "rgba(218,218,219,0.10)",
                border: "1px solid rgba(218,218,219,0.18)",
                fontSize: 10,
                color: "var(--color-client-pink)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Production
            </span>
            {user && (
              <button
                onClick={() => router.push("/permissions?tab=users")}
                title="Open user permissions"
                aria-label="Open user permissions"
                style={{
                  padding: "4px 10px",
                  background: "rgba(218,218,219,0.10)",
                  border: "1px solid rgba(218,218,219,0.18)",
                  borderRadius: 9999,
                  fontSize: 11,
                  color: "#F7F8F8",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "rgba(218,218,219,0.22)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, overflow: "hidden", flexShrink: 0,
                }}>
                  {avatar?.photoUrl ? <img src={avatar.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : avatar?.initials}
                </span>
                {user.name?.split(" ")[0] || user.email.split("@")[0]}
                {role && <span style={{ opacity: 0.6 }}>· {role.name}</span>}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
