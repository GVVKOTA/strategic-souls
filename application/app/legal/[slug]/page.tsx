import Link from "next/link";
import { notFound } from "next/navigation";
import {
  documents,
  officialSources,
  releaseGates,
  LEGAL_VERSION,
} from "../../../backend/services/legacy/content";
import { V3_LEGAL } from "../../../backend/services/v3/legal";

export const dynamic = "force-dynamic";

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = V3_LEGAL[slug] ?? documents[slug];
  if (!doc && slug !== "compliance") notFound();

  return (
    <main className="legal-page">
      <Link className="legal-brand" href="/">
        ◌ STRATEGIC SOULS <span>↗ Return to workspace</span>
      </Link>
      <div className="eyebrow">TRUST CENTER · STRATEGIC SOULS X 3.0</div>
      <h1>{doc?.title ?? "Compliance & Release Gate Report"}</h1>
      <p className="legal-intro">
        {doc?.intro ??
          "This report records current Strategic Souls X 3.0 implementation evidence alongside open legal, licensing, and operational review gates. It does not certify regulatory approval."}
      </p>
      <p className="draft-label">{LEGAL_VERSION}</p>

      {doc ? (
        doc.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))
      ) : (
        <>
          {releaseGates.map((g) => (
            <section key={g.area}>
              <div className="section-title">
                <h2>{g.area}</h2>
                <span className="badge amber">{g.status}</span>
              </div>
              <p>{g.evidence}</p>
            </section>
          ))}
          <section>
            <h2>Incident response runbook</h2>
            <p>
              For a suspected security or data incident: stop or roll back the
              affected Worker release while preserving evidence without exposing
              credentials; scope affected systems and accounts; assess
              applicable CERT-In, DPDP, and other notification obligations with
              qualified counsel; notify affected parties through verified
              channels; restore only after full integrity checks; document root
              cause and preventive fixes. No staffed 24/7 incident rotation is
              claimed.
            </p>
          </section>
        </>
      )}

      <section>
        <h2>Official reference register</h2>
        <p>
          External regulatory and exchange policy references for legal review.
          Links provide context and do not imply regulatory approval or data
          licensing.
        </p>
        {officialSources.map((s) => (
          <a
            className="source-link"
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
          >
            {s.title} ↗
          </a>
        ))}
      </section>

      <nav className="legal-links" aria-label="Legal and support documents">
        {Object.entries(documents).map(([id, d]) => (
          <a key={id} href={"/legal/" + id}>
            {d.title}
          </a>
        ))}
        <Link href="/legal/compliance">Compliance report</Link>
        <Link href="/contact">Help &amp; Contact</Link>
      </nav>

      <p className="legal-note">
        Strategic Souls X 3.0 · Global Vertex Vectors · Educational research
        only (18+) · No SEBI registration or brokerage execution claimed ·
        Support: strategicsoulsgvv@gmail.com
      </p>
    </main>
  );
}
