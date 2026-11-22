"use client";
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
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
  onRequireAuth?: () => void;
  notify: Notice;
};

function formatCutoff(iso: string, underlying: "NIFTY50" | "GOLD"): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: underlying === "NIFTY50" ? "Asia/Kolkata" : "UTC",
    }).format(new Date(iso)) + (underlying === "NIFTY50" ? " IST" : " UTC");
  } catch {
    return iso;
  }
}

/**
 * [19] NIFTY 50 & Gold Daily Market Pulse — Compact Server-Time-Gated Polls.
 * Exact 4 choices with transparent percentage cutoffs, 1 vote per signed-in account,
 * public aggregate percentages (0 votes -> 0%, never NaN), zero personal win rates or leaderboards.
 */
export default function DailyMarketPulse({
  authenticated,
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
      notify("Daily Market Pulse vote recorded.");
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
    <section aria-labelledby="x52-pulse-heading">
      <div className="x52-section-center">
        <h2 id="x52-pulse-heading">NIFTY &amp; Gold Daily Market Pulse</h2>
        <p>
          Session sentiment polls with transparent percentage cutoffs · 1 vote
          per account · Server-time gated
        </p>
      </div>

      {loading && polls.length === 0 ? (
        <p className="x1-caption" style={{ textAlign: "center" }}>
          Loading daily session polls…
        </p>
      ) : (
        <div className="x52-pulse-grid">
          {polls.map((poll) => (
            <article key={poll.pollId} className="x52-poll-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong style={{ fontSize: "0.96rem" }}>{poll.title}</strong>
                  <div className="x1-caption">
                    Session {poll.sessionDate} · Closes{" "}
                    {formatCutoff(poll.closesAtUtc, poll.underlying)}
                  </div>
                </div>
                <span
                  className={
                    poll.status === "OPEN"
                      ? "x51-pill x51-pill-green"
                      : "x51-pill"
                  }
                >
                  {poll.status === "OPEN" ? "Open" : "Closed"} ·{" "}
                  {poll.totalVotes}{" "}
                  {poll.totalVotes === 1 ? "vote" : "votes"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {poll.tallies.map((t) => {
                  const picked = poll.myVote === t.choice;
                  return (
                    <button
                      key={t.choice}
                      type="button"
                      className={"x52-poll-option" + (picked ? " is-picked" : "")}
                      disabled={poll.status !== "OPEN" || busyPollId === poll.pollId}
                      aria-pressed={picked}
                      onClick={() => void vote(poll.pollId, t.choice)}
                    >
                      <span
                        className="x52-poll-fill"
                        style={{ width: `${Math.min(100, Math.max(0, t.pct))}%` }}
                        aria-hidden="true"
                      />
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {picked && <Check size={14} />}
                        <strong>{t.label}</strong>
                        <small className="x1-caption">({t.cutoff})</small>
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {t.pct.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="x1-caption" style={{ margin: 0 }}>
                {poll.cutoffNote}
              </p>
            </article>
          ))}
        </div>
      )}

      {disclosure && (
        <p className="x1-caption" style={{ textAlign: "center", marginTop: 8 }}>
          {disclosure}
        </p>
      )}
    </section>
  );
}
