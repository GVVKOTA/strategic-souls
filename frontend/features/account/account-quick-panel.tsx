"use client";

import { useEffect, useRef } from "react";
import {
  Bell,
  Bookmark,
  ChevronRight,
  HelpCircle,
  LogIn,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";
import AvatarBadge from "./avatar-badge";

export type SettingsSection =
  | "profile"
  | "appearance"
  | "notifications"
  | "privacy"
  | "account";

type Props = {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  signedIn: boolean;
  displayName?: string | null;
  handle?: string | null;
  avatarId?: string | null;
  genderSymbol?: "MALE" | "FEMALE" | "HIDDEN";
  instagramHandle?: string;
  counts?: { followers: number; following: number; publishedSouls: number };
  discoverable?: boolean;
  unreadNotifications?: number;
  motionPref: "system" | "minimal" | "full";
  onMotionChange: (next: "system" | "minimal" | "full") => void;
  busy?: boolean;
  onOpenMyProfile?: () => void;
  onOpenSettings: (section: SettingsSection) => void;
  onOpenSaved: () => void;
  onOpenHelp: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  onSignOut: () => void;
};

/**
 * Compact, high-utility Account Quick Panel anchored directly below the top-right avatar trigger.
 * Never exposes secret emails or tokens; respects Escape, outside click, focus return, and reduced motion.
 */
export default function AccountQuickPanel({
  open,
  onClose,
  triggerRef,
  signedIn,
  displayName,
  handle,
  avatarId,
  genderSymbol = "HIDDEN",
  instagramHandle = "",
  counts,
  discoverable,
  unreadNotifications = 0,
  motionPref,
  onMotionChange,
  busy = false,
  onOpenMyProfile,
  onOpenSettings,
  onOpenSaved,
  onOpenHelp,
  onSignIn,
  onRegister,
  onSignOut,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      "button:not(:disabled), a[href]",
    );
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <>
      <div
        className="x6-quick-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id="ss-account-quick-panel"
        className="x6-quick-panel"
        role="dialog"
        aria-label={signedIn ? "Account control center" : "Guest account menu"}
      >
        {signedIn ? (
          <>
            <div className="x6-quick-header">
              <AvatarBadge
                avatarId={avatarId}
                size={48}
                ring
                alt={`${displayName || "Researcher"} avatar`}
              />
              <div className="x6-quick-identity">
                <strong>
                  {displayName || "Researcher"}
                  {genderSymbol === "MALE" ? " ♂" : genderSymbol === "FEMALE" ? " ♀" : ""}
                </strong>
                <span className="x6-quick-handle">
                  {handle ? `@${handle}` : "No @BodyID set yet"}
                </span>
                <span className="x6-quick-status">
                  {discoverable ? "Discoverable profile" : "Private profile"} · Portfolio hidden
                </span>
              </div>
            </div>

            {counts && (
              <div
                className="x51-profile-stats"
                style={{
                  borderTop: "1px solid var(--x51-hairline)",
                  borderBottom: "1px solid var(--x51-hairline)",
                  margin: "6px 0",
                }}
              >
                <div>
                  <strong>{counts.followers}</strong>
                  <span>Followers</span>
                </div>
                <div>
                  <strong>{counts.following}</strong>
                  <span>Following</span>
                </div>
                <div>
                  <strong>{counts.publishedSouls}</strong>
                  <span>Souls</span>
                </div>
              </div>
            )}

            {instagramHandle && (
              <p className="x1-caption" style={{ margin: "2px 0 6px", textAlign: "center" }}>
                IG: @{instagramHandle}
              </p>
            )}

            <div className="x6-quick-shortcuts" role="group" aria-label="Quick shortcuts">
              <button
                type="button"
                className="x6-quick-pill"
                onClick={() => {
                  onClose();
                  if (handle && onOpenMyProfile) onOpenMyProfile();
                  else onOpenSettings("profile");
                }}
              >
                <UserRound size={15} />
                <span>My Profile</span>
              </button>
              <button
                type="button"
                className="x6-quick-pill"
                onClick={() => {
                  onClose();
                  onOpenSaved();
                }}
              >
                <Bookmark size={15} />
                <span>Saved Research</span>
              </button>
            </div>

            <div className="x6-quick-list" role="menu">
              <button
                type="button"
                role="menuitem"
                className="x6-quick-row"
                onClick={() => {
                  onClose();
                  onOpenSettings("profile");
                }}
              >
                <span className="x6-quick-row-left">
                  <Settings size={16} />
                  <span>Settings &amp; Preferences</span>
                </span>
                <ChevronRight size={15} />
              </button>

              <button
                type="button"
                role="menuitem"
                className="x6-quick-row"
                onClick={() => {
                  onClose();
                  onOpenSettings("notifications");
                }}
              >
                <span className="x6-quick-row-left">
                  <Bell size={16} />
                  <span>Notifications</span>
                </span>
                <span className="x6-quick-row-right">
                  {unreadNotifications > 0 && (
                    <span className="x6-unread-pill" aria-label={`${unreadNotifications} unread`}>
                      {unreadNotifications > 99 ? "99+" : unreadNotifications}
                    </span>
                  )}
                  <ChevronRight size={15} />
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="x6-quick-row"
                onClick={() => {
                  onClose();
                  onOpenSettings("privacy");
                }}
              >
                <span className="x6-quick-row-left">
                  <Shield size={16} />
                  <span>Privacy &amp; Security</span>
                </span>
                <ChevronRight size={15} />
              </button>

              <button
                type="button"
                role="menuitem"
                className="x6-quick-row"
                onClick={() => {
                  onClose();
                  onOpenHelp();
                }}
              >
                <span className="x6-quick-row-left">
                  <HelpCircle size={16} />
                  <span>Help / Feedback</span>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="x6-quick-foot">
              <button
                type="button"
                className="x6-quick-signout"
                disabled={busy}
                onClick={() => {
                  onSignOut();
                }}
              >
                <LogOut size={15} />
                <span>{busy ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="x6-quick-header">
              <span className="x6-guest-orb" aria-hidden="true">
                <UserRound size={22} />
              </span>
              <div className="x6-quick-identity">
                <strong>Guest Explorer</strong>
                <span className="x6-quick-handle">
                  Sign in to save Souls, rooms &amp; avatars
                </span>
              </div>
            </div>

            <div className="x6-quick-guest-actions">
              <button
                type="button"
                className="x1-primary x1-motion-button"
                onClick={() => {
                  onClose();
                  onSignIn();
                }}
              >
                <LogIn size={15} />
                <span>Sign in</span>
              </button>
              <button
                type="button"
                className="x1-secondary x1-motion-button"
                onClick={() => {
                  onClose();
                  onRegister();
                }}
              >
                <UserPlus size={15} />
                <span>Create account</span>
              </button>
            </div>

            <div className="x6-quick-guest-pref">
              <span>
                <Sparkles size={14} /> Motion
              </span>
              <div className="x1-segment" role="group" aria-label="Motion preference">
                {(["system", "minimal"] as const).map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    aria-pressed={motionPref === pref}
                    onClick={() => onMotionChange(pref)}
                  >
                    {pref === "system" ? "System" : "Minimal"}
                  </button>
                ))}
              </div>
            </div>

            <div className="x6-quick-list">
              <button
                type="button"
                className="x6-quick-row"
                onClick={() => {
                  onClose();
                  onOpenHelp();
                }}
              >
                <span className="x6-quick-row-left">
                  <HelpCircle size={16} />
                  <span>About &amp; Data Sources</span>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
