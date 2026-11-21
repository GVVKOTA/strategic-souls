"use client";

import { resolveAvatarPreset } from "../../../backend/services/profile/avatars";

type Props = {
  avatarId?: string | null;
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
  size = 38,
  alt = "",
  className = "",
  ring = false,
}: Props) {
  const preset = resolveAvatarPreset(avatarId);
  return (
    <span
      className={
        "x6-avatar-badge" +
        (ring ? " is-ringed" : "") +
        (className ? " " + className : "")
      }
      style={{ width: size, height: size }}
    >
      <img
        src={preset.assetPath}
        width={size}
        height={size}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
