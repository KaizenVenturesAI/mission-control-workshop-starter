"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { MCUser } from "@/data/settings-users";
import type { MCRole } from "@/data/settings-roles";
import type { PermissionLevel } from "@/data/settings-roles";
import { clientBrand } from "@/config/brand";
import { getBrowserSupabaseClient, getSupabaseAuthHeaders } from "@/lib/supabase/client";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/env";
import { StarterBrandMark } from "./StarterBrand";

/* ─── Auth Context ─── */
interface AuthContextType {
  user: MCUser | null;
  role: MCRole | null;
  loading: boolean;
  locked: boolean;
  passwordRecoveryMode: boolean;
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
  unlockWithSession: () => Promise<{ success: boolean; error?: string }>;
  unlockWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasAccess: (moduleKey: string) => boolean;
  getPermission: (moduleKey: string) => PermissionLevel;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  locked: false,
  passwordRecoveryMode: false,
  login: async () => ({ success: false }),
  lock: () => {},
  unlockWithSession: async () => ({ success: false }),
  unlockWithPassword: async () => ({ success: false }),
  requestPasswordReset: async () => ({ success: false }),
  setPassword: async () => ({ success: false }),
  logout: async () => {},
  hasAccess: () => false,
  getPermission: () => "hidden",
});

export const useAuthContext = () => useContext(AuthContext);

const LOCAL_AUTH_SESSION_KEY = "mc-auth-local-session";
const LOCKED_SESSION_KEY = "mc-auth-locked";
const PRODUCTION_AUTH_REDIRECT_URL = clientBrand.baseUrl;
const LOGIN_NODES = [
  { label: "Revenue", angle: -135, delay: "0s" },
  { label: "Meetings", angle: -90, delay: "0.16s" },
  { label: "Knowledge", angle: -45, delay: "0.32s" },
  { label: "Email", angle: 0, delay: "0.48s" },
  { label: "Agents", angle: 45, delay: "0.64s" },
  { label: "CRM", angle: 90, delay: "0.8s" },
  { label: "Playbooks", angle: 135, delay: "0.96s" },
  { label: "Ops", angle: 180, delay: "1.12s" },
];
const LOGIN_LIGHTS = [
  { delay: "0s", scale: 1 },
  { delay: "-1.8s", scale: 0.78 },
  { delay: "-3.4s", scale: 0.9 },
];
const LOGIN_STREAMS = [clientBrand.initials, "OPS", "CRM", "BD", "AI", "REV", "MAIL", "BOARD", "DATA", "FLOW"];

function canUseLocalAuthFallback(): boolean {
  return !hasSupabaseBrowserConfig();
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    storage.getItem("__mc_storage_probe__");
    return storage;
  } catch {
    return null;
  }
}

function getAuthRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const configured = process.env.NEXT_PUBLIC_MISSION_CONTROL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_AUTH_REDIRECT_URL;
  }
  return window.location.origin;
}

async function consumeMagicLinkSessionFromUrl(): Promise<{ consumed: boolean; recovery: boolean }> {
  if (typeof window === "undefined") return { consumed: false, recovery: false };
  const hash = window.location.hash?.replace(/^#/, "");
  if (!hash) return { consumed: false, recovery: false };
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const recovery = params.get("type") === "recovery";
  if (!accessToken || !refreshToken) return { consumed: false, recovery };

  const supabase = await getBrowserSupabaseClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return { consumed: false, recovery };

  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return { consumed: true, recovery };
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/rate limit|over_email_send_rate_limit/i.test(message)) {
    return "Supabase is rate-limiting sign-in emails. Wait a few minutes, then request a new secure link.";
  }
  if (/Invalid login credentials/i.test(message)) {
    return "That password did not unlock Mission Control. Try again or reset your password.";
  }
  if (/expired|invalid.*token|otp/i.test(message)) {
    return "That secure link has expired or was already used. Request a fresh link.";
  }
  if (/not configured|missing/i.test(message)) {
    return message;
  }
  if (/signups not allowed|user not found|shouldCreateUser/i.test(message)) {
    return "No active Mission Control user exists for that email.";
  }
  return message || "Mission Control auth is not configured or the sign-in link could not be sent.";
}

/* ─── Auth Provider ─── */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MCUser | null>(null);
  const [role, setRole] = useState<MCRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  const loadLegacyUser = useCallback(async (email: string): Promise<boolean> => {
    if (!canUseLocalAuthFallback()) return false;
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/settings/users"),
        fetch("/api/settings/roles"),
      ]);
      const users: MCUser[] = await usersRes.json();
      const roles: MCRole[] = await rolesRes.json();
      const foundUser = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.status === "active");
      if (!foundUser) return false;
      const foundRole = roles.find((item) => item.id === foundUser.role_id);
      if (!foundRole) return false;
      setUser(foundUser);
      setRole(foundRole);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadLocalSession = useCallback((): boolean => {
    if (!canUseLocalAuthFallback()) return false;
    const raw = getBrowserStorage()?.getItem(LOCAL_AUTH_SESSION_KEY);
    if (!raw) return false;
    try {
      const session = JSON.parse(raw) as { user?: MCUser; role?: MCRole };
      if (!session.user || !session.role || session.user.status !== "active") return false;
      setUser(session.user);
      setRole(session.role);
      return true;
    } catch {
      getBrowserStorage()?.removeItem(LOCAL_AUTH_SESSION_KEY);
      return false;
    }
  }, []);

  const loadAuthenticatedProfile = useCallback(async (): Promise<boolean> => {
    try {
      const headers = hasSupabaseBrowserConfig() ? await getSupabaseAuthHeaders() : undefined;
      const response = await fetch("/api/auth/me", { headers, credentials: "same-origin" });
      if (!response.ok) return false;
      const data = (await response.json()) as { user: MCUser; role: MCRole };
      setUser(data.user);
      setRole(data.role);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;
    let cancelled = false;
    const loadingFailsafe = window.setTimeout(() => {
      setLoading(false);
    }, 6000);

    const savedLocked = getBrowserStorage()?.getItem(LOCKED_SESSION_KEY) === "true";
    setLocked(savedLocked);

    getBrowserSupabaseClient().then((supabase) => {
      if (cancelled) return;
      consumeMagicLinkSessionFromUrl().then((linkResult) => supabase.auth.getSession().then(({ data }) => ({ data, linkResult }))).then(({ data, linkResult }) => {
        if (cancelled) return;
        if (linkResult.recovery && linkResult.consumed) {
          setPasswordRecoveryMode(true);
          getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
          setLocked(false);
        }
        if (data.session) {
          loadAuthenticatedProfile().then(() => {
            clearTimeout(loadingFailsafe);
            setLoading(false);
          });
        } else {
          clearTimeout(loadingFailsafe);
          setLoading(false);
        }
      });

      const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecoveryMode(true);
          getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
          setLocked(false);
          setLoading(false);
          return;
        }
        if (event === "SIGNED_OUT" || !session) {
          setUser(null);
          setRole(null);
          setPasswordRecoveryMode(false);
          setLoading(false);
          return;
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          loadAuthenticatedProfile().finally(() => setLoading(false));
        }
      });

      unsubscribeAuth = () => subscription.subscription.unsubscribe();
    }).catch(() => {
      if (cancelled) return;
      if (loadLocalSession()) {
        clearTimeout(loadingFailsafe);
        setLoading(false);
        return () => clearTimeout(loadingFailsafe);
      }
      clearTimeout(loadingFailsafe);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(loadingFailsafe);
      unsubscribeAuth?.();
    };
  }, [loadAuthenticatedProfile, loadLegacyUser, loadLocalSession]);

  const login = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (canUseLocalAuthFallback()) {
      void email;
      return { success: false, error: "Secure links require external auth. Use the Mission Control username and password." };
    }
    try {
      const supabase = await getBrowserSupabaseClient();
      const redirectTo = getAuthRedirectUrl();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      return error ? { success: false, error: friendlyAuthError(error) } : { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  }, []);

  const lock = useCallback(() => {
    getBrowserStorage()?.setItem(LOCKED_SESSION_KEY, "true");
    setLocked(true);
  }, []);

  const unlockWithSession = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) return { success: false, error: friendlyAuthError(error) };
      if (!data.session) return { success: false, error: "Your secure session expired. Request a new sign-in link." };
      const loaded = await loadAuthenticatedProfile();
      if (!loaded) return { success: false, error: "No active Mission Control profile found for this account." };
      getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
      setPasswordRecoveryMode(false);
      setLocked(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  }, [loadAuthenticatedProfile]);

  const unlockWithPassword = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (canUseLocalAuthFallback()) {
      try {
        const response = await fetch("/api/auth/local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ username: email, password }),
        });
        const data = (await response.json().catch(() => ({}))) as { user?: MCUser; role?: MCRole; error?: string };
        if (!response.ok || !data.user || !data.role) {
          return { success: false, error: data.error || "Mission Control local auth failed." };
        }
        setUser(data.user);
        setRole(data.role);
        getBrowserStorage()?.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify({ user: data.user, role: data.role }));
        getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
        setPasswordRecoveryMode(false);
        setLocked(false);
        return { success: true };
      } catch {
        return { success: false, error: "Mission Control local auth is unavailable." };
      }
    }
    try {
      const supabase = await getBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (error) return { success: false, error: friendlyAuthError(error) };
      const loaded = await loadAuthenticatedProfile();
      if (!loaded) return { success: false, error: "No active Mission Control profile found for this account." };
      getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
      setPasswordRecoveryMode(false);
      setLocked(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  }, [loadAuthenticatedProfile]);

  const requestPasswordReset = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (canUseLocalAuthFallback()) {
      void email;
      return { success: false, error: "Password reset requires external auth. Update MISSION_CONTROL_PASSWORD in the deployment environment." };
    }
    try {
      const supabase = await getBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
      return error ? { success: false, error: friendlyAuthError(error) } : { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  }, []);

  const setPassword = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await getBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { success: false, error: friendlyAuthError(error) };
      await loadAuthenticatedProfile();
      setPasswordRecoveryMode(false);
      getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
      setLocked(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  }, [loadAuthenticatedProfile]);

  const logout = useCallback(async () => {
    await Promise.all([
      getBrowserSupabaseClient().then((supabase) => supabase.auth.signOut()).catch(() => {}),
      fetch("/api/auth/local", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined),
    ]);
    getBrowserStorage()?.removeItem(LOCAL_AUTH_SESSION_KEY);
    getBrowserStorage()?.removeItem(LOCKED_SESSION_KEY);
    setUser(null);
    setRole(null);
    setPasswordRecoveryMode(false);
    setLocked(false);
  }, []);

  const hasAccess = useCallback((moduleKey: string): boolean => {
    if (!role) return false;
    const perm = role.permissions[moduleKey as keyof typeof role.permissions];
    return perm === "view" || perm === "edit";
  }, [role]);

  const getPermission = useCallback((moduleKey: string): PermissionLevel => {
    if (!role) return "hidden";
    return role.permissions[moduleKey as keyof typeof role.permissions] || "hidden";
  }, [role]);

  return (
    <AuthContext.Provider value={{ user, role, loading, locked, passwordRecoveryMode, login, lock, unlockWithSession, unlockWithPassword, requestPasswordReset, setPassword, logout, hasAccess, getPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ─── Login Screen ─── */
export function LoginScreen() {
  const { login, unlockWithPassword, requestPasswordReset } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 44 });
  const [resetPromptOpen, setResetPromptOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [secureLinkPromptOpen, setSecureLinkPromptOpen] = useState(false);
  const [secureLinkEmail, setSecureLinkEmail] = useState("");
  const [secureLinkError, setSecureLinkError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email || !password) { setError("Enter your email and password."); return; }
    setSubmitting(true);
    const result = await unlockWithPassword(email, password);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Mission Control could not sign you in.");
      return;
    }
  }

  async function handleSecureLink() {
    setError("");
    setNotice("");
    setSecureLinkError("");
    setSecureLinkEmail(email);
    setSecureLinkPromptOpen(true);
  }

  async function handleSecureLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSecureLinkError("");
    const emailForLink = secureLinkEmail.trim();
    if (!emailForLink) {
      setSecureLinkError("Enter your email to send a secure link.");
      return;
    }
    setSubmitting(true);
    const result = await login(emailForLink);
    setSubmitting(false);
    if (!result.success) {
      setSecureLinkError(result.error ?? "Mission Control auth is not configured or the sign-in link could not be sent.");
      return;
    }
    setEmail(emailForLink);
    setSecureLinkPromptOpen(false);
    setNotice("Check your email for a secure Mission Control sign-in link.");
  }

  async function handlePasswordReset() {
    setError("");
    setNotice("");
    setResetError("");
    setResetEmail(email);
    setResetPromptOpen(true);
  }

  async function handlePasswordResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setResetError("");
    const emailForReset = resetEmail.trim();
    if (!emailForReset) {
      setResetError("Enter your email to send a password reset.");
      return;
    }
    setSubmitting(true);
    const result = await requestPasswordReset(emailForReset);
    setSubmitting(false);
    if (!result.success) {
      setResetError(result.error ?? "Password reset could not be sent.");
      return;
    }
    setEmail(emailForReset);
    setResetPromptOpen(false);
    setNotice("Check your email for a secure password reset link.");
  }

  return (
    <div
      className="mc-login-screen"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({
          x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
          y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
        });
      }}
      style={{
        "--mc-pointer-x": `${pointer.x}%`,
        "--mc-pointer-y": `${pointer.y}%`,
      } as React.CSSProperties}
    >
      <div className="mc-login-grid" aria-hidden="true" />
      <div className="mc-login-scan" aria-hidden="true" />
      <div className="mc-login-matrix" aria-hidden="true">
        {LOGIN_STREAMS.map((stream, index) => (
          <span key={`${stream}-${index}`} style={{ left: `${5 + index * 10}%`, animationDelay: `${index * 0.19}s` }}>
            {stream}
          </span>
        ))}
      </div>
      <div className="mc-login-radar" aria-hidden="true">
        <div className="mc-login-circuit-ring">
          {LOGIN_LIGHTS.map((light, index) => (
            <span
              key={index}
              style={{
                animationDelay: light.delay,
                "--mc-light-scale": light.scale,
              } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="mc-login-core">
          <span />
          <strong>MISSION CORE</strong>
        </div>
        {LOGIN_NODES.map((node) => (
          <div
            key={node.label}
            className={`mc-login-node ${node.angle > 90 || node.angle <= -90 ? "mc-login-node--left" : "mc-login-node--right"}`}
            style={{
              "--mc-node-angle": `${node.angle}deg`,
              "--mc-node-counter": `${-node.angle}deg`,
              animationDelay: node.delay,
            } as React.CSSProperties}
          >
            <span />
            <strong>{node.label}</strong>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mc-login-panel">
        <div className="mc-login-brand">
          <StarterBrandMark size={64} />
          <h2>{clientBrand.shortName} {clientBrand.productName}</h2>
        </div>

        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          autoFocus
          className="mc-login-input"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="mc-login-input"
        />

        {error && (
          <div className="mc-login-error">{error}</div>
        )}
        {notice && (
          <div className="mc-login-error" style={{ borderColor: "rgba(52,211,153,0.35)", color: "rgb(134,239,172)" }}>{notice}</div>
        )}

        <button type="submit" className="mc-login-submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <button
          type="button"
          onClick={handleSecureLink}
          disabled={submitting}
          style={{
            marginTop: 10,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.62)",
            fontSize: 12,
            cursor: submitting ? "default" : "pointer",
          }}
        >
          Send secure link instead
        </button>
        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={submitting}
          style={{
            marginTop: 10,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.48)",
            fontSize: 12,
            cursor: submitting ? "default" : "pointer",
          }}
        >
          Reset via email
        </button>
        <div className="mc-login-status" aria-hidden="true">
          <span />
          Online
        </div>
      </form>

      {resetPromptOpen && (
        <div className="mc-login-modal-backdrop" role="presentation" onMouseDown={() => !submitting && setResetPromptOpen(false)}>
          <form
            onSubmit={handlePasswordResetSubmit}
            className="mc-login-reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-login-reset-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mc-login-reset-brand">
              <StarterBrandMark size={64} />
              <div>
                <span>{clientBrand.shortName}</span>
                <h2 id="mc-login-reset-title">Enter your email to send a password reset</h2>
              </div>
            </div>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              autoFocus
              className="mc-login-input"
            />
            {resetError && <div className="mc-login-error">{resetError}</div>}
            <button type="submit" className="mc-login-submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
            </button>
            <button type="button" onClick={() => setResetPromptOpen(false)} disabled={submitting} style={{ ...linkButtonStyle, marginTop: 0 }}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {secureLinkPromptOpen && (
        <div className="mc-login-modal-backdrop" role="presentation" onMouseDown={() => !submitting && setSecureLinkPromptOpen(false)}>
          <form
            onSubmit={handleSecureLinkSubmit}
            className="mc-login-reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-login-secure-link-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mc-login-reset-brand">
              <StarterBrandMark size={64} />
              <div>
                <span>{clientBrand.shortName}</span>
                <h2 id="mc-login-secure-link-title">Enter your email to send a secure link</h2>
              </div>
            </div>
            <input
              type="email"
              value={secureLinkEmail}
              onChange={(e) => setSecureLinkEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              autoFocus
              className="mc-login-input"
            />
            {secureLinkError && <div className="mc-login-error">{secureLinkError}</div>}
            <button type="submit" className="mc-login-submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send secure link"}
            </button>
            <button type="button" onClick={() => setSecureLinkPromptOpen(false)} disabled={submitting} style={{ ...linkButtonStyle, marginTop: 0 }}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function LockedScreen() {
  const { user, unlockWithSession, unlockWithPassword, requestPasswordReset, logout } = useAuthContext();
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const email = user?.email ?? "";

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email || !password) {
      setError("Enter your password to unlock Mission Control.");
      return;
    }
    setSubmitting(true);
    const result = await unlockWithPassword(email, password);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Mission Control could not be unlocked.");
    }
  }

  async function handleReset() {
    setError("");
    setNotice("");
    if (!email) {
      setError("No active Mission Control email is loaded. Sign out and request a new secure link.");
      return;
    }
    setSubmitting(true);
    const result = await requestPasswordReset(email);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Password reset could not be sent.");
      return;
    }
    setNotice("Check your email for a secure password reset link.");
  }

  async function handleSessionUnlock() {
    setError("");
    setNotice("");
    setSubmitting(true);
    const result = await unlockWithSession();
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Mission Control could not be unlocked with the current session.");
    }
  }

  return (
    <div className="mc-login-screen">
      <div className="mc-login-grid" aria-hidden="true" />
      <div className="mc-login-scan" aria-hidden="true" />
      <form onSubmit={handleUnlock} className="mc-login-panel">
        <div className="mc-login-brand">
          <StarterBrandMark size={56} />
          <h2>Mission Control Locked</h2>
        </div>
        <input value={email} readOnly className="mc-login-input" />
        <input
          type="password"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mc-login-input"
        />
        {error && <div className="mc-login-error">{error}</div>}
        {notice && <div className="mc-login-error" style={{ borderColor: "rgba(52,211,153,0.35)", color: "rgb(134,239,172)" }}>{notice}</div>}
        <button type="submit" className="mc-login-submit" disabled={submitting}>
          {submitting ? "Unlocking..." : "Unlock"}
        </button>
        <button
          type="button"
          onClick={handleSessionUnlock}
          disabled={submitting}
          style={{ ...linkButtonStyle, display: "block", margin: "10px auto 0" }}
        >
          Unlock with active session
        </button>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 10 }}>
          <button type="button" onClick={handleReset} disabled={submitting} style={linkButtonStyle}>Reset password</button>
          <button type="button" onClick={logout} disabled={submitting} style={linkButtonStyle}>Sign out</button>
        </div>
      </form>
    </div>
  );
}

export function SetPasswordScreen() {
  const { setPassword, logout } = useAuthContext();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const result = await setPassword(password);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Password could not be updated.");
    }
  }

  return (
    <div className="mc-login-screen">
      <div className="mc-login-grid" aria-hidden="true" />
      <div className="mc-login-scan" aria-hidden="true" />
      <form onSubmit={handleSubmit} className="mc-login-panel">
        <div className="mc-login-brand">
          <StarterBrandMark size={56} />
          <h2>Set Mission Control Password</h2>
        </div>
        <input type="password" value={password} onChange={(e) => setPasswordValue(e.target.value)} placeholder="New password" autoFocus className="mc-login-input" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" className="mc-login-input" />
        {error && <div className="mc-login-error">{error}</div>}
        <button type="submit" className="mc-login-submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save password"}
        </button>
        <button type="button" onClick={logout} disabled={submitting} style={{ ...linkButtonStyle, marginTop: 10 }}>
          Sign out
        </button>
      </form>
    </div>
  );
}

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "rgba(255,255,255,0.48)",
  fontSize: 12,
  cursor: "pointer",
};
