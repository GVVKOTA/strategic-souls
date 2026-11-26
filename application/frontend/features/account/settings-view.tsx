/* eslint-disable @next/next/no-html-link-for-pages -- Preserve native document transitions for archive/export routes. */
"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Database,
  Download,
  HelpCircle,
  Image as ImageIcon,
  Info,
  KeyRound,
  LogOut,
  Mail,
  MonitorSmartphone,
  Palette,
  Plus,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { ActiveSessionItem } from "../../../backend/auth/session";
import { resolveAvatarPreset } from "../../../backend/services/profile/avatars";
import {
  BANNER_PRESETS,
  resolveBannerPreset,
} from "../../../backend/services/profile/banners";
import {
  INDIAN_STATES_AND_UTS,
  getIndianStateByCode,
} from "../../../backend/services/profile/indian-states";
import type {
  BannerPosition,
  DensityPreference,
  EarthQualityPreference,
  GenderSymbolOption,
  MotionPreference,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import { APP_RELEASE } from "../../../backend/services/release-meta";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";
import {
  api,
  copyTextSafe,
  Modal,
  moment,
  type Notice,
} from "../../components/workspace/shared";
import AvatarBadge from "./avatar-badge";
import AvatarStudio from "./avatar-studio";
import type { SettingsSection } from "./account-quick-panel";

const DataControl = lazy(() => import("../global/data-control"));

type Props = {
  initialSection?: SettingsSection | null;
  isOwner?: boolean;
  notify: Notice;
  onProfileSynced: (profile: UserProfileSnapshot) => void;
  onSignOut: () => void;
  onOpenNotification?: (id: string) => void;
  onOpenPriceAlerts?: () => void;
};

type EmailStatus = {
  verified: boolean;
  verifiedAt: string | null;
  pendingEmail: string | null;
  emailDeliveryConfigured: boolean;
};

const CURATED_INTERESTS = [
  "Indian Equities",
  "NSE Large Cap",
  "Midcap Momentum",
  "MCX Commodities",
  "Gold & Silver",
  "Crude Oil",
  "USD/INR & FX",
  "Technical Analysis",
  "Breakout Setups",
  "Mean Reversion",
  "Swing Research",
  "Macro Regimes",
  "Volatility",
  "Sector Rotation",
  "Index Breadth",
  "Trend Following",
] as const;

const SECTIONS: {
  id: SettingsSection;
  label: string;
  desc: string;
  icon: typeof UserRound;
}[] = [
  {
    id: "profile",
    label: "Edit Profile",
    desc: "Avatar, Body ID, profile banner, bio & focus chips",
    icon: UserRound,
  },
  {
    id: "security",
    label: "Password & Security",
    desc: "Change password, email verification & recovery",
    icon: KeyRound,
  },
  {
    id: "privacy",
    label: "Privacy",
    desc: "Discoverability, direct messages, receipts & blocks",
    icon: Shield,
  },
  {
    id: "notifications",
    label: "Notifications",
    desc: "In-app room, follow & conversation alerts",
    icon: Bell,
  },
  {
    id: "sessions",
    label: "Active Sessions",
    desc: "Review and delete active sessions",
    icon: MonitorSmartphone,
  },
  {
    id: "appearance",
    label: "Preferences",
    desc: "Motion, density, private ticker & Globe graphics",
    icon: Palette,
  },
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
    id: "data",
    label: "Data Connections",
    desc: "Nifty 500 snapshot, shared grants & broker session",
    icon: Database,
  },
  {
    id: "account",
    label: "Account & Data",
    desc: "Export JSON, archive & permanent deletion",
    icon: Database,
  },
];

export default function SettingsView({
  initialSection = null,
  isOwner = false,
  notify,
  onProfileSynced,
  onSignOut,
  onOpenNotification,
  onOpenPriceAlerts,
}: Props) {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection | null>(() =>
    initialSection === "data" && !isOwner ? "profile" : initialSection,
  );
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

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
  const [interestSearch, setInterestSearch] = useState("");

  // Password & Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailVerifyToken, setEmailVerifyToken] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);

  // Active Sessions state
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Account erasure confirmation state
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [confirmGroups, setConfirmGroups] = useState(false);
  const [confirmConvos, setConfirmConvos] = useState(false);

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
          err instanceof Error
            ? err.message
            : "Could not load account settings.",
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
    return () => {
      controller.abort();
    };
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

  function toggleInterest(tag: string) {
    setSelectedInterests((prev) => {
      if (prev.some((x) => x.toLowerCase() === tag.toLowerCase())) {
        return prev.filter((x) => x.toLowerCase() !== tag.toLowerCase());
      }
      if (prev.length >= 6) {
        notify("Select up to 6 focus areas.", true);
        return prev;
      }
      return [...prev, tag];
    });
  }

  function addCustomInterest() {
    const clean = interestSearch.trim().replace(/\s+/g, " ").slice(0, 28);
    if (!clean) return;
    if (selectedInterests.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      setInterestSearch("");
      return;
    }
    if (selectedInterests.length >= 6) {
      notify("Select up to 6 focus areas.", true);
      return;
    }
    setSelectedInterests((prev) => [...prev, clean]);
    setInterestSearch("");
  }

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

  async function savePreferences(
    patch: {
      motion?: MotionPreference;
      density?: DensityPreference;
      earthQuality?: EarthQualityPreference;
      privateTickerEnabled?: boolean;
      privateTickerMode?: "HOLDINGS" | "WATCHLIST";
      social?: Partial<UserProfileSnapshot["social"]>;
    },
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
          ...patch,
        },
      );
      setProfile(res.profile);
      onProfileSynced(res.profile);
      notify(successText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update preference.";
      setError(msg);
      notify(msg, true);
    } finally {
      setBusy(false);
    }
  }

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
      void loadSessionsAndSecurity();
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
      void loadSessionsAndSecurity();
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
      await Promise.all([loadProfile(), loadSessionsAndSecurity()]);
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
    if (busy || !profile?.email) return;
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
      notify(
        err instanceof Error ? err.message : "Could not delete session.",
        true,
      );
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
      notify(
        err instanceof Error ? err.message : "Could not update notifications.",
        true,
      );
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
      notify(
        err instanceof Error ? err.message : "Could not unblock profile.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleEraseAccount(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/erase", {
        confirmation: eraseText,
        confirmSharedGroupDeletion: confirmGroups,
        confirmSharedConversationDeletion: confirmConvos,
      });
      notify("Account and personal records erased.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Account erasure failed.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  const currentPreset = resolveAvatarPreset(profile?.avatarId);
  const activeBanner = resolveBannerPreset(bannerPresetId);
  const activeState = getIndianStateByCode(stateCode || null);
  const indianStatesOnly = INDIAN_STATES_AND_UTS.filter(
    (s) => s.kind === "STATE",
  );
  const indianUtsOnly = INDIAN_STATES_AND_UTS.filter(
    (s) => s.kind === "UNION_TERRITORY",
  );
  const filteredCuratedInterests = CURATED_INTERESTS.filter(
    (tag) =>
      !interestSearch.trim() ||
      tag.toLowerCase().includes(interestSearch.trim().toLowerCase()),
  );
  const customSelectedInterests = selectedInterests.filter(
    (tag) =>
      !CURATED_INTERESTS.some((c) => c.toLowerCase() === tag.toLowerCase()),
  );

  return (
    <section className="x6-settings" aria-label="Settings and preferences">
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
        {/* Telegram-inspired Settings Navigation List */}
        <nav
          className={"x6-settings-rail" + (section ? "" : " is-mobile-open")}
          aria-label="Settings categories"
        >
          <div className="ss-v3-settings-list">
            {SECTIONS.filter((item) => item.id !== "data" || isOwner).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className="ss-v3-settings-row"
                  style={
                    active
                      ? {
                          background: "rgba(118, 192, 255, 0.12)",
                          boxShadow: "inset 3px 0 0 var(--x1-title-blue)",
                        }
                      : undefined
                  }
                  onClick={() => {
                    setSection(item.id);
                    requestAnimationFrame(() => document.getElementById("x11-settings-category")?.focus({ preventScroll: true }));
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
            <button
              type="button"
              className="ss-v3-settings-row is-danger"
              onClick={onSignOut}
            >
              <span className="ss-v3-settings-row-left">
                <span className="ss-v3-settings-row-icon">
                  <LogOut size={17} />
                </span>
                <span className="ss-v3-settings-row-meta">
                  <strong>Log Out</strong>
                  <small>Sign out on this device</small>
                </span>
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </nav>

        {section && <div className="x6-settings-content">
          <button
            type="button"
            id="x11-settings-category"
            className="x6-settings-mobile-switch x1-secondary"
            onClick={() => {
              setSection(null);
              requestAnimationFrame(() => document.querySelector<HTMLElement>(".x6-settings-rail button")?.focus({ preventScroll: true }));
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>All categories</span>
          </button>

          {loading && !profile ? (
            <div className="x3-skeleton" role="status" aria-live="polite">
              <div className="x3-skeleton-bar is-title" />
              <div className="x3-skeleton-card" />
              <p className="x3-skeleton-label">Loading your account settings…</p>
            </div>
          ) : profile ? (
            <>
              {(section === "privacy" || section === "security") && <div className="x6-setting-row">
                <span>{section === "security" ? "Security and recovery support" : "Privacy contact"}</span>
                <a href={`mailto:${APP_RELEASE.supportEmail}`}>{APP_RELEASE.supportEmail}</a>
              </div>}
              {/* 1. EDIT PROFILE */}
              {section === "profile" && (
                <div className="x1-panel x54-settings-panel">
                  <div className="x54-settings-preview-card">
                    <div
                      className="x54-settings-banner"
                      style={{
                        backgroundImage: activeBanner.gradient,
                        backgroundSize: "cover",
                        backgroundPosition: bannerPosition,
                      }}
                    >
                      <div
                        className="x54-settings-banner-veil"
                        style={{ background: activeBanner.safeZoneScrim }}
                      />
                    </div>
                    <div className="x54-settings-preview-body">
                      <div className="x54-settings-avatar-ring">
                        <AvatarBadge
                          avatarId={profile.avatarId}
                          size={72}
                          alt={`${displayName || profile.displayName} avatar`}
                        />
                      </div>
                      <div className="x54-settings-preview-meta">
                        <div className="x54-settings-meta-top">
                          <div>
                            <h2>{displayName || profile.displayName}</h2>
                            <p className="x1-caption">
                              {handle ? `@${handle}` : "No Body ID set yet"} ·{" "}
                              {currentPreset.name} · {activeBanner.name}
                            </p>
                          </div>
                          {activeState && (
                            <span
                              className="x56-state-capsule"
                              title={activeState.name}
                              aria-label={`State or Union Territory: ${activeState.name}`}
                            >
                              {activeState.code}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="x54-settings-preview-actions">
                        <button
                          type="button"
                          className="x54-strip-btn"
                          onClick={() => setStudioOpen(true)}
                        >
                          <ImageIcon size={14} aria-hidden="true" />
                          <span>Edit avatar</span>
                        </button>
                        <button
                          type="button"
                          className="x54-strip-btn"
                          onClick={() => setBannerModalOpen(true)}
                        >
                          <span>Profile banner</span>
                        </button>
                        <button
                          type="button"
                          className="x54-strip-btn"
                          onClick={() => setPreviewModalOpen(true)}
                        >
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <form
                    className="x1-form x54-settings-form"
                    onSubmit={saveProfileFields}
                  >
                    <fieldset className="x54-settings-group">
                      <legend>Identity</legend>
                      <label>
                        Display name
                        <input
                          type="text"
                          value={displayName}
                          maxLength={40}
                          required
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Your researcher name"
                        />
                      </label>

                      <label>
                        Body ID
                        <input
                          type="text"
                          value={handle}
                          maxLength={25}
                          onChange={(e) =>
                            setHandle(
                              e.target.value
                                .replace(/^@/, "")
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, ""),
                            )
                          }
                          placeholder="e.g. market_explorer"
                        />
                        <span className="x1-caption">
                          Your unique public handle (for example, @market_explorer).
                          Direct messages, portfolios, GRAVEYARD scans, and email
                          always remain private.
                        </span>
                      </label>

                      <label>
                        Short bio
                        <textarea
                          value={bio}
                          maxLength={320}
                          rows={3}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Markets, horizons, or setups you study"
                        />
                      </label>
                    </fieldset>

                    <fieldset className="x54-settings-group">
                      <legend>Research Focus ({selectedInterests.length}/6)</legend>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={interestSearch}
                          maxLength={28}
                          onChange={(e) => setInterestSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomInterest();
                            }
                          }}
                          placeholder="Filter or add a focus tag…"
                          style={{ flex: "1 1 180px" }}
                        />
                        {interestSearch.trim() && (
                          <button
                            type="button"
                            className="x1-secondary"
                            onClick={addCustomInterest}
                          >
                            <Plus size={14} />
                            <span>Add tag</span>
                          </button>
                        )}
                      </div>

                      {customSelectedInterests.length > 0 && (
                        <div className="ss-v3-interest-grid">
                          {customSelectedInterests.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className="ss-v3-interest-chip is-selected"
                              onClick={() => toggleInterest(tag)}
                            >
                              <span>{tag}</span>
                              <X size={12} />
                            </button>
                          ))}
                        </div>
                      )}

                      <div
                        className="ss-v3-interest-grid"
                        role="group"
                        aria-label="Research focus areas"
                      >
                        {filteredCuratedInterests.map((tag) => {
                          const isSelected = selectedInterests.some(
                            (x) => x.toLowerCase() === tag.toLowerCase(),
                          );
                          return (
                            <button
                              key={tag}
                              type="button"
                              aria-pressed={isSelected}
                              className={
                                "ss-v3-interest-chip" +
                                (isSelected ? " is-selected" : "")
                              }
                              onClick={() => toggleInterest(tag)}
                            >
                              {isSelected && <Check size={12} />}
                              <span>{tag}</span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <fieldset className="x54-settings-group">
                      <legend>Links &amp; Public Badges</legend>
                      <div className="x54-optional-grid">
                        <label>
                          Instagram
                          <input
                            value={instagramHandle}
                            maxLength={32}
                            onChange={(e) => setInstagramHandle(e.target.value)}
                            placeholder="username (without @)"
                          />
                        </label>
                        <label>
                          Website URL
                          <input
                            type="url"
                            value={websiteUrl}
                            maxLength={200}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://example.com"
                          />
                        </label>
                      </div>

                      <label>
                        State / Union Territory
                        <select
                          value={stateCode}
                          aria-label="State or Union Territory"
                          onChange={(e) => setStateCode(e.target.value)}
                        >
                          <option value="">Prefer not to show</option>
                          <optgroup label="States (28)">
                            {indianStatesOnly.map((st) => (
                              <option key={st.code} value={st.code}>
                                {st.name} ({st.code})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Union Territories (8)">
                            {indianUtsOnly.map((ut) => (
                              <option key={ut.code} value={ut.code}>
                                {ut.name} ({ut.code})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <span className="x1-caption">
                          Displays as a compact 2-letter badge (for example,{" "}
                          <strong>{activeState ? activeState.code : "AP"}</strong>)
                          on your public profile header when chosen.
                        </span>
                      </label>

                      <div className="x54-optional-grid">
                        <label>
                          Age
                          <input
                            type="number"
                            min={18}
                            max={120}
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="18+"
                          />
                        </label>
                        <label>
                          Gender
                          <select
                            value={genderSymbol}
                            onChange={(e) =>
                              setGenderSymbol(
                                e.target.value as GenderSymbolOption,
                              )
                            }
                          >
                            <option value="HIDDEN">Hidden</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                          </select>
                        </label>
                      </div>

                      <label className="x1-checkbox">
                        <input
                          type="checkbox"
                          checked={showAge}
                          onChange={(e) => setShowAge(e.target.checked)}
                        />
                        <span>Show my age on my public Body ID profile</span>
                      </label>
                    </fieldset>

                    <div className="x1-actions">
                      <button
                        type="submit"
                        className="x1-primary x1-motion-button"
                        disabled={busy}
                        aria-busy={busy}
                      >
                        <Check size={16} />
                        <span>{busy ? "Saving…" : "Save profile"}</span>
                      </button>
                    </div>
                  </form>

                  {/* Independent Profile Cover Banner Library (b01–b08, separate from Portfolio p01–p08) */}
                  {bannerModalOpen && (
                    <Modal
                      title="Profile Cover Banner Library"
                      onClose={() => setBannerModalOpen(false)}
                    >
                      <div className="x56-banner-modal-body">
                        <div
                          className="x56-banner-live-preview"
                          aria-label="Live profile banner preview"
                        >
                          <div
                            className="x56-banner-live-stage"
                            style={{
                              backgroundImage: activeBanner.gradient,
                              backgroundSize: "cover",
                              backgroundPosition: bannerPosition,
                            }}
                          >
                            <div
                              className="x56-banner-live-scrim"
                              style={{ background: activeBanner.safeZoneScrim }}
                            />
                            <span
                              className="x56-banner-live-theme-tag"
                              style={{
                                background: activeBanner.badgeBg,
                                color: activeBanner.badgeText,
                              }}
                            >
                              {activeBanner.name}
                            </span>
                          </div>
                          <div className="x56-banner-live-identity">
                            <div className="x56-banner-live-left">
                              <div className="x56-banner-live-avatar">
                                <AvatarBadge
                                  avatarId={profile.avatarId}
                                  size={56}
                                  alt=""
                                />
                              </div>
                              <div className="x56-banner-live-text">
                                <strong>
                                  {displayName || profile.displayName}
                                </strong>
                                <span>
                                  {handle ? `@${handle}` : "No Body ID set yet"}
                                </span>
                              </div>
                            </div>
                            {activeState && (
                              <span
                                className="x56-state-capsule"
                                title={activeState.name}
                              >
                                {activeState.code}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="x56-banner-grid"
                          role="listbox"
                          aria-label="Profile cover banner artwork designs"
                        >
                          {BANNER_PRESETS.map((b) => {
                            const selected = bannerPresetId === b.id;
                            return (
                              <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={
                                  "x56-banner-card x51-backdrop-swatch" +
                                  (selected ? " is-active" : "")
                                }
                                onClick={() => setBannerPresetId(b.id)}
                              >
                                <div
                                  className="x56-banner-thumb"
                                  style={{
                                    backgroundImage: b.gradient,
                                    backgroundSize: "cover",
                                    backgroundPosition: bannerPosition,
                                  }}
                                >
                                  {selected && (
                                    <span
                                      className="x56-banner-check"
                                      aria-hidden="true"
                                    >
                                      <Check size={13} />
                                    </span>
                                  )}
                                </div>
                                <div className="x56-banner-card-meta">
                                  <span className="x56-banner-card-title">
                                    {b.name}
                                  </span>
                                  <span className="x56-banner-theme-pill">
                                    {b.theme === "light" ? "Light" : "Dark"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="x56-banner-align-row">
                          <span className="x56-banner-align-label">
                            Focal alignment
                          </span>
                          <div
                            className="x1-segment"
                            role="group"
                            aria-label="Banner vertical alignment"
                          >
                            {(
                              [
                                ["top", "Top"],
                                ["center", "Center"],
                                ["bottom", "Bottom"],
                              ] as const
                            ).map(([pos, label]) => (
                              <button
                                key={pos}
                                type="button"
                                aria-pressed={bannerPosition === pos}
                                onClick={() => setBannerPosition(pos)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <p className="x56-banner-subtle-note">
                          Profile cover banners are completely independent from
                          your My Portfolio backdrop. Save profile after closing
                          to persist.
                        </p>

                        <div className="x1-actions">
                          <button
                            type="button"
                            className="x1-primary"
                            onClick={() => setBannerModalOpen(false)}
                          >
                            <Check size={15} />
                            <span>Apply banner</span>
                          </button>
                        </div>
                      </div>
                    </Modal>
                  )}

                  {previewModalOpen && (
                    <Modal
                      title="Public Profile Preview"
                      onClose={() => setPreviewModalOpen(false)}
                    >
                      <div
                        className="x54-settings-preview-card"
                        style={{ marginBottom: 0 }}
                      >
                        <div
                          className="x54-settings-banner"
                          style={{
                            backgroundImage: activeBanner.gradient,
                            backgroundSize: "cover",
                            backgroundPosition: bannerPosition,
                          }}
                        >
                          <div
                            className="x54-settings-banner-veil"
                            style={{ background: activeBanner.safeZoneScrim }}
                          />
                        </div>
                        <div className="x54-settings-preview-body">
                          <div className="x54-settings-avatar-ring">
                            <AvatarBadge
                              avatarId={profile.avatarId}
                              size={72}
                              alt=""
                            />
                          </div>
                          <div className="x54-settings-preview-meta">
                            <div className="x54-settings-meta-top">
                              <div>
                                <h3 style={{ margin: 0 }}>
                                  {displayName || profile.displayName}
                                  {genderSymbol === "MALE"
                                    ? " ♂"
                                    : genderSymbol === "FEMALE"
                                      ? " ♀"
                                      : ""}
                                  {showAge && age ? ` · ${age}y` : ""}
                                </h3>
                                <p
                                  className="x1-caption"
                                  style={{ color: "var(--x1-title-blue)" }}
                                >
                                  {handle ? `@${handle}` : "No Body ID yet"}
                                </p>
                              </div>
                              {activeState && (
                                <span
                                  className="x56-state-capsule"
                                  title={activeState.name}
                                >
                                  {activeState.code}
                                </span>
                              )}
                            </div>
                          </div>
                          {bio.trim() && (
                            <p className="x1-caption" style={{ margin: 0 }}>
                              {bio.trim()}
                            </p>
                          )}
                          <div
                            className="x54-profile-stats"
                            style={{ width: "100%" }}
                          >
                            <div className="x54-stat-cell">
                              <strong>{profile.counts.publishedSouls}</strong>
                              <span>Souls</span>
                            </div>
                            <div className="x54-stat-cell">
                              <strong>{profile.counts.followers}</strong>
                              <span>Followers</span>
                            </div>
                            <div className="x54-stat-cell">
                              <strong>{profile.counts.following}</strong>
                              <span>Following</span>
                            </div>
                          </div>
                          <p className="x1-caption" style={{ margin: 0 }}>
                            Email, portfolios, watchlists, GRAVEYARD scans, and
                            direct messages are never public.
                          </p>
                        </div>
                      </div>
                    </Modal>
                  )}
                </div>
              )}

              {/* 2. PASSWORD & SECURITY (Sec 09.3) */}
              {section === "security" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Password &amp; Security
                      </h2>
                      <p className="x1-caption">
                        Manage your account password, verified email, and recovery
                        requests.
                      </p>
                    </div>
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
                        onSubmit={handleChangePassword}
                        style={{ marginTop: 14 }}
                      >
                        <h3 style={{ margin: "0 0 4px" }}>Change Password</h3>
                        <p className="x1-caption" style={{ margin: 0 }}>
                          Changing your password rotates your current session and
                          signs out all other devices immediately.
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
                              minLength={15}
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
                              minLength={15}
                              maxLength={128}
                              required
                              value={confirmNewPassword}
                              onChange={(e) =>
                                setConfirmNewPassword(e.target.value)
                              }
                              placeholder="Repeat new password"
                              disabled={busy}
                            />
                          </label>
                        </div>
                        <div className="x1-actions">
                          <button
                            type="submit"
                            className="x1-primary"
                            disabled={busy}
                          >
                            <KeyRound size={15} />
                            <span>
                              {busy ? "Updating…" : "Update password"}
                            </span>
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
                        onSubmit={handleRequestEmailChange}
                        style={{
                          marginTop: 22,
                          paddingTop: 18,
                          borderTop: "1px solid var(--x51-hairline)",
                        }}
                      >
                        <h3 style={{ margin: "0 0 4px" }}>
                          Change or Verify Email
                        </h3>
                        <p className="x1-caption" style={{ margin: 0 }}>
                          Re-enter your current password to request a single-use
                          verification code. Your email never changes until the
                          code is confirmed.
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
                          <button
                            type="submit"
                            className="x1-secondary"
                            disabled={busy}
                          >
                            <Mail size={15} />
                            <span>Send verification code</span>
                          </button>
                        </div>
                      </form>

                      <form
                        className="x1-form"
                        onSubmit={handleConfirmEmailChange}
                        style={{ marginTop: 12 }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            type="text"
                            value={emailVerifyToken}
                            maxLength={128}
                            onChange={(e) =>
                              setEmailVerifyToken(e.target.value)
                            }
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
              )}

              {/* 3. PRIVACY */}
              {section === "privacy" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>Privacy</h2>
                      <p className="x1-caption">
                        Server-enforced visibility boundaries across Community and
                        Messaging.
                      </p>
                    </div>
                  </div>

                  {profile.hasCommunityProfile ? (
                    <>
                      {profile.legacyPrivateProfile ? (
                        <div className="x6-setting-row">
                          <div>
                            <strong>
                              Legacy private profile (@{profile.handle})
                            </strong>
                            <p className="x1-caption">
                              Your profile remains hidden until you opt in. Public
                              discovery never exposes DMs, portfolios, GRAVEYARD
                              scans, or email.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="x1-primary"
                            disabled={busy}
                            onClick={() =>
                              void savePreferences(
                                { social: { discoverable: true } },
                                "Your researcher profile is now publicly discoverable.",
                              )
                            }
                          >
                            Make profile public
                          </button>
                        </div>
                      ) : (
                        <div className="x6-setting-row">
                          <div>
                            <strong>
                              Public researcher profile (@{profile.handle})
                            </strong>
                            <p className="x1-caption">
                              Your Body ID and published Souls are discoverable.
                              Direct messages, portfolios, GRAVEYARD scans, and
                              email stay strictly private.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="x6-setting-row">
                        <div>
                          <strong>Who can message you</strong>
                          <p className="x1-caption">
                            Direct messages stay private between participants.
                          </p>
                        </div>
                        <select
                          aria-label="Direct message policy"
                          value={profile.social.messages}
                          disabled={busy}
                          onChange={(e) =>
                            void savePreferences(
                              {
                                social: {
                                  messages: e.target.value as
                                    | "REQUESTS"
                                    | "GROUPS"
                                    | "NONE",
                                },
                              },
                              "Direct message policy updated.",
                            )
                          }
                        >
                          <option value="REQUESTS">
                            Message requests (1 intro)
                          </option>
                          <option value="GROUPS">
                            Shared Research Rooms only
                          </option>
                          <option value="NONE">No new messages</option>
                        </select>
                      </div>

                      <div className="x6-setting-row">
                        <div>
                          <strong>Share read receipts</strong>
                          <p className="x1-caption">
                            Only notifies peers that you read a direct message
                            when turned on.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="x1-secondary"
                          role="switch"
                          aria-checked={profile.social.receipts}
                          disabled={busy}
                          onClick={() =>
                            void savePreferences(
                              {
                                social: {
                                  receipts: !profile.social.receipts,
                                },
                              },
                              !profile.social.receipts
                                ? "Read receipts enabled."
                                : "Read receipts turned off.",
                            )
                          }
                        >
                          {profile.social.receipts ? "On" : "Off"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="x1-callout">
                      Your account is private by default. Set a @handle in Edit
                      Profile to participate in Community discovery.
                    </p>
                  )}

                  {profile.blocked.length > 0 && (
                    <div className="x6-blocked-list">
                      <h3>Blocked profiles ({profile.blocked.length})</h3>
                      {profile.blocked.map((b) => (
                        <div key={b.handle} className="x6-setting-row">
                          <span>
                            <strong>{b.displayName}</strong> · @{b.handle}
                          </span>
                          <button
                            type="button"
                            className="x1-secondary"
                            disabled={busy}
                            onClick={() => void unblockHandle(b.handle)}
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. NOTIFICATIONS */}
              {section === "notifications" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Notifications
                      </h2>
                      <p className="x1-caption">
                        In-app alerts for direct messages, room mentions, and
                        followers.
                      </p>
                    </div>
                    {profile.unreadNotifications > 0 && (
                      <button
                        type="button"
                        className="x1-secondary"
                        disabled={busy}
                        onClick={() => void markAllNotificationsRead()}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {profile.hasCommunityProfile ? (
                    <div className="x6-setting-row">
                      <div>
                        <strong>In-app Community notifications</strong>
                        <p className="x1-caption">
                          Controls whether new mentions and conversation alerts
                          appear in your activity list.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="x1-secondary"
                        role="switch"
                        aria-checked={profile.social.notifications}
                        disabled={busy}
                        onClick={() =>
                          void savePreferences(
                            {
                              social: {
                                notifications: !profile.social.notifications,
                              },
                            },
                            !profile.social.notifications
                              ? "In-app notifications enabled."
                              : "In-app notifications paused.",
                          )
                        }
                      >
                        {profile.social.notifications ? "On" : "Off"}
                      </button>
                    </div>
                  ) : (
                    <p className="x1-callout">
                      Set a @handle in Edit Profile first to configure Community
                      notification rules.
                    </p>
                  )}

                  {onOpenPriceAlerts && <button type="button" className="x1-secondary" onClick={onOpenPriceAlerts}>
                    <Bell size={16} /> Manage Price Alerts
                  </button>}
                  <div className="x6-notif-list">
                    {profile.notifications.length ? (
                      profile.notifications.map((n) => (
                        <div
                          key={n.id}
                          className={
                            "x6-notif-item" + (n.readAt ? "" : " is-unread")
                          }
                        >
                          <strong>
                            {n.kind === "MESSAGE"
                              ? "Direct message received"
                              : n.kind === "MENTION"
                                ? "Mentioned in a Research Room"
                                : n.kind.replaceAll("_", " ")}
                          </strong>
                          <span className="x1-caption">
                            {moment(n.createdAt)} ·{" "}
                            {n.readAt ? "Read" : "Unread"}
                          </span>
                          {onOpenNotification && <button type="button" className="x1-text-button"
                            onClick={() => onOpenNotification(n.id)}>Open</button>}
                        </div>
                      ))
                    ) : (
                      <p className="x1-caption">
                        No notifications yet. Real room and chat events appear
                        here.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 5. ACTIVE SESSIONS (Sec 09.3) */}
              {section === "sessions" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Active Sessions
                      </h2>
                      <p className="x1-caption">
                        Signed-in browsers and devices currently holding an
                        unexpired session for your account.
                      </p>
                    </div>
                    {sessions.some((s) => !s.isCurrent) && (
                      <button
                        type="button"
                        className="x1-secondary"
                        disabled={busy}
                        onClick={() => void revokeAllOtherSessions()}
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
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {sessions.map((s) => (
                        <div key={s.id} className="x6-setting-row">
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <strong>{s.deviceLabel}</strong>
                              {s.isCurrent && (
                                <span className="x51-pill x51-pill-blue">
                                  Current session
                                </span>
                              )}
                            </div>
                            <p className="x1-caption" style={{ margin: "3px 0 0" }}>
                              {s.ipHint ? `${s.ipHint} · ` : ""}
                              Signed in {moment(s.createdAt)} · Last active{" "}
                              {moment(s.lastSeenAt)}
                            </p>
                          </div>
                          {s.isCurrent && <button type="button" className="x1-secondary" disabled={busy} onClick={onSignOut}>
                            Log out from this device
                          </button>}
                          {!s.isCurrent && (
                            <button
                              type="button"
                              className="x1-secondary"
                              disabled={busy}
                              onClick={() => void revokeSingleSession(s.id)}
                            >
                              Delete Session
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 6. PREFERENCES */}
              {section === "appearance" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Preferences
                      </h2>
                      <p className="x1-caption">
                        Customize motion, layout density, and 3D Strategic Globe
                        performance.
                      </p>
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Interface motion</strong>
                      <p className="x1-caption">
                        System reduced-motion preferences are always honored.
                      </p>
                    </div>
                    <div
                      className="x1-segment"
                      role="group"
                      aria-label="Interface motion"
                    >
                      {(
                        [
                          ["system", "System (default)"],
                          ["minimal", "Minimal"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={busy}
                          aria-pressed={
                            val === "minimal"
                              ? profile.preferences.motion === "minimal"
                              : profile.preferences.motion !== "minimal"
                          }
                          onClick={() =>
                            void savePreferences(
                              { motion: val },
                              `Motion preference saved (${label}).`,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Information density</strong>
                      <p className="x1-caption">
                        Tightens vertical spacing without changing numbers.
                      </p>
                    </div>
                    <div
                      className="x1-segment"
                      role="group"
                      aria-label="Information density"
                    >
                      {(
                        [
                          ["comfortable", "Comfortable"],
                          ["compact", "Compact"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={busy}
                          aria-pressed={profile.preferences.density === val}
                          onClick={() =>
                            void savePreferences(
                              { density: val },
                              `Information density saved (${label}).`,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Private Holdings Ticker</strong>
                      <p className="x1-caption">
                        OFF by default. Displays your private manual holdings or
                        watchlist across your workspace only.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="x1-secondary"
                      role="switch"
                      aria-checked={!!profile.preferences.privateTickerEnabled}
                      disabled={busy}
                      onClick={() =>
                        void savePreferences(
                          {
                            privateTickerEnabled:
                              !profile.preferences.privateTickerEnabled,
                          },
                          !profile.preferences.privateTickerEnabled
                            ? "Private Holdings Ticker enabled."
                            : "Private Holdings Ticker hidden.",
                        )
                      }
                    >
                      {profile.preferences.privateTickerEnabled ? "On" : "Off"}
                    </button>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Strategic Globe graphics budget</strong>
                      <p className="x1-caption">
                        Adapts 3D globe resolution for smoother battery life on
                        mobile.
                      </p>
                    </div>
                    <div
                      className="x1-segment"
                      role="group"
                      aria-label="Strategic Globe graphics quality"
                    >
                      {(
                        [
                          ["auto", "Auto"],
                          ["balanced", "Balanced"],
                          ["reduced", "Battery Saver"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={busy}
                          aria-pressed={
                            profile.preferences.earthQuality === val
                          }
                          onClick={() =>
                            void savePreferences(
                              { earthQuality: val },
                              `Strategic Globe graphics preference saved (${label}).`,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 7. HELP & SUPPORT (Sec 09.2 — Verified Contact Email) */}
              {section === "help" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Help &amp; Support
                      </h2>
                      <p className="x1-caption">
                        Direct support contact and quick reference for Strategic
                        Souls terminology.
                      </p>
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Support Email</strong>
                      <p className="x1-caption">
                        Reach our team directly for account recovery, bug
                        reports, or research feedback.
                      </p>
                      <p style={{ margin: "6px 0 0", fontWeight: 600 }}>
                        <a href={`mailto:${APP_RELEASE.supportEmail}`}>
                          {APP_RELEASE.supportEmail}
                        </a>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={async () => {
                        const ok = await copyTextSafe(APP_RELEASE.supportEmail);
                        notify(
                          ok
                            ? `Copied ${APP_RELEASE.supportEmail}.`
                            : "Unable to copy email on this browser.",
                          !ok,
                        );
                      }}
                    >
                      <Copy size={14} />
                      <span>Copy email</span>
                    </button>
                  </div>

                  <dl className="x1-details" style={{ marginTop: 14 }}>
                    <div>
                      <dt>Body ID (@handle)</dt>
                      <dd>
                        Your unique public researcher identifier in Community
                        Souls, Rooms, and direct chats.
                      </dd>
                    </div>
                    <div>
                      <dt>Soul &amp; SoulScan</dt>
                      <dd>
                        A reproducible formula or rule tree scanned against
                        completed candles on Watchlist or Market.
                      </dd>
                    </div>
                    <div>
                      <dt>GRAVEYARD</dt>
                      <dd>
                        Your private archive of completed scans. Publishing to
                        Community never exposes private portfolio records.
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* 8. ABOUT STRATEGIC SOULS (Unified Version Metadata) */}
              {section === "about" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        About Strategic Souls
                      </h2>
                      <p className="x1-caption">
                        Financial research, global market intelligence, and
                        formula-based screening.
                      </p>
                    </div>
                  </div>

                  <dl className="x1-details">
                    <div>
                      <dt>Application</dt>
                      <dd>{APP_RELEASE.productName}</dd>
                    </div>
                    <div>
                      <dt>Organization</dt>
                      <dd>{APP_RELEASE.organization}</dd>
                    </div>
                    <div>
                      <dt>Release Version</dt>
                      <dd>{APP_RELEASE.versionLabel}</dd>
                    </div>
                    <div>
                      <dt>Release Track</dt>
                      <dd>{APP_RELEASE.releaseTrack}</dd>
                    </div>
                    <div>
                      <dt>Support</dt>
                      <dd>
                        <a href={`mailto:${APP_RELEASE.supportEmail}`}>
                          {APP_RELEASE.supportEmailDisplay}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Research Notice</dt>
                      <dd>
                        Strategic Souls provides educational and research
                        tooling only — not personalized investment advice or
                        order execution.
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* 9. ACCOUNT & DATA */}
              {section === "account" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2 style={{ color: "var(--x1-title-blue)" }}>
                        Account &amp; Data
                      </h2>
                      <p className="x1-caption">
                        Research Beta · Free tier · Paid plans and billing are
                        not active.
                      </p>
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Export your private data</strong>
                      <p className="x1-caption">
                        Downloads a bounded JSON snapshot of your watchlists,
                        portfolios, Soul Scans, and community contributions.
                      </p>
                    </div>
                    <a
                      className="x1-secondary"
                      href="/api/export"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={15} />
                      <span>Export JSON</span>
                      <ArrowUpRight size={14} />
                    </a>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Legacy research notebook</strong>
                      <p className="x1-caption">
                        Access previously archived standalone research notebooks.
                      </p>
                    </div>
                    <a className="x1-secondary" href="/legacy">
                      <span>Open archive</span>
                      <ArrowUpRight size={14} />
                    </a>
                  </div>

                  <div className="x6-danger-zone">
                    <h3>Delete account &amp; personal data</h3>
                    <p className="x1-caption">
                      Permanently deletes your account, sessions, watchlists,
                      portfolios, GRAVEYARD scans, and profile data. This action
                      cannot be undone.
                    </p>
                    {!eraseOpen ? (
                      <button
                        type="button"
                        className="x1-secondary"
                        onClick={() => setEraseOpen(true)}
                      >
                        <Trash2 size={15} />
                        <span>Begin confirmed account deletion…</span>
                      </button>
                    ) : (
                      <form className="x1-form" onSubmit={handleEraseAccount}>
                        <label>
                          Type <code>DELETE MY DATA</code> to confirm
                          <input
                            type="text"
                            value={eraseText}
                            required
                            onChange={(e) => setEraseText(e.target.value)}
                            placeholder="DELETE MY DATA"
                          />
                        </label>
                        <label className="x1-checkbox">
                          <input
                            type="checkbox"
                            checked={confirmGroups}
                            onChange={(e) => setConfirmGroups(e.target.checked)}
                          />
                          I acknowledge any Research Rooms I solely own will also
                          be deleted unless ownership is transferred first.
                        </label>
                        <label className="x1-checkbox">
                          <input
                            type="checkbox"
                            checked={confirmConvos}
                            onChange={(e) => setConfirmConvos(e.target.checked)}
                          />
                          I acknowledge paired private direct-message
                          conversations will be deleted.
                        </label>
                        <div className="x1-actions">
                          <button
                            type="button"
                            className="x1-secondary"
                            onClick={() => setEraseOpen(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="x1-primary"
                            disabled={busy || eraseText !== "DELETE MY DATA"}
                          >
                            {busy ? "Erasing…" : "Confirm permanent deletion"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
              {isOwner && section === "data" && (
                <div className="x6-setting-panel">
                  <Suspense fallback={<p role="status">Loading data controls…</p>}>
                    <DataControl notify={notify} />
                  </Suspense>
                </div>
              )}
            </>
          ) : null}
        </div>}
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
