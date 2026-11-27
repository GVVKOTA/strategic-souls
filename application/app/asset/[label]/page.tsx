import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthenticatedUser } from "../../../backend/auth/session";
import { instrumentByLabel } from "../../../backend/services/market-data/instruments";
import { TradingViewWidget } from "../../../frontend/components/tradingview-widget";

export const dynamic = "force-dynamic";

export default async function AssetPage({
  params,
}: {
  params: Promise<{ label: string }>;
}) {
  const { label } = await params;
  const instrument = instrumentByLabel(label);
  if (!instrument) notFound();
  await requireAuthenticatedUser("/asset/" + encodeURIComponent(label));

  return (
    <main className="asset-page">
      <Link className="secondary" href="/workspace">
        ← Research workspace
      </Link>
      <header className="section-intro">
        <span className="eyebrow">
          STRATEGIC GLOBAL · INSTRUMENT IDENTITY
        </span>
        <h1>{instrument.label}</h1>
        <p>{instrument.name}</p>
      </header>

      {instrument.originalVenueStatus === "UNVERIFIED" && (
        <div className="notice">
          Display venue mapping is retained for reference only; the original
          primary venue remains unverified and supplies no numeric scan feed or
          order routing.
        </div>
      )}

      {instrument.widgetSupport.startsWith("RESTRICTED") ? (
        <section className="panel">
          <span className="badge">PUBLIC WIDGET RESTRICTED</span>
          <h2>This chart is available at its source.</h2>
          <p>
            TradingView’s public embed restricts this symbol to TradingView
            directly. The documented identity is retained without substituting
            another contract.
          </p>
          <a
            className="secondary"
            href={instrument.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the original chart ↗
          </a>
        </section>
      ) : instrument.vendorSymbol ? (
        <TradingViewWidget
          kind="chart"
          symbol={instrument.vendorSymbol}
          title={instrument.label + " · " + instrument.vendorSymbol}
        />
      ) : (
        <section className="panel">
          <span className="badge">MAPPING UNVERIFIED</span>
          <h2>This instrument needs an exact identity.</h2>
          <p>
            Its original venue, contract, or public-widget support is not
            verified. No different contract or exchange has been substituted.
          </p>
          <a
            href={instrument.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View official market coverage ↗
          </a>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h2>GVV numeric data</h2>
          <span className="badge">ENTITLEMENT GATED</span>
        </div>
        <p>
          Numeric prices, volume, and session metrics appear inside the
          workspace only when an entitled market-data provider is active for
          this venue. Embedded display widgets are never scraped into GVV
          calculations.
        </p>
        <details>
          <summary>Source and contract details</summary>
          <dl className="data-list">
            {Object.entries(instrument).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
                <dd>
                  {value === null
                    ? "Not verified / unavailable"
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <a
          href={instrument.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Identity / coverage evidence ↗
        </a>
      </section>
    </main>
  );
}
