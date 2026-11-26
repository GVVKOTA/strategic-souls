"use client";

import { resolveAvatarPreset } from "../../../backend/services/profile/avatars";

type Props = {
  avatarId?: string | null;
  displayName?: string;
  size?: number;
  alt?: string;
  className?: string;
  ring?: boolean;
};

/**
 * Renders one of the 50 bundled original Strategic Souls preset SVG avatars
 * via static <img> path (zero untrusted SVG markup, zero third-party network calls).
 */
export default function AvatarBadge({
  avatarId,
  displayName,
  size = 38,
  alt,
  className = "",
  ring = false,
}: Props) {
  const preset = resolveAvatarPreset(avatarId);
  const resolvedAlt = alt ?? (displayName ? `${displayName} avatar` : "");
  return (
    <span
      className={
        "x6-avatar-badge" +
        (ring ? " is-ringed" : "") +
        (className ? " " + className : "")
      }
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Static SVG avatar asset served directly by Cloudflare Workers. */}
      <img
        src={preset.assetPath}
        width={size}
        height={size}
        alt={resolvedAlt}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
