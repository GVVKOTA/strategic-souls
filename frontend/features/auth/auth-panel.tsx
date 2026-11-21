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
  googleEnabled: boolean;
  user: {
    displayName: string;
    email: string;
    authProvider: "email" | "google";
    avatarId?: string;
    handle?: string | null;
    bio?: string;
    discoverable?: boolean;
    unreadNotifications?: number;
    preferences?: {
      motion: "system" | "minimal" | "full";
      density: "comfortable" | "compact";
      earthQuality: "auto" | "balanced" | "reduced";
    };
  } | null;
};

type Props = {
  initialMode?: "signin" | "register";
  returnTo?: string;
  googleEnabled?: boolean;
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
  googleEnabled: googleEnabledProp,
  onAuthenticated,
}: Props) {
  const [mode, setMode] = useState<"signin" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(!!googleEnabledProp);
  const submitLock = useRef(false);

  useEffect(() => {
    if (googleEnabledProp !== undefined) return;
    let alive = true;
    api<AuthSessionResponse>("/api/auth/session")
      .then((s) => {
        if (!alive) return;
        setGoogleEnabled(!!s.googleEnabled);
        if (s.authenticated && onAuthenticated) onAuthenticated(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [googleEnabledProp, onAuthenticated]);

  const effectiveGoogleEnabled =
    googleEnabledProp !== undefined ? googleEnabledProp : googleEnabled;

  const safeTarget = sanitizeReturnTo(returnTo);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setError("");
    setBusy(true);
    try {
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
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setError("");
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
          }}
        >
          Create account
        </button>
      </div>

      {effectiveGoogleEnabled && (
        <div className="x2-auth-oauth">
          <a
            className="x1-secondary x1-motion-button"
            href={`/api/auth/google?return_to=${encodeURIComponent(safeTarget)}`}
          >
            Continue with Google
            <ArrowRight size={15} />
          </a>
          <p className="x1-caption">Or continue with email and password</p>
        </div>
      )}

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

        <label>
          Password
          <div className="x2-password-field">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength={mode === "register" ? 10 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "register"
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

        {mode === "register" && (
          <>
            <p className="x1-caption">
              Use at least 10 characters including one letter and one number.
              Passwords are salted and hashed server-side with PBKDF2-SHA256.
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
              : "Signing in…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
