"use client";

import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import type { ActiveSessionItem } from "../../../../backend/auth/session";
import type { UserProfileSnapshot } from "../../../../backend/services/profile/profile";
import { APP_RELEASE } from "../../../../backend/services/release-meta";
import { api, moment, type Notice } from "../../../components/workspace/shared";

export type EmailStatus = {
  verified: boolean;
  verifiedAt: string | null;
  pendingEmail: string | null;
  emailDeliveryConfigured: boolean;
};

export function SettingsSecuritySection({
  profile,
  emailStatus,
  busy,
  setBusy,
  onReloadAll,
  notify,
}: {
  profile: UserProfileSnapshot;
  emailStatus: EmailStatus | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onReloadAll: () => Promise<void>;
  notify: Notice;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailVerifyToken, setEmailVerifyToken] = useState("");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (newPassword !== confirmNewPassword) {
      notify("New password and confirmation do not match.", true);
      return;
    }
    setBusy(true);
    setSecurityNotice("");
    try {
      const res = await api<{ message?: string }>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      const msg =
        res.message || "Password updated and other active sessions signed out.";
      setSecurityNotice(msg);
      notify(msg);
      await onReloadAll();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not change password.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSecurityNotice("");
    try {
      const res = await api<{ message?: string }>(
        "/api/auth/request-email-change",
        {
          currentPassword: emailPassword,
          newEmail: newEmailInput,
        },
      );
      setEmailPassword("");
      const msg = res.message || "Verification request recorded.";
      setSecurityNotice(msg);
      notify(msg);
      await onReloadAll();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not start email verification.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !emailVerifyToken.trim()) return;
    setBusy(true);
    setSecurityNotice("");
    try {
      const res = await api<{ email: string }>(
        "/api/auth/confirm-email-change",
        { token: emailVerifyToken.trim() },
      );
      setEmailVerifyToken("");
      setNewEmailInput("");
      notify(`Email confirmed and updated to ${res.email}.`);
      setSecurityNotice(`Verified email: ${res.email}`);
      await onReloadAll();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not verify email code.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendPasswordReset() {
    if (busy || !profile.email) return;
    setBusy(true);
    setSecurityNotice("");
    try {
      const res = await api<{ message?: string }>("/api/auth/forgot-password", {
        email: profile.email,
      });
      const msg = res.message || "Password reset request recorded.";
      setSecurityNotice(msg);
      notify(msg);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not request password reset.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>Password &amp; Security</h2>
          <p className="x1-caption">
            Manage your account password, verified email, and recovery requests.
          </p>
        </div>
      </div>

      <div className="x6-setting-row">
        <span>Security and recovery support</span>
        <a href={`mailto:${APP_RELEASE.supportEmail}`}>{APP_RELEASE.supportEmail}</a>
      </div>

      {securityNotice && (
        <p role="status" className="x1-callout">
          {securityNotice}
        </p>
      )}

      <dl className="x1-details">
        <div>
          <dt>Account email (private)</dt>
          <dd>{profile.email}</dd>
        </div>
        <div>
          <dt>Verification status</dt>
          <dd>
            {emailStatus?.verified
              ? `Verified${emailStatus.verifiedAt ? " · " + moment(emailStatus.verifiedAt) : ""}`
              : emailStatus?.pendingEmail
                ? `Pending verification for ${emailStatus.pendingEmail}`
                : "Not verified yet"}
          </dd>
        </div>
      </dl>

      {profile.authProvider === "email" && (
        <>
          <form
            className="x1-form"
            onSubmit={(e) => void handleChangePassword(e)}
            style={{ marginTop: 14 }}
          >
            <h3 style={{ margin: "0 0 4px" }}>Change Password</h3>
            <p className="x1-caption" style={{ margin: 0 }}>
              Changing your password rotates your current session and signs out
              all other devices immediately.
            </p>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="x54-optional-grid">
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="10+ chars with letter & number"
                  disabled={busy}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat new password"
                  disabled={busy}
                />
              </label>
            </div>
            <div className="x1-actions">
              <button type="submit" className="x1-primary" disabled={busy}>
                <KeyRound size={15} />
                <span>{busy ? "Updating…" : "Update password"}</span>
              </button>
              <button
                type="button"
                className="x1-secondary"
                disabled={busy}
                onClick={() => void handleSendPasswordReset()}
              >
                Request password reset link
              </button>
            </div>
          </form>

          <form
            className="x1-form"
            onSubmit={(e) => void handleRequestEmailChange(e)}
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid var(--x51-hairline)",
            }}
          >
            <h3 style={{ margin: "0 0 4px" }}>Change or Verify Email</h3>
            <p className="x1-caption" style={{ margin: 0 }}>
              Re-enter your current password to request a single-use verification
              code. Your email never changes until the code is confirmed.
            </p>
            <div className="x54-optional-grid">
              <label>
                Email address to verify
                <input
                  type="email"
                  required
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder={profile.email}
                  disabled={busy}
                />
              </label>
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="x1-actions">
              <button type="submit" className="x1-secondary" disabled={busy}>
                <Mail size={15} />
                <span>Send verification code</span>
              </button>
            </div>
          </form>

          <form
            className="x1-form"
            onSubmit={(e) => void handleConfirmEmailChange(e)}
            style={{ marginTop: 12 }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={emailVerifyToken}
                maxLength={128}
                onChange={(e) => setEmailVerifyToken(e.target.value)}
                placeholder="Paste email verification code"
                style={{ flex: "1 1 200px" }}
                disabled={busy}
              />
              <button
                type="submit"
                className="x1-primary"
                disabled={busy || !emailVerifyToken.trim()}
              >
                Confirm email
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export function SettingsSessionsSection({
  sessions,
  sessionsLoading,
  busy,
  onRevokeSingle,
  onRevokeAllOthers,
  onSignOut,
}: {
  sessions: ActiveSessionItem[];
  sessionsLoading: boolean;
  busy: boolean;
  onRevokeSingle: (id: string) => Promise<void>;
  onRevokeAllOthers: () => Promise<void>;
  onSignOut: () => void;
}) {
  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>Active Sessions</h2>
          <p className="x1-caption">
            Signed-in browsers and devices currently holding an unexpired session
            for your account.
          </p>
        </div>
        {sessions.some((s) => !s.isCurrent) && (
          <button
            type="button"
            className="x1-secondary"
            disabled={busy}
            onClick={() => void onRevokeAllOthers()}
          >
            Delete All Other Sessions
          </button>
        )}
      </div>

      {sessionsLoading ? (
        <p role="status" className="x1-caption">
          Loading active sessions…
        </p>
      ) : sessions.length === 0 ? (
        <p className="x1-caption">No active sessions found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s) => (
            <div key={s.id} className="x6-setting-row">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{s.deviceLabel}</strong>
                  {s.isCurrent && (
                    <span className="x51-pill x51-pill-blue">Current session</span>
                  )}
                </div>
                <p className="x1-caption" style={{ margin: "3px 0 0" }}>
                  {s.ipHint ? `${s.ipHint} · ` : ""}
                  Signed in {moment(s.createdAt)} · Last active {moment(s.lastSeenAt)}
                </p>
              </div>
              {s.isCurrent ? (
                <button type="button" className="x1-secondary" disabled={busy} onClick={onSignOut}>
                  Log out from this device
                </button>
              ) : (
                <button
                  type="button"
                  className="x1-secondary"
                  disabled={busy}
                  onClick={() => void onRevokeSingle(s.id)}
                >
                  Delete Session
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
