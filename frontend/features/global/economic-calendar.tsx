"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  LineChart,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import {
  buildEventIcs,
  type EconomicEvent,
} from "../../../backend/services/market-data/economic-calendar";
import { api, type Notice } from "../../components/workspace/shared";

type CalendarResponse = {
  asOfUTC: string;
  lastVerifiedAtUTC: string;
  defaultTimezone: string;
  events: EconomicEvent[];
  reminderIds: string[];
  disclosure: string;
  reminderNotice: string;
};

export type EconomicEventChartContext = {
  instrumentId: string;
  eventTitle: string;
  eventDate: string;
  announcedDateOnly: boolean;
  sourceAgency: string;
};

type Props = {
  authenticated: boolean;
  onRequireAuth?: () => void;
  onOpenEventChart?: (ctx: EconomicEventChartContext) => void;
  notify: Notice;
};

const TIMEZONES = [
  { id: "Asia/Kolkata", label: "IST" },
  { id: "UTC", label: "UTC" },
  { id: "America/New_York", label: "New York" },
] as const;

function formatDateChip(
  event: EconomicEvent,
  timeZone: string,
): { dateLabel: string; timeLabel: string } {
  if (!event.scheduledAtUTC || event.announcedDateOnly) {
    try {
      const d = new Date(`${event.scheduledDate}T12:00:00.000Z`);
      const dateLabel = new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(d);
      return { dateLabel, timeLabel: "Time not announced" };
    } catch {
      return { dateLabel: event.scheduledDate, timeLabel: "Time not announced" };
    }
  }
  try {
    const dt = new Date(event.scheduledAtUTC);
    const dateLabel = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(dt);
    const timeLabel = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(dt);
    return { dateLabel, timeLabel };
  } catch {
    return { dateLabel: event.scheduledDate, timeLabel: "Time not announced" };
  }
}

function StatusIcon({ status }: { status: EconomicEvent["status"] }) {
  if (status === "RELEASED") {
    return (
      <span title="Released" aria-label="Released" className="x53-cal-icon is-released">
        <CheckCircle2 size={15} aria-hidden="true" />
      </span>
    );
  }
  if (status === "RESCHEDULED") {
    return (
      <span title="Rescheduled" aria-label="Rescheduled" className="x53-cal-icon is-warn">
        <AlertTriangle size={15} aria-hidden="true" />
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span title="Cancelled" aria-label="Cancelled" className="x53-cal-icon is-cancel">
        <XCircle size={15} aria-hidden="true" />
      </span>
    );
  }
  if (status === "TIME_NOT_ANNOUNCED") {
    return (
      <span title="Time not announced" aria-label="Time not announced" className="x53-cal-icon is-warn">
        <Clock size={15} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span title="Scheduled" aria-label="Scheduled" className="x53-cal-icon">
      <Clock size={14} aria-hidden="true" />
    </span>
  );
}

function defaultInstrumentForEvent(ev: EconomicEvent): string {
  if (ev.country === "IN") return "ECB:USDINR";
  if (ev.category === "ENERGY") return "ECB:EURUSD";
  if (ev.country === "US" || ev.country === "EU") return "ECB:EURUSD";
  return "ECB:USDINR";
}

/**
 * Strategic Souls X5.3 — Redesigned Economic Calendar (Same Compact Footprint).
 * - Clean flat timeline rows with date/time chip, subtle dividers, minimal status icons
 * - Zero editorial impact controls or badges anywhere
 * - Crisp IST / UTC / New York timezone select (no "Zon/e" wrap, >=16px select)
 * - Displays ~6 initial events + "Show all" toggle + verified schedule coverage window
 */
export default function EconomicCalendar({
  authenticated,
  onRequireAuth,
  onOpenEventChart,
  notify,
}: Props) {
  const [range, setRange] = useState<"today" | "week" | "upcoming" | "all">(
    "upcoming",
  );
  const [country, setCountry] = useState<string>("ALL");
  const [timeZone, setTimeZone] = useState<string>("Asia/Kolkata");
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [reminderIds, setReminderIds] = useState<string[]>([]);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyReminder, setBusyReminder] = useState<string | null>(null);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const qs = new URLSearchParams({
        range,
        country,
      });
      const res = await api<CalendarResponse>(`/api/calendar/events?${qs}`);
      setEvents(res.events);
      setReminderIds(res.reminderIds ?? []);
      setLastVerified(res.lastVerifiedAtUTC ?? null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not load Economic Calendar.";
      setLoadError(msg);
      notify(msg, true);
    } finally {
      setLoading(false);
    }
  }, [range, country, notify]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadCalendar();
    });
    return () => {
      alive = false;
    };
  }, [loadCalendar]);

  async function toggleReminder(eventId: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (busyReminder) return;
    setBusyReminder(eventId);
    try {
      const res = await api<{ ok: boolean; reminderIds: string[] }>(
        "/api/calendar/events",
        { eventId },
      );
      setReminderIds(res.reminderIds);
      const saved = res.reminderIds.includes(eventId);
      notify(
        saved ? "Saved in-app calendar reminder." : "Removed calendar reminder.",
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not update reminder.",
        true,
      );
    } finally {
      setBusyReminder(null);
    }
  }

  function downloadIcs(event: EconomicEvent) {
    const ics = buildEventIcs(event);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.eventId}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const visibleEvents = showAll ? events : events.slice(0, 6);
  const tzShort =
    TIMEZONES.find((t) => t.id === timeZone)?.label ?? "IST";

  return (
    <section className="x53-cal-section" aria-labelledby="x53-calendar-heading">
      <div className="x53-cal-header">
        <div>
          <h2 id="x53-calendar-heading">Economic Calendar</h2>
          <p className="x51-section-sub">
            Official agency schedules (RBI, MoSPI, FOMC, BLS, BEA, EIA, ECB) ·
            Verified coverage through Mar 2027
          </p>
        </div>
        <label className="x53-cal-tz x52-zone-picker">
          <span className="x1-caption">Timezone</span>
          <select
            aria-label="Calendar timezone"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            className="x53-cal-tz-select"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="x53-cal-controls">
        <div className="x53-cal-chips" role="group" aria-label="Time range">
          {(
            [
              ["today", "Today"],
              ["week", "This Week"],
              ["upcoming", "Upcoming"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={"x53-cal-chip" + (range === id ? " is-active" : "")}
              aria-pressed={range === id}
              onClick={() => {
                setRange(id);
                setShowAll(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="x53-cal-chips" role="group" aria-label="Region filter">
          {(
            [
              ["ALL", "All"],
              ["IN", "India"],
              ["US", "US"],
              ["EU", "Euro Area"],
              ["GLOBAL", "Global"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={"x53-cal-chip" + (country === id ? " is-active" : "")}
              aria-pressed={country === id}
              onClick={() => {
                setCountry(id);
                setShowAll(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="x55-feed-skeleton" aria-busy="true" aria-label="Loading economic calendar">
          <div className="x55-skel-card" style={{ height: 56 }} />
          <div className="x55-skel-card" style={{ height: 56 }} />
          <div className="x55-skel-card" style={{ height: 56 }} />
        </div>
      ) : loadError ? (
        <div className="x1-callout" role="alert">
          <strong>{loadError}</strong>{" "}
          <button
            type="button"
            className="x1-text-button"
            onClick={() => void loadCalendar()}
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="x1-callout">
          <CalendarIcon size={16} aria-hidden="true" /> No official scheduled
          releases in this window.{" "}
          <button
            type="button"
            className="x1-text-button"
            onClick={() => setRange("upcoming")}
          >
            View Upcoming
          </button>
        </div>
      ) : (
        <>
          <div
            className="x53-cal-timeline"
            role="list"
            aria-label="Official economic releases"
          >
            {visibleEvents.map((ev) => {
              const expanded = expandedId === ev.eventId;
              const reminded = reminderIds.includes(ev.eventId);
              const { dateLabel, timeLabel } = formatDateChip(ev, timeZone);
              const hasTime = Boolean(ev.scheduledAtUTC && !ev.announcedDateOnly);

              return (
                <div
                  key={ev.eventId}
                  className={"x53-cal-row" + (expanded ? " is-expanded" : "")}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="x53-cal-row-btn"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : ev.eventId)}
                  >
                    <div className="x53-cal-datecol">
                      <span className="x53-cal-date">{dateLabel}</span>
                      <span className="x53-cal-time">
                        {hasTime ? `${timeLabel} ${tzShort}` : "TBA"}
                      </span>
                    </div>

                    <div className="x53-cal-maincol">
                      <div className="x53-cal-title">
                        <span>{ev.title}</span>
                        {reminded && (
                          <Bell
                            size={13}
                            aria-label="Reminder saved"
                            style={{ color: "var(--x1-title-blue)", flexShrink: 0 }}
                          />
                        )}
                      </div>
                      <div className="x53-cal-meta">
                        <span>{ev.countryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ev.canonicalSourceId}</span>
                        {!hasTime && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Time not announced</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className="x53-cal-endcol">
                      <StatusIcon status={ev.status} />
                      {expanded ? (
                        <ChevronUp size={15} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={15} aria-hidden="true" />
                      )}
                    </span>
                  </button>

                  {expanded && (
                    <div className="x53-cal-detail">
                      <p className="x1-caption" style={{ margin: 0 }}>
                        {ev.description}
                      </p>
                      <div className="x53-cal-detail-meta x1-caption">
                        <span>
                          Agency: <strong>{ev.sourceAgency}</strong>
                        </span>
                        <span>
                          Schedule:{" "}
                          <strong>
                            {hasTime
                              ? `${ev.scheduledDate} · ${timeLabel} ${tzShort}`
                              : `${ev.scheduledDate} · Time not announced`}
                          </strong>
                        </span>
                        {ev.actual && (
                          <span>
                            Actual: <strong>{ev.actual}</strong>
                          </span>
                        )}
                        {ev.previous && (
                          <span>
                            Previous: <strong>{ev.previous}</strong>
                          </span>
                        )}
                      </div>
                      <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                        {onOpenEventChart && (
                          <button
                            type="button"
                            className="x51-accent-btn"
                            style={{ minHeight: 38, fontSize: "0.84rem", padding: "0 12px" }}
                            onClick={() =>
                              onOpenEventChart({
                                instrumentId: defaultInstrumentForEvent(ev),
                                eventTitle: ev.title,
                                eventDate: ev.scheduledDate,
                                announcedDateOnly: ev.announcedDateOnly,
                                sourceAgency: ev.sourceAgency,
                              })
                            }
                          >
                            <LineChart size={14} />
                            <span>View on Chart</span>
                          </button>
                        )}
                        <a
                          className="x1-secondary"
                          href={ev.primarySourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ minHeight: 38, fontSize: "0.84rem" }}
                        >
                          <span>{ev.canonicalSourceId} Release</span>
                          <ArrowUpRight size={14} />
                        </a>
                        <button
                          type="button"
                          className="x1-secondary"
                          style={{ minHeight: 38, fontSize: "0.84rem" }}
                          onClick={() => downloadIcs(ev)}
                        >
                          <Download size={14} />
                          <span>.ics</span>
                        </button>
                        <button
                          type="button"
                          className="x1-secondary"
                          style={{ minHeight: 38, fontSize: "0.84rem" }}
                          disabled={busyReminder === ev.eventId}
                          onClick={() => void toggleReminder(ev.eventId)}
                        >
                          {reminded ? <BellOff size={14} /> : <Bell size={14} />}
                          <span>{reminded ? "Remove" : "Remind"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="x53-cal-footer">
            {events.length > 6 && (
              <button
                type="button"
                className="x1-secondary"
                style={{ minHeight: 38, fontSize: "0.84rem" }}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show fewer events" : `Show all ${events.length} events`}
              </button>
            )}
            {lastVerified && (
              <span className="x1-caption">
                Schedules verified {lastVerified.slice(0, 10)} · Never fabricates consensus or actuals
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
