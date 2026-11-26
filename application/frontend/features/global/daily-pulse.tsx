"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import type {
  MarketPulsePollSnapshot,
  PollChoice,
} from "../../../backend/services/market-data/daily-pulse";
import { api, type Notice } from "../../components/workspace/shared";

type PollsResponse = {
  asOfUTC: string;
  polls: MarketPulsePollSnapshot[];
  disclosure: string;
};

type Props = {
  authenticated: boolean;
  compactHeader?: boolean;
  onRequireAuth?: () => void;
  notify: Notice;
};

function formatWindowTime(iso: string, underlying: "NIFTY50" | "GOLD"): string {
  try {
    return (
      new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: underlying === "NIFTY50" ? "Asia/Kolkata" : "UTC",
      }).format(new Date(iso)) + (underlying === "NIFTY50" ? " IST" : " UTC")
    );
  } catch {
    return iso;
  }
}

/**
 * Strategic Souls X5.3 — MARKET VOX (NIFTY & Gold community vote).
 * Relocated under Market Intelligence / Economic Calendar -> Market Vox.
 * Strict server-enforced post-close open window & pre-open cutoff, 4 transparent choices,
 * 1 vote per authenticated account, public aggregate counts/shares (0 votes -> 0%, never NaN),
 * zero personal win-rate scorecards or leaderboards.
 */
export default function DailyMarketPulse({
  authenticated,
  compactHeader = false,
  onRequireAuth,
  notify,
}: Props) {
  const [polls, setPolls] = useState<MarketPulsePollSnapshot[]>([]);
  const [disclosure, setDisclosure] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);

  const loadPolls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<PollsResponse>("/api/polls");
      setPolls(res.polls ?? []);
      setDisclosure(res.disclosure ?? "");
    } catch {
      /* Stay quiet on transient offline state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void loadPolls();
    });
    return () => {
      alive = false;
    };
  }, [loadPolls, authenticated]);

  async function vote(pollId: string, choice: PollChoice) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (busyPollId) return;
    setBusyPollId(pollId);
    try {
      const res = await api<{ ok: boolean; poll: MarketPulsePollSnapshot }>(
        "/api/polls",
        { pollId, choice },
      );
      setPolls((prev) =>
        prev.map((p) => (p.pollId === pollId ? res.poll : p)),
      );
      notify("Market Vox vote recorded.");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not submit vote.",
        true,
      );
    } finally {
      setBusyPollId(null);
    }
  }

  return (
    <section
      aria-label={compactHeader ? "Market Vox" : undefined}
      aria-labelledby={compactHeader ? undefined : "x53-vox-heading"}
    >
      {!compactHeader ? (
        <div className="x52-section-center">
          <h2 id="x53-vox-heading">MARKET VOX</h2>
          <p>NIFTY &amp; Gold community vote</p>
        </div>
      ) : (
        <p className="x51-section-sub" style={{ textAlign: "center", marginBottom: 14 }}>
          NIFTY &amp; Gold community vote
        </p>
      )}

      {loading && polls.length === 0 ? (
        <p className="x1-caption" style={{ textAlign: "center" }}>
          Loading active Market Vox sessions…
        </p>
      ) : (
        <div className="x52-pulse-grid">
          {polls.map((poll) => {
            const isUpcoming = poll.windowState === "UPCOMING";
            const isOpen = poll.status === "OPEN";
            return (
              <article key={poll.pollId} className="x52-poll-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.96rem" }}>{poll.title}</strong>
                    <div className="x1-caption">
                      Target session {poll.sessionDate} ·{" "}
                      {isUpcoming
                        ? `Opens ${formatWindowTime(poll.opensAtUtc, poll.underlying)}`
                        : `Closes ${formatWindowTime(poll.closesAtUtc, poll.underlying)}`}
                    </div>
                  </div>
                  <span
                    className={
                      isOpen
                        ? "x51-pill x51-pill-green"
                        : isUpcoming
                          ? "x51-pill x51-pill-amber"
                          : "x51-pill"
                    }
                  >
                    {isOpen ? "Open" : isUpcoming ? "Opens after close" : "Closed"}{" "}
                    · {poll.totalVotes}{" "}
                    {poll.totalVotes === 1 ? "vote" : "votes"}
                  </span>
                </div>

                {isUpcoming && (
                  <div className="x1-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={13} aria-hidden="true" />
                    <span>
                      Voting opens strictly after reference market close (
                      {formatWindowTime(poll.opensAtUtc, poll.underlying)}).
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {poll.tallies.map((t) => {
                    const picked = poll.myVote === t.choice;
                    return (
                      <button
                        key={t.choice}
                        type="button"
                        className={"x52-poll-option" + (picked ? " is-picked" : "")}
                        disabled={!isOpen || busyPollId === poll.pollId}
                        aria-pressed={picked}
                        onClick={() => void vote(poll.pollId, t.choice)}
                      >
                        <span
                          className="x52-poll-fill"
                          style={{
                            width: `${poll.totalVotes > 0 ? Math.min(100, Math.max(0, t.pct)) : 0}%`,
                          }}
                          aria-hidden="true"
                        />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {picked && <Check size={14} />}
                          <strong>{t.label}</strong>
                          <small className="x1-caption">({t.cutoff})</small>
                        </span>
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 600,
                          }}
                        >
                          {poll.totalVotes === 0 ? "0 votes" : `${t.pct.toFixed(1)}%`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="x1-caption" style={{ margin: 0 }}>
                  {poll.cutoffNote}
                </p>
              </article>
            );
          })}
        </div>
      )}

      {disclosure && (
        <p className="x1-caption" style={{ textAlign: "center", marginTop: 10 }}>
          {disclosure}
        </p>
      )}
    </section>
  );
}
