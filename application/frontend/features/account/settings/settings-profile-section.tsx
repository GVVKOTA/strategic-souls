"use client";

import "../../community/profile.css";
import { useState } from "react";
import { Check, Image as ImageIcon, Plus, X } from "lucide-react";
import { resolveAvatarPreset } from "../../../../backend/services/profile/avatars";
import {
  BANNER_PRESETS,
  resolveBannerPreset,
} from "../../../../backend/services/profile/banners";
import {
  INDIAN_STATES_AND_UTS,
  getIndianStateByCode,
} from "../../../../backend/services/profile/indian-states";
import type {
  BannerPosition,
  GenderSymbolOption,
  UserProfileSnapshot,
} from "../../../../backend/services/profile/profile";
import { Modal, type Notice } from "../../../components/workspace/shared";
import AvatarBadge from "../avatar-badge";

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

type Props = {
  profile: UserProfileSnapshot;
  busy: boolean;
  displayName: string;
  setDisplayName: (v: string) => void;
  handle: string;
  setHandle: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  showAge: boolean;
  setShowAge: (v: boolean) => void;
  bannerPresetId: string;
  setBannerPresetId: (v: string) => void;
  bannerPosition: BannerPosition;
  setBannerPosition: (v: BannerPosition) => void;
  stateCode: string;
  setStateCode: (v: string) => void;
  genderSymbol: GenderSymbolOption;
  setGenderSymbol: (v: GenderSymbolOption) => void;
  instagramHandle: string;
  setInstagramHandle: (v: string) => void;
  websiteUrl: string;
  setWebsiteUrl: (v: string) => void;
  selectedInterests: string[];
  setSelectedInterests: React.Dispatch<React.SetStateAction<string[]>>;
  onOpenAvatarStudio: () => void;
  onSaveProfile: (e: React.FormEvent) => Promise<void>;
  notify: Notice;
};

export default function SettingsProfileSection({
  profile,
  busy,
  displayName,
  setDisplayName,
  handle,
  setHandle,
  bio,
  setBio,
  age,
  setAge,
  showAge,
  setShowAge,
  bannerPresetId,
  setBannerPresetId,
  bannerPosition,
  setBannerPosition,
  stateCode,
  setStateCode,
  genderSymbol,
  setGenderSymbol,
  instagramHandle,
  setInstagramHandle,
  websiteUrl,
  setWebsiteUrl,
  selectedInterests,
  setSelectedInterests,
  onOpenAvatarStudio,
  onSaveProfile,
  notify,
}: Props) {
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerFilter, setBannerFilter] = useState<"ALL" | "dark" | "light">("ALL");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [interestSearch, setInterestSearch] = useState("");

  const currentPreset = resolveAvatarPreset(profile.avatarId);
  const activeBanner = resolveBannerPreset(bannerPresetId);
  const activeState = getIndianStateByCode(stateCode || null);
  const indianStatesOnly = INDIAN_STATES_AND_UTS.filter((s) => s.kind === "STATE");
  const indianUtsOnly = INDIAN_STATES_AND_UTS.filter((s) => s.kind === "UNION_TERRITORY");
  const filteredCuratedInterests = CURATED_INTERESTS.filter(
    (tag) =>
      !interestSearch.trim() ||
      tag.toLowerCase().includes(interestSearch.trim().toLowerCase()),
  );
  const customSelectedInterests = selectedInterests.filter(
    (tag) => !CURATED_INTERESTS.some((c) => c.toLowerCase() === tag.toLowerCase()),
  );
  const visibleBanners =
    bannerFilter === "ALL"
      ? BANNER_PRESETS
      : BANNER_PRESETS.filter((b) => b.theme === bannerFilter);

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

  return (
    <div className="x1-panel x54-settings-panel ss-x3-settings-pane">
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
            <button type="button" className="x54-strip-btn" onClick={onOpenAvatarStudio}>
              <ImageIcon size={14} aria-hidden="true" />
              <span>Edit avatar</span>
            </button>
            <button
              type="button"
              className="x54-strip-btn"
              onClick={() => setBannerModalOpen(true)}
            >
              <span>Profile banner ({BANNER_PRESETS.length})</span>
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

      <form className="x1-form x54-settings-form" onSubmit={(e) => void onSaveProfile(e)}>
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
              Your unique public handle (for example, @market_explorer). Direct
              messages, portfolios, GRAVEYARD scans, and email always remain private.
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
              <button type="button" className="x1-secondary" onClick={addCustomInterest}>
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

          <div className="ss-v3-interest-grid" role="group" aria-label="Research focus areas">
            {filteredCuratedInterests.map((tag) => {
              const isSelected = selectedInterests.some(
                (x) => x.toLowerCase() === tag.toLowerCase(),
              );
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={isSelected}
                  className={"ss-v3-interest-chip" + (isSelected ? " is-selected" : "")}
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
              <strong>{activeState ? activeState.code : "AP"}</strong>) on your public
              profile header when chosen.
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
                onChange={(e) => setGenderSymbol(e.target.value as GenderSymbolOption)}
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

      {bannerModalOpen && (
        <Modal
          title={`Profile Cover Banner Library (${BANNER_PRESETS.length} designs)`}
          onClose={() => setBannerModalOpen(false)}
        >
          <div className="x56-banner-modal-body">
            <div className="x56-banner-live-preview" aria-label="Live profile banner preview">
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
                    <AvatarBadge avatarId={profile.avatarId} size={56} alt="" />
                  </div>
                  <div className="x56-banner-live-text">
                    <strong>{displayName || profile.displayName}</strong>
                    <span>{handle ? `@${handle}` : "No Body ID set yet"}</span>
                  </div>
                </div>
                {activeState && (
                  <span className="x56-state-capsule" title={activeState.name}>
                    {activeState.code}
                  </span>
                )}
              </div>
            </div>

            <div className="x1-segment" role="group" aria-label="Filter banners by tone">
              {(
                [
                  ["ALL", `All (${BANNER_PRESETS.length})`],
                  ["dark", `Dark (${BANNER_PRESETS.filter((b) => b.theme === "dark").length})`],
                  ["light", `Light (${BANNER_PRESETS.filter((b) => b.theme === "light").length})`],
                ] as const
              ).map(([tone, label]) => (
                <button
                  key={tone}
                  type="button"
                  aria-pressed={bannerFilter === tone}
                  onClick={() => setBannerFilter(tone)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="x56-banner-grid"
              role="listbox"
              aria-label="Profile cover banner artwork designs"
            >
              {visibleBanners.map((b) => {
                const selected = bannerPresetId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={
                      "x56-banner-card x51-backdrop-swatch" + (selected ? " is-active" : "")
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
                        <span className="x56-banner-check" aria-hidden="true">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div className="x56-banner-card-meta">
                      <span className="x56-banner-card-title">{b.name}</span>
                      <span className="x56-banner-theme-pill">
                        {b.theme === "light" ? "Light" : "Dark"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="x56-banner-align-row">
              <span className="x56-banner-align-label">Focal alignment</span>
              <div className="x1-segment" role="group" aria-label="Banner vertical alignment">
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
              Profile cover banners are completely independent from your My Portfolio
              backdrop. Save profile after closing to persist.
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
        <Modal title="Public Profile Preview" onClose={() => setPreviewModalOpen(false)}>
          <div className="x54-settings-preview-card" style={{ marginBottom: 0 }}>
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
                <AvatarBadge avatarId={profile.avatarId} size={72} alt="" />
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
                    <p className="x1-caption" style={{ color: "var(--ss-section-accent, var(--x1-title-blue))" }}>
                      {handle ? `@${handle}` : "No Body ID yet"}
                    </p>
                  </div>
                  {activeState && (
                    <span className="x56-state-capsule" title={activeState.name}>
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
                Email, portfolios, watchlists, GRAVEYARD scans, and direct messages are never public.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
