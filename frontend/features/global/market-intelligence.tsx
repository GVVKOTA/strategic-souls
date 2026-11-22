"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Newspaper } from "lucide-react";
import type {
  NewsArticle,
  OfficialAgencyPortal,
} from "../../../backend/services/intelligence/news-and-disasters";

type NewsPayload = {
  status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
  providerName: string;
  fetchedAtUTC: string;
  articles: NewsArticle[];
  officialPortals: readonly OfficialAgencyPortal[];
  note: string;
};

type Props = {
  news: NewsPayload | null;
  loading: boolean;
  onOpenAsset?: (id: string) => void;
};

const CATEGORIES = [
  { id: "ALL", label: "All" },
  { id: "INDIA", label: "India" },
  { id: "GLOBAL", label: "Global" },
  { id: "COMMODITIES", label: "Commodities" },
  { id: "MACRO", label: "Macro" },
  { id: "GEOPOLITICS", label: "Geopolitics" },
] as const;

function formatPublished(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * [15] Market Intelligence News — CENTRAL VISUAL PRIORITY on Global Overview.
 * Full usable width, centered blue heading, clean source-linked headlines,
 * zero HIGH/MEDIUM/LOW impact badges, zero fabricated articles.
 */
export default function MarketIntelligenceNews({
  news,
  loading,
  onOpenAsset,
}: Props) {
  const [category, setCategory] = useState<string>("ALL");

  const filteredArticles = useMemo(() => {
    const list = news?.articles ?? [];
    if (category === "ALL") return list;
    return list.filter((a) => a.category === category);
  }, [news, category]);

  const filteredPortals = useMemo(() => {
    const list = news?.officialPortals ?? [];
    if (category === "ALL") return list;
    return list.filter((p) => p.category === category);
  }, [news, category]);

  return (
    <section className="x52-news-shell" aria-labelledby="x52-news-heading">
      <div className="x52-section-center">
        <h2 id="x52-news-heading">Market Intelligence</h2>
        <p>
          Verified primary announcements and financial headlines across India,
          global markets, commodities, macro policy, and geopolitics
        </p>
        <div
          className="x51-chip-row"
          role="group"
          aria-label="Market intelligence category filter"
          style={{ justifyContent: "center", marginTop: 4 }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"x51-chip" + (category === c.id ? " is-active" : "")}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !news ? (
        <p className="x1-caption" style={{ textAlign: "center", margin: 0 }}>
          Checking official sources and news feed…
        </p>
      ) : news && news.status === "CONNECTED" && filteredArticles.length > 0 ? (
        <div className="x52-news-grid" role="list" aria-label="Verified financial headlines">
          {filteredArticles.slice(0, 9).map((art) => (
            <article key={art.id} role="listitem" className="x52-news-card">
              <div>
                <div className="x52-news-meta" style={{ marginBottom: 5 }}>
                  <span className="x51-pill">{art.category}</span>
                  <span>{formatPublished(art.publishedAtUTC)}</span>
                </div>
                <h3>
                  <a
                    href={art.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {art.headline}
                  </a>
                </h3>
                {art.summary && (
                  <p className="x1-caption" style={{ margin: "6px 0 0" }}>
                    {art.summary}
                  </p>
                )}
                {art.relatedAssets.length > 0 && onOpenAsset && (
                  <div className="x51-chip-row" style={{ marginTop: 8 }}>
                    {art.relatedAssets.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        className="x51-chip"
                        style={{ minHeight: 28, fontSize: "0.74rem", padding: "2px 8px" }}
                        onClick={() => onOpenAsset(sym)}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="x52-news-meta">
                <strong>{art.sourceName}</strong>
                <a
                  href={art.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--x1-title-blue)", display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none" }}
                >
                  <span>Source</span>
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "9px 12px",
              borderRadius: 10,
              background: "var(--x51-surface-elevated)",
              border: "1px solid var(--x51-hairline)",
              fontSize: "0.84rem",
              color: "var(--x1-text-secondary)",
              textAlign: "center",
            }}
          >
            <Newspaper size={15} aria-hidden="true" />
            <span>
              Licensed newswire feed not connected — official central-bank and
              regulatory press portals (not live newswire articles) are linked
              below.
            </span>
          </div>

          <div className="x52-news-grid" role="list" aria-label="Official press release portals">
            {filteredPortals.map((portal) => (
              <a
                key={portal.id}
                role="listitem"
                href={portal.url}
                target="_blank"
                rel="noreferrer"
                className="x52-news-card"
              >
                <div>
                  <div className="x52-news-meta" style={{ marginBottom: 5 }}>
                    <span className="x51-pill">{portal.category}</span>
                    <span>Primary Agency</span>
                  </div>
                  <h3>{portal.title}</h3>
                  <p className="x1-caption" style={{ margin: "6px 0 0" }}>
                    {portal.description}
                  </p>
                </div>
                <div className="x52-news-meta">
                  <strong>{portal.agency}</strong>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
