"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
  Download,
  LineChart,
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
  { id: "America/New_York", label: "ET (NY)" },
] as const;

function formatEventTime(event: EconomicEvent, timeZone: string): string {
  if (!event.scheduledAtUTC || event.announcedDateOnly) {
    return `${event.scheduledDate} · Date only`;
  }
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(event.scheduledAtUTC));
  } catch {
    return event.scheduledAtUTC;
  }
}

function statusPillClass(status: EconomicEvent["status"]): string {
  if (status === "RELEASED") return "x51-pill x51-pill-green";
  if (status === "RESCHEDULED" || status === "TIME_NOT_ANNOUNCED")
    return "x51-pill x51-pill-amber";
  if (status === "CANCELLED") return "x51-pill x51-pill-red";
  return "x51-pill x51-pill-blue";
}

function defaultInstrumentForEvent(ev: EconomicEvent): string {
  if (ev.country === "IN") return "ECB:USDINR";
  if (ev.category === "ENERGY") return "ECB:EURUSD";
  if (ev.country === "US" || ev.country === "EU") return "ECB:EURUSD";
  return "ECB:USDINR";
}

/**
 * [04] Official Source-Grounded Economic Calendar — Positioned at the VERY BOTTOM of Global.
 * - ZERO visible Impact select or HIGH/MEDIUM/LOW impact badges anywhere.
 * - Fixes mobile "Zon/e" wrap (.x52-zone-picker) and status overlap (.x52-cal-summary-clean).
 * - Compact default (6 upcoming events) with Show All toggle.
 * - [14] Event -> Chart button opens contextual Asset Terminal with observed non-causal window return.
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyReminder, setBusyReminder] = useState<string | null>(null);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        range,
        country,
      });
      const res = await api<CalendarResponse>(`/api/calendar/events?${qs}`);
      setEvents(res.events);
      setReminderIds(res.reminderIds ?? []);
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Could not load Economic Calendar.",
        true,
      );
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

  return (
    <section aria-labelledby="x51-calendar-heading">
      <div className="x51-section-head">
        <div>
          <h2 id="x51-calendar-heading">Economic Calendar</h2>
          <p className="x51-section-sub">
            Official statutory release schedules (RBI, MoSPI, FOMC, BLS, BEA, EIA, ECB)
          </p>
        </div>
        <label className="x52-zone-picker x1-caption">
          <span>Zone</span>
          <select
            aria-label="Calendar timezone"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            style={{
              background: "var(--x51-surface-card)",
              color: "var(--x1-text-primary)",
              border: "1px solid var(--x51-hairline-strong)",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: "0.82rem",
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="x51-cal-toolbar">
        <div className="x51-chip-row" role="group" aria-label="Time range">
          {(
            [
              ["today", "Today"],
              ["week", "This Week"],
              ["upcoming", "Upcoming"],
              ["all", "All 2026–27"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={"x51-chip" + (range === id ? " is-active" : "")}
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

        <div className="x51-chip-row" role="group" aria-label="Region filter">
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
              className={"x51-chip" + (country === id ? " is-active" : "")}
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
        <div className="x1-callout">Loading official macro schedule…</div>
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
          <div className="x51-cal-list" role="list" aria-label="Official economic releases">
            {visibleEvents.map((ev) => {
              const expanded = expandedId === ev.eventId;
              const reminded = reminderIds.includes(ev.eventId);
              return (
                <div key={ev.eventId} className="x51-cal-row" role="listitem">
                  <button
                    type="button"
                    className="x52-cal-summary-clean"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : ev.eventId)}
                  >
                    <span className="x51-pill" style={{ justifyContent: "center" }}>
                      {ev.country}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.88rem",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{ev.title}</span>
                        {reminded && (
                          <span className="x51-pill x51-pill-green">Saved</span>
                        )}
                      </div>
                      <div className="x1-caption">
                        {formatEventTime(ev, timeZone)} · {ev.canonicalSourceId}
                      </div>
                    </div>
                    <span className="x52-cal-status-col">
                      <span className={statusPillClass(ev.status)}>
                        {ev.status === "TIME_NOT_ANNOUNCED"
                          ? "Date Only"
                          : ev.status.charAt(0) + ev.status.slice(1).toLowerCase()}
                      </span>
                      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                  </button>

                  {expanded && (
                    <div className="x51-cal-detail">
                      <p className="x1-caption" style={{ margin: "8px 0 0" }}>
                        {ev.description}
                      </p>
                      <div className="x51-cal-metrics">
                        <div className="x51-cal-metric">
                          <small>Previous</small>
                          <strong>{ev.previous ?? "— Official archive"}</strong>
                        </div>
                        <div className="x51-cal-metric">
                          <small>Consensus</small>
                          <strong>{ev.consensus ?? "— Unavailable"}</strong>
                        </div>
                        <div className="x51-cal-metric">
                          <small>Actual</small>
                          <strong>{ev.actual ?? "— Check official source"}</strong>
                        </div>
                      </div>
                      <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                        {onOpenEventChart && (
                          <button
                            type="button"
                            className="x51-accent-btn"
                            style={{ minHeight: 36, fontSize: "0.82rem", padding: "0 11px" }}
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
                          style={{ minHeight: 36, fontSize: "0.82rem" }}
                        >
                          <span>{ev.canonicalSourceId} Source</span>
                          <ArrowUpRight size={14} />
                        </a>
                        <button
                          type="button"
                          className="x1-secondary"
                          style={{ minHeight: 36, fontSize: "0.82rem" }}
                          onClick={() => downloadIcs(ev)}
                        >
                          <Download size={14} />
                          <span>.ics</span>
                        </button>
                        <button
                          type="button"
                          className="x1-secondary"
                          style={{ minHeight: 36, fontSize: "0.82rem" }}
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

          {events.length > 6 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
              <button
                type="button"
                className="x1-secondary"
                style={{ minHeight: 36, fontSize: "0.82rem" }}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show fewer events" : `Show all ${events.length} events`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
