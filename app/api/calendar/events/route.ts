import { getAuthenticatedUser } from "../../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import {
  getEconomicCalendarEvents,
  isOfficialEconomicEventId,
} from "../../../../backend/services/market-data/economic-calendar";
import { database, rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const REMINDERS_RECORD_KIND = "calendar-reminders";

async function getUserCalendarReminders(subject: string): Promise<string[]> {
  try {
    const row = await database()
      .prepare(
        "SELECT payload FROM x1_records WHERE id=? AND subject=? AND kind=? AND archived=0",
      )
      .bind(`calendar-reminders:${subject}`, subject, REMINDERS_RECORD_KIND)
      .first<{ payload: string }>();
    if (!row) return [];
    const parsed = JSON.parse(row.payload) as { eventIds?: unknown };
    return Array.isArray(parsed.eventIds)
      ? parsed.eventIds.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function toggleUserCalendarReminder(
  subject: string,
  eventId: string,
): Promise<string[]> {
  await rate(subject + ":x51-calendar-reminder", 60, 60_000);
  if (!isOfficialEconomicEventId(eventId)) {
    throw new HttpError(400, "Unknown economic calendar event ID.");
  }
  const current = await getUserCalendarReminders(subject);
  const set = new Set(current);
  if (set.has(eventId)) set.delete(eventId);
  else set.add(eventId);
  const next = [...set].slice(0, 50);
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
       VALUES (?, ?, ?, 'Economic Calendar Reminders', ?, 1, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, version=x1_records.version+1, last_write=excluded.last_write, updated_at=excluded.updated_at`,
    )
    .bind(
      `calendar-reminders:${subject}`,
      subject,
      REMINDERS_RECORD_KIND,
      JSON.stringify({ eventIds: next, updatedAt: now }),
      crypto.randomUUID(),
      now,
      now,
    )
    .run();
  return next;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const rawRange = (params.get("range") ?? "upcoming").toLowerCase();
    const range = ["today", "week", "upcoming", "all"].includes(rawRange)
      ? (rawRange as "today" | "week" | "upcoming" | "all")
      : "upcoming";
    const user = await getAuthenticatedUser(request).catch(() => null);
    const data = getEconomicCalendarEvents({
      range,
      country: params.get("country") ?? "ALL",
      importance: params.get("importance") ?? "ALL",
      category: params.get("category") ?? "ALL",
    });
    const reminderIds = user
      ? await getUserCalendarReminders(user.userId)
      : [];
    return Response.json(
      {
        ...data,
        reminderIds,
        reminderNotice:
          "Saved event reminders appear as in-app markers only; background email/push delivery is not active.",
      },
      {
        headers: {
          "Cache-Control": user
            ? "private, no-store"
            : "public, max-age=300, stale-while-revalidate=600",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Economic Calendar service unavailable.",
      },
      { status: err instanceof HttpError ? err.status : 503 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to save Economic Calendar reminders.");
    }
    protectMutation(request, 4096);
    const input = await body(request, 4096);
    const eventId = typeof input.eventId === "string" ? input.eventId.trim() : "";
    if (!eventId) throw new HttpError(400, "Event ID is required.");
    const reminderIds = await toggleUserCalendarReminder(user.userId, eventId);
    return Response.json(
      { ok: true, reminderIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Could not save calendar reminder.",
      },
      {
        status: err instanceof HttpError ? err.status : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
