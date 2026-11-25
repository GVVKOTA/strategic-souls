import { database } from "../../../database/queries/repository";
import { ECB_HISTORY_URL, marketSnapshot, type OfficialReferenceCache } from "./market-data";

function sourceFor(url: string): "ECB" | "UST" {
  if (url === ECB_HISTORY_URL) return "ECB";
  if (/^https:\/\/home\.treasury\.gov\/resource-center\/data-chart-center\/interest-rates\/pages\/xml\?data=daily_treasury_yield_curve&field_tdr_date_value_month=\d{6}$/.test(url)) {
    return "UST";
  }
  throw new Error("Unsupported official reference source.");
}

const cache: OfficialReferenceCache = {
  read(url) {
    return database().prepare(
      "SELECT document AS text, retrieved_at AS retrievedAt FROM official_reference_cache WHERE source=? AND source_url=?",
    ).bind(sourceFor(url), url).first<{ text: string; retrievedAt: string }>();
  },
  async write(url, entry) {
    await database().prepare(
      `INSERT INTO official_reference_cache (source, source_url, document, retrieved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
          source_url=excluded.source_url, document=excluded.document, retrieved_at=excluded.retrieved_at
        WHERE excluded.retrieved_at > official_reference_cache.retrieved_at`,
    ).bind(sourceFor(url), url, entry.text, entry.retrievedAt).run();
  },
};

export function loadOfficialReferences() {
  return marketSnapshot(fetch, Date.now(), cache);
}
