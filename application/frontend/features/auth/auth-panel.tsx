"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { api } from "../../components/workspace/shared";

export type AuthSessionResponse = {
  authenticated: boolean;
  accepted: boolean;
  alias: string | null;
  consentVersion: string;
  isOwner: boolean;
  user: {
    displayName: string;
    email: string;
    authProvider: "email" | "google";
    avatarId?: string;
    handle?: string | null;
    bio?: string;
    discoverable?: boolean;
    legacyPrivateProfile?: boolean;
    unreadNotifications?: number;
    genderSymbol?: "MALE" | "FEMALE" | "HIDDEN";
    instagramHandle?: string;
    bannerPresetId?: string;
    portfolioBackdrop?: {
      presetId: string;
      position: "top" | "center" | "bottom";
      overlay: number;
      blur: number;
    };
    defaultPostAudience?: "PUBLIC" | "FOLLOWERS" | "GROUP";
    counts?: {
      followers: number;
      following: number;
      publishedSouls: number;
    };
    preferences?: {
      motion: "system" | "minimal" | "full";
      density: "comfortable" | "compact";
      earthQuality: "auto" | "balanced" | "reduced";
      privateTickerEnabled?: boolean;
      privateTickerMode?: "HOLDINGS" | "WATCHLIST";
    };
  } | null;
};

type Props = {
  initialMode?: "signin" | "register";
  returnTo?: string;
  onAuthenticated?: (session: AuthSessionResponse) => void;
};

function sanitizeReturnTo(value?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value === "/signin" || value.startsWith("/api/auth")) return "/";
  return value;
}

export default function AuthPanel({
  initialMode = "signin",
  returnTo = "/",
  onAuthenticated,
}: Props) {
  const [mode, setMode] = useState<"signin" | "register" | "forgot" | "reset">(
    initialMode,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const submitLock = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("reset_token");
    if (tok && tok.trim().length >= 32) {
      let alive = true;
      queueMicrotask(() => {
        if (!alive) return;
        setResetToken(tok.trim());
        setMode("reset");
      });
      return () => {
        alive = false;
      };
    }
  }, []);

  useEffect(() => {
    if (!onAuthenticated) return;
    let alive = true;
    api<AuthSessionResponse>("/api/auth/session")
      .then((s) => {
        if (!alive) return;
        if (s.authenticated) onAuthenticated(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onAuthenticated]);

  const safeTarget = sanitizeReturnTo(returnTo);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setError("");
    setInfoMessage("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const res = await api<{ message?: string }>(
          "/api/auth/forgot-password",
          { email },
        );
        setInfoMessage(
          res.message ||
            "If an account exists for that email address, reset instructions were processed.",
        );
        return;
      }
      if (mode === "reset") {
        const res = await api<{ message?: string }>(
          "/api/auth/reset-password",
          { token: resetToken, newPassword: password },
        );
        setPassword("");
        setResetToken("");
        setMode("signin");
        setInfoMessage(
          res.message ||
            "Password reset complete. Sign in with your new password.",
        );
        return;
      }
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/signin";
      const payload =
        mode === "register"
          ? { email, password, displayName, adult, privacy, terms }
          : { email, password };
      const session = await api<AuthSessionResponse>(endpoint, payload);
      if (onAuthenticated) {
        onAuthenticated(session);
      } else {
        window.location.assign(safeTarget);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication request failed.",
      );
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="x2-auth-panel">
      <div className="x1-segment" role="tablist" aria-label="Account access">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin" || mode === "forgot" || mode === "reset"}
          onClick={() => {
            setMode("signin");
            setError("");
            setInfoMessage("");
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => {
            setMode("register");
            setError("");
            setInfoMessage("");
          }}
        >
          Create account
        </button>
      </div>

      <form className="x1-form" onSubmit={handleSubmit}>
        {mode === "register" && (
          <label>
            Display name
            <input
              type="text"
              name="displayName"
              autoComplete="name"
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your researcher name"
              disabled={busy}
            />
          </label>
        )}

        {mode !== "reset" && (
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="researcher@example.com"
              disabled={busy}
            />
          </label>
        )}

        {mode === "reset" && (
          <label>
            Reset code
            <input
              type="text"
              name="resetToken"
              autoComplete="one-time-code"
              maxLength={128}
              required
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Paste single-use reset code"
              disabled={busy}
            />
          </label>
        )}

        {mode !== "forgot" && (
          <label>
            {mode === "reset" ? "New password" : "Password"}
            <div className="x2-password-field">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={
                  mode === "register" || mode === "reset"
                    ? "new-password"
                    : "current-password"
                }
                minLength={mode === "register" || mode === "reset" ? 10 : 1}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "register" || mode === "reset"
                    ? "10+ characters with letters and numbers"
                    : "Enter your password"
                }
                disabled={busy}
              />
              <button
                type="button"
                className="x1-icon-button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
        )}

        {mode === "signin" && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="x1-text-button"
              onClick={() => {
                setMode("forgot");
                setError("");
                setInfoMessage("");
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="x1-text-button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Back to sign in
            </button>
            <button
              type="button"
              className="x1-text-button"
              onClick={() => {
                setMode("reset");
                setError("");
              }}
            >
              I already have a reset code
            </button>
          </div>
        )}

        {mode === "reset" && (
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="x1-text-button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Back to sign in
            </button>
            <span className="x1-caption">
              Resetting your password signs out all active sessions.
            </span>
          </div>
        )}

        {mode === "register" && (
          <>
            <p className="x1-caption">
              Use at least 10 characters including one letter and one number.
              Your password is never stored as plain text.
            </p>
            <label className="x1-checkbox">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                required
              />
              I confirm I am 18 or older.
            </label>
            <label className="x1-checkbox">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                required
              />
              I have read the{" "}
              <a href="/trust" target="_blank" rel="noreferrer">
                privacy notice
              </a>
              .
            </label>
            <label className="x1-checkbox">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                required
              />
              I accept the{" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                research terms
              </a>
              .
            </label>
          </>
        )}

        {infoMessage && (
          <p role="status" className="x1-callout" style={{ margin: 0 }}>
            {infoMessage}
          </p>
        )}

        {error && (
          <p role="alert" className="x1-form-error">
            {error}
          </p>
        )}

        <button
          className="x1-primary x1-motion-button"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          <Lock size={15} />
          {busy
            ? mode === "register"
              ? "Creating account…"
              : mode === "forgot"
                ? "Submitting request…"
                : mode === "reset"
                  ? "Resetting password…"
                  : "Signing in…"
            : mode === "register"
              ? "Create account"
              : mode === "forgot"
                ? "Request password reset"
                : mode === "reset"
                  ? "Set new password"
                  : "Sign in"}
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
