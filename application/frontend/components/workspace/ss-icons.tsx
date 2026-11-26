"use client";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; active?: boolean };

const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

/** Orbital Globe — Global Markets & World */
export function IconGlobal({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9.25" />
      <path d="M3.2 9.2h17.6M3.2 14.8h17.6" />
    </svg>
  );
}

/** Precision Signal Pulse — Strategy / SoulScan */
export function IconStrategy({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="4" />
      <path d="M6.8 14.2 10 10.6l2.8 2.4 4.4-5" />
      <circle cx="17.2" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Connected Constellation — Community */
export function IconCommunity({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 18.8c.8-3 3.1-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
      <circle cx="16.8" cy="9.5" r="2.3" />
      <path d="M16.2 14.5c1.9.3 3.7 1.5 4.3 4.1" />
    </svg>
  );
}

/** Soul Feed — Structured Published Souls */
export function IconSoulFeed({ size = 24, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M7.5 8.5h9M7.5 12.2h6.5M7.5 15.8h4.5" />
      <circle cx="16.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Chats — Direct Messages */
export function IconChats({ size = 24, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <path d="M4.2 11.4c0-4.2 3.5-7.4 7.8-7.4s7.8 3.2 7.8 7.4-3.5 7.4-7.8 7.4c-1.3 0-2.5-.3-3.6-.8L4 19.6l1.1-3.5c-.6-1.4-.9-3-.9-4.7Z" />
      <path d="M8.8 10.6h6.4M8.8 13.8h4.2" />
    </svg>
  );
}

/** Rooms — Research Channels */
export function IconRooms({ size = 24, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <rect x="3.5" y="4" width="7.2" height="7.2" rx="2.2" />
      <rect x="13.3" y="4" width="7.2" height="7.2" rx="2.2" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2.2" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2.2" />
    </svg>
  );
}

/** GRAVEYARD — Vaulted Immutable Souls Archive */
export function IconGraveyard({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <path d="M5 20.5h14" />
      <path d="M7 20.5V10.2a5 5 0 0 1 10 0v10.3" />
      <path d="M10 11.5h4M12 9.5v4.5" />
    </svg>
  );
}

/** My Portfolio — Private Vault Ledger */
export function IconPortfolio({ size = 22, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <rect x="3" y="6.5" width="18" height="13.5" rx="3.2" />
      <path d="M8.5 6.5V5a1.8 1.8 0 0 1 1.8-1.8h3.4A1.8 1.8 0 0 1 15.5 5v1.5" />
      <path d="M3.5 11.8h17" />
      <rect x="10.2" y="10.4" width="3.6" height="2.8" rx="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Watchlist — Precision Tracker */
export function IconWatchlist({ size = 22, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <path d="M2.8 12s3.5-6.2 9.2-6.2S21.2 12 21.2 12s-3.5 6.2-9.2 6.2S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/** Pin — Classic Formula Favorite / Pin */
export function IconPin({ size = 16, active = false, className = "", ...props }: IconProps) {
  return (
    <svg {...base(size)} className={`ss-v3-icon ${className}`.trim()} {...props}>
      <path
        d="M9 4.5h6l-.8 4.4 2.5 2.5v1.4H7.3v-1.4l2.5-2.5L9 4.5Z"
        fill={active ? "currentColor" : "none"}
      />
      <path d="M12 12.8v6.7" />
    </svg>
  );
}

/** Realistic Layered Ember Flame (colored SVG, never grayscaled) */
export function IconEmberFlame({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={`ss-v3-colored-svg ss-go-flame-svg ${className}`.trim()}
    >
      <defs>
        <linearGradient id="ssFlameOuter" x1="14" y1="2" x2="14" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE28A" />
          <stop offset="42%" stopColor="#FF9636" />
          <stop offset="100%" stopColor="#E64A19" />
        </linearGradient>
        <linearGradient id="ssFlameCore" x1="14" y1="11" x2="14" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8D6" />
          <stop offset="60%" stopColor="#FFD066" />
          <stop offset="100%" stopColor="#FF8A2B" />
        </linearGradient>
      </defs>
      <path
        d="M14.3 2.6c.4 3.5-1.2 5.4-2.8 7.1-1.9 2-3.5 4.1-3.5 7.1 0 3.7 2.8 6.8 6.4 6.8 3.9 0 6.8-3.1 6.8-7.1 0-3.2-1.8-6-3.7-8-.2 1.6-1 2.7-2.1 3.3.5-3.2.5-6.6-1.1-9.2Z"
        fill="url(#ssFlameOuter)"
      />
      <path
        d="M14.2 12.2c.2 1.9-.7 3-1.4 3.9-.8 1-1.4 2-1.4 3.3 0 1.8 1.3 3.2 3 3.2 1.8 0 3.1-1.4 3.1-3.3 0-1.6-.9-3-1.9-4.1-.2.9-.7 1.4-1.3 1.7.3-1.5.4-3.2-.1-4.7Z"
        fill="url(#ssFlameCore)"
      />
      <circle cx="9.2" cy="7.2" r="1.1" fill="#FFB957" opacity="0.85" />
      <circle cx="19.6" cy="9.4" r="0.95" fill="#FFE082" opacity="0.78" />
    </svg>
  );
}
