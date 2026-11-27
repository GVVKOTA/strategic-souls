"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  HelpCircle,
  Info,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Shield,
  UserRound,
} from "lucide-react";
import type { ActiveSessionItem } from "../../../backend/auth/session";
import type {
  BannerPosition,
  GenderSymbolOption,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import { APP_RELEASE } from "../../../backend/services/release-meta";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";
import { api, type Notice } from "../../components/workspace/shared";
import AvatarStudio from "./avatar-studio";
import type { SettingsSection } from "./account-quick-panel";
import SettingsProfileSection from "./settings/settings-profile-section";
import {
  SettingsSecuritySection,
  SettingsSessionsSection,
  type EmailStatus,
} from "./settings/settings-security-section";
import SettingsPrivacySection from "./settings/settings-privacy-section";
import {
  SettingsAboutSection,
  SettingsHelpSection,
  SettingsNotificationsSection,
} from "./settings/settings-info-section";

type Props = {
  initialSection?: SettingsSection | null;
  isOwner?: boolean;
  notify: Notice;
  onProfileSynced: (profile: UserProfileSnapshot) => void;
  onSignOut: () => void;
  onOpenNotification?: (id: string) => void;
  onOpenPriceAlerts?: () => void;
};

type ActiveSettingsCategory =
  | "profile"
  | "notifications"
  | "security"
  | "privacy"
  | "sessions"
  | "help"
  | "about";

type SettingsNavItem = {
  id: ActiveSettingsCategory | "logout";
  label: string;
  desc: string;
  icon: typeof UserRound;
  danger?: boolean;
};

const SETTINGS_GROUPS: readonly {
  readonly label: string;
  readonly items: readonly SettingsNavItem[];
}[] = [
  {
    label: "Personal",
    items: [
      {
        id: "profile",
        label: "Edit Profile",
        desc: "Avatar, Body ID, profile banner, bio & focus chips",
        icon: UserRound,
      },
      {
        id: "notifications",
        label: "Notifications",
        desc: "In-app room, Soul, scan & alert activity",
        icon: Bell,
      },
    ],
  },
  {
    label: "Security & Privacy",
    items: [
      {
        id: "security",
        label: "Password & Security",
        desc: "Change password, email verification & recovery",
        icon: KeyRound,
      },
      {
        id: "privacy",
        label: "Privacy",
        desc: "Visibility, messaging, blocks, data export & deletion",
        icon: Shield,
      },
      {
        id: "sessions",
        label: "Active Sessions",
        desc: "Review and sign out active devices",
        icon: MonitorSmartphone,
      },
    ],
  },
  {
    label: "Information & Support",
    items: [
      {
        id: "help",
        label: "Help & Support",
        desc: "Verified support email & workspace glossary",
        icon: HelpCircle,
      },
      {
        id: "about",
        label: "About Strategic Souls",
        desc: APP_RELEASE.versionLabel,
        icon: Info,
      },
      {
        id: "logout",
        label: "Log Out",
        desc: "Sign out on this device",
        icon: LogOut,
        danger: true,
      },
    ],
  },
];

function resolveInitialCategory(
  raw: SettingsSection | null | undefined,
): ActiveSettingsCategory | null {
  if (!raw) return null;
  if (raw === "account") return "privacy";
  if (raw === "appearance" || raw === "data") return "profile";
  return raw;
}

export default function SettingsView({
  initialSection = null,
  notify,
  onProfileSynced,
  onSignOut,
  onOpenNotification,
  onOpenPriceAlerts,
}: Props) {
  const router = useRouter();
  const [section, setSection] = useState<ActiveSettingsCategory | null>(() =>
    resolveInitialCategory(initialSection),
  );
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  // Editable Profile form state
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [showAge, setShowAge] = useState(false);
  const [bannerPresetId, setBannerPresetId] = useState("b01");
  const [bannerPosition, setBannerPosition] = useState<BannerPosition>("center");
  const [bannerOverlay, setBannerOverlay] = useState(0.65);
  const [stateCode, setStateCode] = useState<string>("");
  const [genderSymbol, setGenderSymbol] = useState<GenderSymbolOption>("HIDDEN");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  // Security & Sessions state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const loadProfile = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const res = await api<{ profile: UserProfileSnapshot }>(
          "/api/profile",
          undefined,
          { signal },
        );
        if (signal?.aborted) return;
        setProfile(res.profile);
        setDisplayName(res.profile.displayName);
        setHandle(res.profile.handle ?? "");
        setBio(res.profile.bio);
        setAge(res.profile.age ? String(res.profile.age) : "");
        setShowAge(res.profile.showAge === true);
        setBannerPresetId(res.profile.bannerPresetId ?? "b01");
        setBannerPosition(res.profile.bannerPosition ?? "center");
        setBannerOverlay(res.profile.bannerOverlay ?? 0.65);
        setStateCode(res.profile.stateCode ?? "");
        setGenderSymbol(res.profile.genderSymbol ?? "HIDDEN");
        setInstagramHandle(res.profile.instagramHandle ?? "");
        setWebsiteUrl(res.profile.websiteUrl ?? "");
        setSelectedInterests(res.profile.researchInterests ?? []);
        onProfileSynced(res.profile);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : "Could not load account settings.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [onProfileSynced],
  );

  const loadSessionsAndSecurity = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await api<{
        sessions: ActiveSessionItem[];
        emailStatus: EmailStatus;
      }>("/api/auth/sessions");
      setSessions(res.sessions ?? []);
      setEmailStatus(res.emailStatus ?? null);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not load active sessions.",
        true,
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadProfile(controller.signal);
    });
    return () => controller.abort();
  }, [loadProfile]);

  useEffect(() => {
    if (section !== "sessions" && section !== "security") return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadSessionsAndSecurity();
    });
    return () => {
      alive = false;
    };
  }, [section, loadSessionsAndSecurity]);

  async function saveProfileFields(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-profile",
          displayName,
          handle: handle.trim() || undefined,
          bio,
          age: age.trim() === "" ? null : Number(age.trim()),
          showAge,
          bannerPresetId,
          bannerPosition,
          bannerOverlay,
          stateCode: stateCode.trim() ? stateCode.trim() : null,
          genderSymbol,
          instagramHandle: instagramHandle.trim(),
          websiteUrl: websiteUrl.trim(),
          researchInterests: selectedInterests.slice(0, 6),
        },
      );
      setProfile(res.profile);
      setDisplayName(res.profile.displayName);
      setHandle(res.profile.handle ?? "");
      setBio(res.profile.bio);
      setAge(res.profile.age ? String(res.profile.age) : "");
      setShowAge(res.profile.showAge === true);
      setBannerPresetId(res.profile.bannerPresetId ?? "b01");
      setBannerPosition(res.profile.bannerPosition ?? "center");
      setBannerOverlay(res.profile.bannerOverlay ?? 0.65);
      setStateCode(res.profile.stateCode ?? "");
      setGenderSymbol(res.profile.genderSymbol ?? "HIDDEN");
      setInstagramHandle(res.profile.instagramHandle ?? "");
      setWebsiteUrl(res.profile.websiteUrl ?? "");
      setSelectedInterests(res.profile.researchInterests ?? []);
      onProfileSynced(res.profile);
      notify("Profile saved across your workspace.");
      triggerGoFeedback("Profile saved", `profile:${crypto.randomUUID()}`, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save profile.";
      setError(msg);
      notify(msg, true);
    } finally {
      setBusy(false);
    }
  }

  async function saveSocialPreference(
    social: Partial<UserProfileSnapshot["social"]>,
    successText: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        {
          action: "update-preferences",
          social,
        },
      );
      setProfile(res.profile);
      onProfileSynced(res.profile);
      notify(successText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update setting.";
      setError(msg);
      notify(msg, true);
    } finally {
      setBusy(false);
    }
  }

  async function revokeSingleSession(sessionId: string) {
    if (busy || !window.confirm("Delete this session and sign out the remote device?")) return;
    setBusy(true);
    try {
      const res = await api<{ revokedCurrent?: boolean }>(
        "/api/auth/sessions/revoke",
        { sessionId },
      );
      if (res.revokedCurrent) {
        onSignOut();
        return;
      }
      notify("Session deleted.");
      await loadSessionsAndSecurity();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not delete session.", true);
    } finally {
      setBusy(false);
    }
  }

  async function revokeAllOtherSessions() {
    if (busy || !window.confirm("Delete all other sessions and sign out those devices?")) return;
    setBusy(true);
    try {
      const res = await api<{ revokedCount?: number }>(
        "/api/auth/sessions/revoke",
        { allOthers: true },
      );
      notify(
        res.revokedCount
          ? `Signed out ${res.revokedCount} other session${res.revokedCount === 1 ? "" : "s"}.`
          : "No other active sessions to sign out.",
      );
      await loadSessionsAndSecurity();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not sign out other devices.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function markAllNotificationsRead() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; profile: UserProfileSnapshot }>(
        "/api/profile",
        { action: "mark-notifications-read" },
      );
      setProfile(res.profile);
      onProfileSynced(res.profile);
      notify("Notifications marked as read.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update notifications.", true);
    } finally {
      setBusy(false);
    }
  }

  async function unblockHandle(targetHandle: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/x2/social", {
        action: "block",
        handle: targetHandle,
        active: false,
      });
      await loadProfile();
      notify(`Unblocked @${targetHandle}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not unblock profile.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleEraseAccount(payload: {
    confirmation: string;
    confirmSharedGroupDeletion: boolean;
    confirmSharedConversationDeletion: boolean;
  }) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/erase", payload);
      notify("Account and personal records erased.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Account erasure failed.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="x6-settings ss-x3-settings" aria-label="Settings">
      {error && (
        <div role="alert" className="x1-callout">
          <span>{error}</span>
          <button
            type="button"
            className="x1-text-button"
            onClick={() => void loadProfile()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="x6-settings-layout">
        <nav
          className={"x6-settings-rail" + (section ? "" : " is-mobile-open")}
          aria-label="Settings categories"
        >
          <div className="ss-x3-settings-groups">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.label} className="ss-x3-settings-group-block">
                <h3 className="ss-x3-settings-group-label">{group.label}</h3>
                <div className="ss-x3-settings-group">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.id !== "logout" && section === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        className={
                          "ss-x3-settings-row" +
                          (active ? " is-active" : "") +
                          (item.danger ? " is-danger" : "")
                        }
                        onClick={() => {
                          if (item.id === "logout") {
                            onSignOut();
                            return;
                          }
                          setSection(item.id);
                          requestAnimationFrame(() =>
                            document
                              .getElementById("x11-settings-category")
                              ?.focus({ preventScroll: true }),
                          );
                        }}
                      >
                        <span className="ss-v3-settings-row-left">
                          <span className="ss-v3-settings-row-icon">
                            <Icon size={17} />
                          </span>
                          <span className="ss-v3-settings-row-meta">
                            <strong>{item.label}</strong>
                            <small>{item.desc}</small>
                          </span>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {item.id === "notifications" &&
                            (profile?.unreadNotifications ?? 0) > 0 && (
                              <span className="x6-unread-pill">
                                {profile!.unreadNotifications}
                              </span>
                            )}
                          <ChevronRight size={15} aria-hidden="true" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {section && (
          <div className="x6-settings-content">
            <button
              type="button"
              id="x11-settings-category"
              className="x6-settings-mobile-switch x1-secondary"
              onClick={() => {
                setSection(null);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(".x6-settings-rail button")
                    ?.focus({ preventScroll: true }),
                );
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>All settings</span>
            </button>

            {loading && !profile ? (
              <div className="x3-skeleton" role="status" aria-live="polite">
                <div className="x3-skeleton-bar is-title" />
                <div className="x3-skeleton-card" />
                <p className="x3-skeleton-label">Loading your account settings…</p>
              </div>
            ) : profile ? (
              <>
                {section === "profile" && (
                  <SettingsProfileSection
                    profile={profile}
                    busy={busy}
                    displayName={displayName}
                    setDisplayName={setDisplayName}
                    handle={handle}
                    setHandle={setHandle}
                    bio={bio}
                    setBio={setBio}
                    age={age}
                    setAge={setAge}
                    showAge={showAge}
                    setShowAge={setShowAge}
                    bannerPresetId={bannerPresetId}
                    setBannerPresetId={setBannerPresetId}
                    bannerPosition={bannerPosition}
                    setBannerPosition={setBannerPosition}
                    stateCode={stateCode}
                    setStateCode={setStateCode}
                    genderSymbol={genderSymbol}
                    setGenderSymbol={setGenderSymbol}
                    instagramHandle={instagramHandle}
                    setInstagramHandle={setInstagramHandle}
                    websiteUrl={websiteUrl}
                    setWebsiteUrl={setWebsiteUrl}
                    selectedInterests={selectedInterests}
                    setSelectedInterests={setSelectedInterests}
                    onOpenAvatarStudio={() => setStudioOpen(true)}
                    onSaveProfile={saveProfileFields}
                    notify={notify}
                  />
                )}
                {section === "notifications" && (
                  <SettingsNotificationsSection
                    profile={profile}
                    busy={busy}
                    onSaveSocial={saveSocialPreference}
                    onMarkAllRead={markAllNotificationsRead}
                    onOpenNotification={onOpenNotification}
                    onOpenPriceAlerts={onOpenPriceAlerts}
                  />
                )}
                {section === "security" && (
                  <SettingsSecuritySection
                    profile={profile}
                    emailStatus={emailStatus}
                    busy={busy}
                    setBusy={setBusy}
                    onReloadAll={async () => {
                      await Promise.all([loadProfile(), loadSessionsAndSecurity()]);
                    }}
                    notify={notify}
                  />
                )}
                {section === "privacy" && (
                  <SettingsPrivacySection
                    profile={profile}
                    busy={busy}
                    onSaveSocial={saveSocialPreference}
                    onUnblock={unblockHandle}
                    onEraseAccount={handleEraseAccount}
                  />
                )}
                {section === "sessions" && (
                  <SettingsSessionsSection
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    busy={busy}
                    onRevokeSingle={revokeSingleSession}
                    onRevokeAllOthers={revokeAllOtherSessions}
                    onSignOut={onSignOut}
                  />
                )}
                {section === "help" && <SettingsHelpSection notify={notify} />}
                {section === "about" && <SettingsAboutSection />}
              </>
            ) : null}
          </div>
        )}
      </div>

      {profile && (
        <AvatarStudio
          open={studioOpen}
          currentAvatarId={profile.avatarId}
          displayName={profile.displayName}
          handle={profile.handle}
          onClose={() => setStudioOpen(false)}
          onSaved={(updated) => {
            setProfile(updated);
            onProfileSynced(updated);
            notify("Profile picture updated across Strategic Souls.");
          }}
        />
      )}
    </section>
  );
}
