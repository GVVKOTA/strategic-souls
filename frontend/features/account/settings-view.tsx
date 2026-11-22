/* eslint-disable @next/next/no-html-link-for-pages -- Preserve native document transitions for archive/export routes. */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  Database,
  Download,
  Image as ImageIcon,
  LogOut,
  Palette,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  BannerPosition,
  DensityPreference,
  EarthQualityPreference,
  GenderSymbolOption,
  MotionPreference,
  UserProfileSnapshot,
} from "../../../backend/services/profile/profile";
import { resolveAvatarPreset } from "../../../backend/services/profile/avatars";
import {
  BANNER_PRESETS,
  resolveBannerPreset,
} from "../../../backend/services/profile/banners";
import { api, Modal, moment, type Notice } from "../../components/workspace/shared";
import AvatarBadge from "./avatar-badge";
import AvatarStudio from "./avatar-studio";
import type { SettingsSection } from "./account-quick-panel";

type Props = {
  initialSection?: SettingsSection;
  notify: Notice;
  onBack: () => void;
  onProfileSynced: (profile: UserProfileSnapshot) => void;
  onSignOut: () => void;
};

const SECTIONS: {
  id: SettingsSection;
  label: string;
  desc: string;
  icon: typeof UserRound;
}[] = [
  {
    id: "profile",
    label: "Profile",
    desc: "Avatar, display name, @handle & community preview",
    icon: UserRound,
  },
  {
    id: "appearance",
    label: "Appearance & Accessibility",
    desc: "Motion, density, private ticker & Strategic Globe graphics budget",
    icon: Palette,
  },
  {
    id: "notifications",
    label: "Notifications",
    desc: "In-app room & conversation alerts",
    icon: Bell,
  },
  {
    id: "privacy",
    label: "Privacy & Security",
    desc: "Discoverability, direct messages, blocks & session",
    icon: Shield,
  },
  {
    id: "account",
    label: "Account & Data",
    desc: "Plan status, full JSON export & confirmed erasure",
    icon: Database,
  },
];

export default function SettingsView({
  initialSection = "profile",
  notify,
  onBack,
  onProfileSynced,
  onSignOut,
}: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [mobileListOpen, setMobileListOpen] = useState(false);
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
  const [genderSymbol, setGenderSymbol] = useState<GenderSymbolOption>("HIDDEN");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [interestsText, setInterestsText] = useState("");

  // Account erasure confirmation state
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [confirmGroups, setConfirmGroups] = useState(false);
  const [confirmConvos, setConfirmConvos] = useState(false);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setSection(initialSection);
      setMobileListOpen(false);
    });
    return () => {
      alive = false;
    };
  }, [initialSection]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ profile: UserProfileSnapshot }>("/api/profile");
      setProfile(res.profile);
      setDisplayName(res.profile.displayName);
      setHandle(res.profile.handle ?? "");
      setBio(res.profile.bio);
      setAge(res.profile.age ? String(res.profile.age) : "");
      setShowAge(res.profile.showAge === true);
      setBannerPresetId(res.profile.bannerPresetId ?? "b01");
      setBannerPosition(res.profile.bannerPosition ?? "center");
      setBannerOverlay(res.profile.bannerOverlay ?? 0.65);
      setGenderSymbol(res.profile.genderSymbol ?? "HIDDEN");
      setInstagramHandle(res.profile.instagramHandle ?? "");
      setWebsiteUrl(res.profile.websiteUrl ?? "");
      setInterestsText((res.profile.researchInterests ?? []).join(", "));
      onProfileSynced(res.profile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load account settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [onProfileSynced]);

  useEffect(() => {
    let alive = true;
    api<{ profile: UserProfileSnapshot }>("/api/profile")
      .then((res) => {
        if (!alive) return;
        setProfile(res.profile);
        setDisplayName(res.profile.displayName);
        setHandle(res.profile.handle ?? "");
        setBio(res.profile.bio);
        setAge(res.profile.age ? String(res.profile.age) : "");
        setShowAge(res.profile.showAge === true);
        setBannerPresetId(res.profile.bannerPresetId ?? "b01");
        setBannerPosition(res.profile.bannerPosition ?? "center");
        setBannerOverlay(res.profile.bannerOverlay ?? 0.65);
        setGenderSymbol(res.profile.genderSymbol ?? "HIDDEN");
        setInstagramHandle(res.profile.instagramHandle ?? "");
        setWebsiteUrl(res.profile.websiteUrl ?? "");
        setInterestsText((res.profile.researchInterests ?? []).join(", "));
        setError("");
        onProfileSynced(res.profile);
      })
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof Error ? err.message : "Could not load account settings.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [onProfileSynced]);

  async function saveProfileFields(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const researchInterests = interestsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
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
          genderSymbol,
          instagramHandle: instagramHandle.trim(),
          websiteUrl: websiteUrl.trim(),
          researchInterests,
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
      setGenderSymbol(res.profile.genderSymbol ?? "HIDDEN");
      setInstagramHandle(res.profile.instagramHandle ?? "");
      setWebsiteUrl(res.profile.websiteUrl ?? "");
      setInterestsText((res.profile.researchInterests ?? []).join(", "));
      onProfileSynced(res.profile);
      notify("Profile saved across your workspace.");
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
      window.location.assign("/");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Account erasure failed.", true);
    } finally {
      setBusy(false);
    }
  }

  const currentPreset = resolveAvatarPreset(profile?.avatarId);

  return (
    <section className="x6-settings" aria-label="Settings and preferences">
      <header className="x6-settings-topbar">
        <button
          type="button"
          className="x1-secondary x1-motion-button"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          <span>Back to workspace</span>
        </button>
        <div>
          <h1>Settings &amp; Preferences</h1>
          <p className="x1-caption">
            Private to your account · Changes save directly to Cloudflare D1
          </p>
        </div>
      </header>

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
          className={
            "x6-settings-rail" + (mobileListOpen ? " is-mobile-open" : "")
          }
          aria-label="Settings categories"
        >
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={"x6-settings-nav-item" + (active ? " is-active" : "")}
                onClick={() => {
                  setSection(item.id);
                  setMobileListOpen(false);
                }}
              >
                <Icon size={17} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </span>
                {item.id === "notifications" &&
                  (profile?.unreadNotifications ?? 0) > 0 && (
                    <span className="x6-unread-pill">
                      {profile!.unreadNotifications}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>

        <div className="x6-settings-content">
          <button
            type="button"
            className="x6-settings-mobile-switch x1-secondary"
            onClick={() => setMobileListOpen((v) => !v)}
          >
            <span>
              Section: {SECTIONS.find((s) => s.id === section)?.label}
            </span>
            <span>{mobileListOpen ? "Hide list" : "Switch"}</span>
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
                <div className="x1-panel x54-settings-panel">
                  {/* Unified Banner + Overlapping Avatar Editable Preview Header */}
                  <div className="x54-settings-preview-card">
                    <div
                      className="x54-settings-banner"
                      style={{
                        background: resolveBannerPreset(bannerPresetId).gradient,
                        backgroundPosition: bannerPosition,
                      }}
                    >
                      <div className="x54-settings-banner-veil" />
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
                        <h2>{displayName || profile.displayName}</h2>
                        <p className="x1-caption">
                          {handle ? `@${handle}` : "No @BodyID set yet"} ·{" "}
                          {currentPreset.name}
                        </p>
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
                          <span>Banner</span>
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

                  <form className="x1-form x54-settings-form" onSubmit={saveProfileFields}>
                    <fieldset className="x54-settings-group">
                      <legend>Essentials</legend>
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
                        Body ID (@handle)
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
                          Creates your public researcher profile. Direct messages,
                          portfolios, drafts, and email always remain private.
                        </span>
                      </label>

                      <label>
                        Short bio
                        <textarea
                          value={bio}
                          maxLength={320}
                          rows={3}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Markets, horizons, or hypotheses you study"
                        />
                      </label>
                    </fieldset>

                    <fieldset className="x54-settings-group">
                      <legend>Interests &amp; Links</legend>
                      <label>
                        Research interests (comma-separated, max 6)
                        <input
                          value={interestsText}
                          maxLength={180}
                          onChange={(e) => setInterestsText(e.target.value)}
                          placeholder="Macro, Indian Equities, Volatility, FX"
                        />
                      </label>

                      <div className="x54-optional-grid">
                        <label>
                          Instagram (optional)
                          <input
                            value={instagramHandle}
                            maxLength={32}
                            onChange={(e) => setInstagramHandle(e.target.value)}
                            placeholder="username (without @)"
                          />
                        </label>
                        <label>
                          Website URL (optional)
                          <input
                            type="url"
                            value={websiteUrl}
                            maxLength={200}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://example.com"
                          />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="x54-settings-group">
                      <legend>Optional details (hidden by default)</legend>
                      <div className="x54-optional-grid">
                        <label>
                          Age
                          <input
                            type="number"
                            min={18}
                            max={120}
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="Optional (18+)"
                          />
                        </label>
                        <label>
                          Gender
                          <select
                            value={genderSymbol}
                            onChange={(e) =>
                              setGenderSymbol(e.target.value as GenderSymbolOption)
                            }
                          >
                            <option value="HIDDEN">Hidden (Default)</option>
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

                  {/* Banner Preset Modal — honest R2 status */}
                  {bannerModalOpen && (
                    <Modal
                      title="Profile Banner"
                      onClose={() => setBannerModalOpen(false)}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div className="x51-backdrop-swatches">
                          {BANNER_PRESETS.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              className={
                                "x51-backdrop-swatch" +
                                (bannerPresetId === b.id ? " is-active" : "")
                              }
                              style={{ background: b.gradient }}
                              onClick={() => setBannerPresetId(b.id)}
                            >
                              {b.name}
                            </button>
                          ))}
                        </div>
                        <label>
                          Banner alignment
                          <select
                            value={bannerPosition}
                            onChange={(e) =>
                              setBannerPosition(e.target.value as BannerPosition)
                            }
                          >
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </label>
                        <div className="x54-r2-status-note" role="note">
                          <strong>Custom image upload unavailable</strong>
                          <span>
                            Custom photo uploads require Cloudflare R2 object
                            storage, which is not enabled on this deployment.
                            Select any of the 8 built-in banner presets above and
                            click Save profile.
                          </span>
                        </div>
                        <div className="x1-actions">
                          <button
                            type="button"
                            className="x1-primary"
                            onClick={() => setBannerModalOpen(false)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </Modal>
                  )}

                  {/* Unified Public Profile Preview Modal */}
                  {previewModalOpen && (
                    <Modal
                      title="Public Profile Preview"
                      onClose={() => setPreviewModalOpen(false)}
                    >
                      <div className="x54-settings-preview-card" style={{ marginBottom: 0 }}>
                        <div
                          className="x54-settings-banner"
                          style={{
                            background: resolveBannerPreset(bannerPresetId).gradient,
                            backgroundPosition: bannerPosition,
                          }}
                        >
                          <div className="x54-settings-banner-veil" />
                        </div>
                        <div className="x54-settings-preview-body">
                          <div className="x54-settings-avatar-ring">
                            <AvatarBadge avatarId={profile.avatarId} size={72} alt="" />
                          </div>
                          <div className="x54-settings-preview-meta">
                            <h3 style={{ margin: 0 }}>
                              {displayName || profile.displayName}
                              {genderSymbol === "MALE"
                                ? " ♂"
                                : genderSymbol === "FEMALE"
                                  ? " ♀"
                                  : ""}
                              {showAge && age ? ` · ${age}y` : ""}
                            </h3>
                            <p className="x1-caption" style={{ color: "var(--x1-title-blue)" }}>
                              {handle ? `@${handle}` : "@BodyID_not_set"}
                            </p>
                          </div>
                          {bio.trim() && (
                            <p className="x1-caption" style={{ margin: 0 }}>
                              {bio.trim()}
                            </p>
                          )}
                          <div className="x54-profile-stats" style={{ width: "100%" }}>
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
                            Email, portfolios, watchlists, drafts, and direct messages are never public.
                          </p>
                        </div>
                      </div>
                    </Modal>
                  )}
                </div>
              )}

              {section === "appearance" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2>Appearance &amp; Accessibility</h2>
                      <p className="x1-caption">
                        Core brand text colors stay locked for readability and WCAG contrast.
                      </p>
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Interface motion</strong>
                      <p className="x1-caption">
                        Controls page and control transitions. System reduced-motion preferences are always honored.
                      </p>
                    </div>
                    <div className="x1-segment" role="group" aria-label="Interface motion">
                      {(
                        [
                          ["system", "System"],
                          ["minimal", "Reduced"],
                          ["full", "Full"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={busy}
                          aria-pressed={profile.preferences.motion === val}
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
                        Tightens vertical spacing on cards and lists without altering numerical values.
                      </p>
                    </div>
                    <div className="x1-segment" role="group" aria-label="Information density">
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
                      <strong>Private Holdings Ticker (opt-in)</strong>
                      <p className="x1-caption">
                        OFF by default. Streams ONLY your private manual holdings or watchlist across dashboards; never visible to guests or public profiles.
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
                        Adapts 3D globe texture resolution and pixel ratio for smoother battery life on mobile devices.
                      </p>
                    </div>
                    <div className="x1-segment" role="group" aria-label="Strategic Globe graphics quality">
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
                          aria-pressed={profile.preferences.earthQuality === val}
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

              {section === "notifications" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2>Notifications</h2>
                      <p className="x1-caption">
                        In-app alerts for direct messages, room mentions, and invitations. Email &amp; browser push delivery are not active.
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
                          When disabled, new mentions and conversation alerts will not accumulate in your activity list.
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
                      Set a @handle in Profile settings first to configure Community notification rules.
                    </p>
                  )}

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
                            {moment(n.createdAt)} · {n.readAt ? "Read" : "Unread"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="x1-caption">
                        No notifications yet. Activity appears here only when backed by real room or message events.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {section === "privacy" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2>Privacy &amp; Security</h2>
                      <p className="x1-caption">
                        Server-enforced visibility rules. Brokerage credentials and API secrets are never stored in profile settings.
                      </p>
                    </div>
                  </div>

                  <dl className="x1-details">
                    <div>
                      <dt>Account email (private)</dt>
                      <dd>{profile.email}</dd>
                    </div>
                    <div>
                      <dt>Sign-in provider</dt>
                      <dd>
                        {profile.authProvider === "google"
                          ? "Google OAuth 2.0 (PKCE)"
                          : "Email & password (PBKDF2-SHA256 on Cloudflare D1)"}
                      </dd>
                    </div>
                  </dl>

                  {profile.hasCommunityProfile ? (
                    <>
                      {profile.legacyPrivateProfile ? (
                        <div className="x6-setting-row">
                          <div>
                            <strong>Legacy private profile (@{profile.handle})</strong>
                            <p className="x1-caption">
                              Your profile was created under an earlier private setting
                              and remains hidden until you opt in. Making your researcher
                              profile public never exposes DMs, portfolios, drafts, or email.
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
                            <strong>Public researcher profile (@{profile.handle})</strong>
                            <p className="x1-caption">
                              Your @BodyID and published Web Souls are discoverable by
                              design. Direct messages, portfolios, drafts, Graveyard
                              archive, and email stay strictly private.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="x6-setting-row">
                        <div>
                          <strong>Who can message you</strong>
                          <p className="x1-caption">
                            Messages are private to participants and server-authorized,
                            but not end-to-end encrypted.
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
                          <option value="REQUESTS">Message requests (1 intro)</option>
                          <option value="GROUPS">Shared Research Rooms only</option>
                          <option value="NONE">No new messages</option>
                        </select>
                      </div>

                      <div className="x6-setting-row">
                        <div>
                          <strong>Share read receipts</strong>
                          <p className="x1-caption">
                            Only notifies peers that you read a direct message when turned on.
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
                      Your account is private by default. Set a @handle in Profile if you want to opt into Community discovery.
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

                  <div className="x1-actions">
                    <button
                      type="button"
                      className="x1-secondary"
                      onClick={onSignOut}
                    >
                      <LogOut size={15} />
                      <span>Sign out of this session</span>
                    </button>
                  </div>
                </div>
              )}

              {section === "account" && (
                <div className="x1-panel">
                  <div className="x1-panel-head">
                    <div>
                      <h2>Account &amp; Data</h2>
                      <p className="x1-caption">
                        Research Beta · Free tier · Paid plans and billing are not active.
                      </p>
                    </div>
                  </div>

                  <div className="x6-setting-row">
                    <div>
                      <strong>Export your private data</strong>
                      <p className="x1-caption">
                        Downloads a bounded JSON snapshot of your watchlists, portfolios, Soul Scans, chart layouts, and community contributions.
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
                      Permanently deletes your login credentials, sessions, watchlists, portfolios, scans, and profile records from Cloudflare D1.
                    </p>
                    {!eraseOpen ? (
                      <button
                        type="button"
                        className="x1-secondary"
                        onClick={() => setEraseOpen(true)}
                      >
                        <Trash2 size={15} />
                        <span>Begin confirmed account erasure…</span>
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
                          I acknowledge any Research Rooms I solely own will also be deleted unless ownership is transferred first.
                        </label>
                        <label className="x1-checkbox">
                          <input
                            type="checkbox"
                            checked={confirmConvos}
                            onChange={(e) => setConfirmConvos(e.target.checked)}
                          />
                          I acknowledge paired private direct-message conversations will be deleted.
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
            </>
          ) : null}
        </div>
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
