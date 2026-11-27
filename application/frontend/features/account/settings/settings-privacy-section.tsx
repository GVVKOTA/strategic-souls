"use client";

import { useState } from "react";
import { ArrowUpRight, Download, Trash2 } from "lucide-react";
import type { UserProfileSnapshot } from "../../../../backend/services/profile/profile";
import { APP_RELEASE } from "../../../../backend/services/release-meta";

type Props = {
  profile: UserProfileSnapshot;
  busy: boolean;
  onSaveSocial: (
    social: Partial<UserProfileSnapshot["social"]>,
    successText: string,
  ) => Promise<void>;
  onUnblock: (handle: string) => Promise<void>;
  onEraseAccount: (payload: {
    confirmation: string;
    confirmSharedGroupDeletion: boolean;
    confirmSharedConversationDeletion: boolean;
  }) => Promise<void>;
};

export default function SettingsPrivacySection({
  profile,
  busy,
  onSaveSocial,
  onUnblock,
  onEraseAccount,
}: Props) {
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [confirmGroups, setConfirmGroups] = useState(false);
  const [confirmConvos, setConfirmConvos] = useState(false);

  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>Privacy &amp; Your Data</h2>
          <p className="x1-caption">
            Server-enforced visibility boundaries, private data export, and
            confirmed account deletion.
          </p>
        </div>
      </div>

      <div className="x6-setting-row">
        <span>Privacy contact</span>
        <a href={`mailto:${APP_RELEASE.supportEmail}`}>{APP_RELEASE.supportEmail}</a>
      </div>

      {profile.hasCommunityProfile ? (
        <>
          {profile.legacyPrivateProfile ? (
            <div className="x6-setting-row">
              <div>
                <strong>Legacy private profile (@{profile.handle})</strong>
                <p className="x1-caption">
                  Your profile remains hidden until you opt in. Public discovery
                  never exposes DMs, portfolios, GRAVEYARD scans, or email.
                </p>
              </div>
              <button
                type="button"
                className="x1-primary"
                disabled={busy}
                onClick={() =>
                  void onSaveSocial(
                    { discoverable: true },
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
                  Your Body ID and published Souls are discoverable. Direct
                  messages, portfolios, GRAVEYARD scans, and email stay strictly
                  private.
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
                void onSaveSocial(
                  {
                    messages: e.target.value as "REQUESTS" | "GROUPS" | "NONE",
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
                void onSaveSocial(
                  { receipts: !profile.social.receipts },
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
          Your account is private by default. Set a @handle in Edit Profile to
          participate in Community discovery.
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
                onClick={() => void onUnblock(b.handle)}
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Relocated from removed Account & Data category (X3-065) */}
      <div
        className="x6-setting-row"
        style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--x51-hairline)" }}
      >
        <div>
          <strong>Export your private data</strong>
          <p className="x1-caption">
            Downloads a bounded JSON snapshot of your watchlists, portfolios,
            GRAVEYARD Soul Scans, and community contributions.
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

      <div className="x6-danger-zone">
        <h3>Delete account &amp; personal data</h3>
        <p className="x1-caption">
          Permanently deletes your account, sessions, watchlists, portfolios,
          GRAVEYARD scans, and profile data. This action cannot be undone.
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
          <form
            className="x1-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onEraseAccount({
                confirmation: eraseText,
                confirmSharedGroupDeletion: confirmGroups,
                confirmSharedConversationDeletion: confirmConvos,
              });
            }}
          >
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
              I acknowledge any Research Rooms I solely own will also be deleted
              unless ownership is transferred first.
            </label>
            <label className="x1-checkbox">
              <input
                type="checkbox"
                checked={confirmConvos}
                onChange={(e) => setConfirmConvos(e.target.checked)}
              />
              I acknowledge paired private direct-message conversations will be
              deleted.
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
  );
}
