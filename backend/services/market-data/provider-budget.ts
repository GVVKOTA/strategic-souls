import { database } from "../../../database/queries/repository";
import type { ProviderConfig } from "./data-types";
import { ProviderFailure, requiresCreditWindow, verifiedCreditWindow } from "./providers";

const MINUTE = 60_000;
const DAY = 86_400_000;

function backoffKey(config: ProviderConfig) { return "x2:provider-backoff:" + config.provider; }

export async function recordProviderBackoff(config: ProviderConfig, error: unknown, now = Date.now()) {
  if (!(error instanceof ProviderFailure) || error.code !== "RATE_LIMITED") return;
  const until = Math.min(Number.MAX_SAFE_INTEGER, now + Math.max(MINUTE, error.retryAfterMs ?? 30 * MINUTE));
  await database().prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET expires_at=max(rate_limits.expires_at,excluded.expires_at)`)
    .bind(backoffKey(config), until).run();
}

export async function reserveProviderCall(config: ProviderConfig, now = Date.now()) {
  const window = verifiedCreditWindow(config.sharedHistory?.creditWindow);
  if (requiresCreditWindow(config.provider) && !window)
    throw new ProviderFailure("LOCAL_RATE_BUDGET", "Confirm the provider credit window before requesting data.", DAY);
  const hourlyMinute = Math.trunc(now / MINUTE);
  const day = new Date(now).toISOString().slice(0, 10);
  const buckets = [
    { key: "x2:provider-minute:" + config.provider, limit: window?.callsPerMinute ?? Math.min(config.dailyCallLimit, 30),
      expires: (hourlyMinute + 1) * MINUTE },
    { key: "x2:provider:" + config.provider + ":" + day, limit: config.dailyCallLimit,
      expires: Date.parse(day) + DAY },
  ];
  if (window) {
    const end = Date.parse(window.endsAt);
    if (now < Date.parse(window.startsAt) || now >= end)
      throw new ProviderFailure("LOCAL_RATE_BUDGET", "The authorized provider credit window is inactive.",
        Math.max(DAY, Date.parse(window.startsAt) - now));
    buckets.push({ key: "x2:provider-window:" + config.provider + ":" + window.startsAt,
      limit: window.availableCredits, expires: end });
  }

  const encoded = JSON.stringify(buckets);
  const db = database();
  const result = await db.prepare(`
    WITH buckets AS (
      SELECT json_extract(value,'$.key') key, json_extract(value,'$.limit') cap,
        json_extract(value,'$.expires') expires FROM json_each(?)
    )
    INSERT INTO rate_limits (key,count,expires_at)
    SELECT b.key,1,b.expires FROM buckets b
    WHERE NOT EXISTS (
      SELECT 1 FROM buckets b2 JOIN rate_limits r ON r.key=b2.key
      WHERE r.expires_at>? AND r.count>=b2.cap
    )
    AND NOT EXISTS (SELECT 1 FROM rate_limits WHERE key=? AND expires_at>?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rate_limits.expires_at<=? THEN 1 ELSE rate_limits.count+1 END,
      expires_at=excluded.expires_at
  `).bind(encoded, now, backoffKey(config), now, now).run();
  if (result.meta.changes === buckets.length) return;
  const wait = await db.prepare(`
    SELECT max(expires_at) next_at FROM (
      SELECT r.expires_at FROM json_each(?) b JOIN rate_limits r ON r.key=json_extract(b.value,'$.key')
      WHERE r.expires_at>? AND r.count>=json_extract(b.value,'$.limit')
      UNION ALL SELECT expires_at FROM rate_limits WHERE key=? AND expires_at>?
    )
  `).bind(encoded, now, backoffKey(config), now).first<{ next_at: number | null }>();
  throw new ProviderFailure("LOCAL_RATE_BUDGET", "The provider request budget is exhausted.", Math.max(0, (wait?.next_at ?? now + MINUTE) - now));
}
