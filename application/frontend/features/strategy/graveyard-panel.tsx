"use client";

import { Send } from "lucide-react";
import { Empty, moment, type ScanRun } from "../../components/workspace/shared";
import { IconGraveyard } from "../../components/workspace/ss-icons";
import { sourceBadgeLabel } from "./scan-helpers";

type GraveyardFilter = "ALL" | "CLASSIC" | "ADVANCED" | "RETIRED";

type Props = {
  totalSavedCount: number;
  graveyardFilter: GraveyardFilter;
  setGraveyardFilter: (f: GraveyardFilter) => void;
  graveyardQuery: string;
  setGraveyardQuery: (q: string) => void;
  graveyardScans: ScanRun[];
  activeScanId: string | null;
  publishingId: string | null;
  timeframeLabel: Record<string, string>;
  onSelectScan: (scanId: string) => void;
  onPublishScan: (scan: ScanRun) => void;
  onOpenReview: (scan: ScanRun) => void;
};

export default function GraveyardPanel({
  totalSavedCount,
  graveyardFilter,
  setGraveyardFilter,
  graveyardQuery,
  setGraveyardQuery,
  graveyardScans,
  activeScanId,
  publishingId,
  timeframeLabel,
  onSelectScan,
  onPublishScan,
  onOpenReview,
}: Props) {
  return (
    <section className="x53-graveyard-shell" aria-labelledby="ss-v3-graveyard-heading">
      <div className="x53-graveyard-head">
        <div className="x53-graveyard-title-wrap">
          <span className="x53-graveyard-icon" aria-hidden="true">
            <IconGraveyard size={22} />
          </span>
          <h2 id="ss-v3-graveyard-heading" className="x53-graveyard-title">
            GRAVEYARD
          </h2>
        </div>
        <span className="x51-pill x51-pill-blue">{totalSavedCount} saved</span>
      </div>

      <div className="x51-chip-row" role="group" aria-label="Filter GRAVEYARD">
        {(["ALL", "CLASSIC", "ADVANCED", "RETIRED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={graveyardFilter === f}
            className={"x51-chip" + (graveyardFilter === f ? " is-active" : "")}
            onClick={() => setGraveyardFilter(f)}
          >
            {f === "ALL"
              ? "All"
              : f === "CLASSIC"
                ? "Classic"
                : f === "ADVANCED"
                  ? "Advanced"
                  : "Retired"}
          </button>
        ))}
      </div>

      <input
        id="ss-v31-graveyard-search"
        name="graveyardSearch"
        type="search"
        className="x56-formula-search-input"
        aria-label="Search GRAVEYARD scans"
        placeholder="Search saved Souls or formulas…"
        value={graveyardQuery}
        onChange={(e) => setGraveyardQuery(e.target.value)}
      />

      {graveyardScans.length > 0 ? (
        <div className="x53-graveyard-list">
          {graveyardScans.map((s) => {
            const tfKey =
              (s.payload as { research?: { interval?: string } }).research?.interval ??
              s.payload.interval ??
              "1d";
            const presetKey = (
              s.payload as { research?: { universePreset?: string } }
            ).research?.universePreset;
            const srcStr = (s.payload as { source?: string }).source;
            return (
              <div
                key={s.id}
                className={
                  "x53-graveyard-card" + (activeScanId === s.id ? " is-selected" : "")
                }
              >
                <button
                  type="button"
                  className="x53-graveyard-main"
                  onClick={() => onSelectScan(s.id)}
                >
                  <div className="x53-graveyard-card-top">
                    <strong>{s.name}</strong>
                    <span className="x51-pill">
                      {s.mode === "SIMPLE" ? "Classic" : "Advanced"}
                    </span>
                    <span className="x51-pill">
                      {sourceBadgeLabel(presetKey, srcStr)}
                    </span>
                    <span className="x51-pill">
                      {timeframeLabel[tfKey] ?? tfKey}
                    </span>
                    {s.reviewState && (
                      <span className="x51-pill x51-pill-amber">{s.reviewState}</span>
                    )}
                  </div>
                  <code className="x53-compact-formula">
                    {s.payload.rule?.formula ?? ""}
                  </code>
                  <span className="x1-caption">
                    {s.payload.results?.matches ?? 0} matched ·{" "}
                    {s.payload.results?.eligible ?? 0} evaluated ·{" "}
                    {moment(s.created_at)}
                  </span>
                </button>

                <div className="ss-v3-graveyard-actions">
                  <button
                    type="button"
                    className="x51-accent-btn"
                    style={{ minHeight: 40, padding: "0 12px", fontSize: "0.84rem" }}
                    disabled={publishingId === s.id}
                    onClick={() => onPublishScan(s)}
                  >
                    <Send size={14} aria-hidden="true" />
                    <span>
                      {publishingId === s.id ? "Publishing…" : "Publish Soul"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="x1-secondary"
                    style={{ minHeight: 40, padding: "0 12px", fontSize: "0.84rem" }}
                    onClick={() => onOpenReview(s)}
                  >
                    Review Scan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="No archived Souls match">
          Completed Soul scans appear here automatically and stay preserved as
          immutable records.
        </Empty>
      )}
    </section>
  );
}
