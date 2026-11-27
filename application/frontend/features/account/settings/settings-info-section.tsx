"use client";

import { Bell, Copy } from "lucide-react";
import { notificationLabel } from "../../../../backend/services/community/notification-target";
import type { UserProfileSnapshot } from "../../../../backend/services/profile/profile";
import { APP_RELEASE } from "../../../../backend/services/release-meta";
import { copyTextSafe, moment, type Notice } from "../../../components/workspace/shared";

export function SettingsNotificationsSection({
  profile,
  busy,
  onSaveSocial,
  onMarkAllRead,
  onOpenNotification,
  onOpenPriceAlerts,
}: {
  profile: UserProfileSnapshot;
  busy: boolean;
  onSaveSocial: (
    social: Partial<UserProfileSnapshot["social"]>,
    successText: string,
  ) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenNotification?: (id: string) => void;
  onOpenPriceAlerts?: () => void;
}) {
  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>Notifications</h2>
          <p className="x1-caption">
            In-app alerts for direct messages, Soul discussions, rooms, scans, and
            price alerts.
          </p>
        </div>
        {profile.unreadNotifications > 0 && (
          <button
            type="button"
            className="x1-secondary"
            disabled={busy}
            onClick={() => void onMarkAllRead()}
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
              Controls whether new mentions and conversation alerts appear in your
              activity list.
            </p>
          </div>
          <button
            type="button"
            className="x1-secondary"
            role="switch"
            aria-checked={profile.social.notifications}
            disabled={busy}
            onClick={() =>
              void onSaveSocial(
                { notifications: !profile.social.notifications },
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
          Set a @handle in Edit Profile first to configure Community notification
          rules.
        </p>
      )}

      {onOpenPriceAlerts && (
        <button type="button" className="x1-secondary" onClick={onOpenPriceAlerts}>
          <Bell size={16} /> Manage Price Alerts
        </button>
      )}

      <div className="x6-notif-list">
        {profile.notifications.length ? (
          profile.notifications.map((n) => (
            <div
              key={n.id}
              className={"x6-notif-item" + (n.readAt ? "" : " is-unread")}
            >
              <strong>{notificationLabel(n.kind)}</strong>
              <span className="x1-caption">
                {moment(n.createdAt)} · {n.readAt ? "Read" : "Unread"}
              </span>
              {onOpenNotification && (
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => onOpenNotification(n.id)}
                >
                  Open
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="x1-caption">
            No notifications yet. Real room, Soul, scan, and chat events appear here.
          </p>
        )}
      </div>
    </div>
  );
}

export function SettingsHelpSection({ notify }: { notify: Notice }) {
  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>Help &amp; Support</h2>
          <p className="x1-caption">
            Direct support contact and quick reference for Strategic Souls X 3.0.
          </p>
        </div>
      </div>

      <div className="x6-setting-row">
        <div>
          <strong>Support Email</strong>
          <p className="x1-caption">
            Reach our team directly for account recovery, bug reports, or research
            feedback.
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
            Your unique public researcher identifier in Community Souls, Rooms, and
            direct chats.
          </dd>
        </div>
        <div>
          <dt>Soul &amp; SoulScan</dt>
          <dd>
            A reproducible formula or rule tree scanned against completed bars on
            Markets or Watchlist across 30m, 1H, 3H, 6H, and 24H timeframes.
          </dd>
        </div>
        <div>
          <dt>SOUL MEMORY</dt>
          <dd>
            A private, same-day research ranking overlay calibrated strictly from
            your completed scans and completed forward bars today. It resets at
            00:00 IST daily and never modifies your archived GRAVEYARD records.
          </dd>
        </div>
        <div>
          <dt>GRAVEYARD</dt>
          <dd>
            Your private archive of completed scans. Publishing to Community never
            exposes private portfolio records.
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SettingsAboutSection() {
  return (
    <div className="x1-panel ss-x3-settings-pane">
      <div className="x1-panel-head">
        <div>
          <h2>About Strategic Souls</h2>
          <p className="x1-caption">
            Financial research, global market intelligence, and reproducible
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
            Strategic Souls provides educational and research tooling only — not
            personalized investment advice or order execution.
          </dd>
        </div>
      </dl>
    </div>
  );
}
