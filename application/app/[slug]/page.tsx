import Link from "next/link";
import { notFound } from "next/navigation";
import { documents } from "../../backend/services/legacy/content";
import AuthPanel from "../../frontend/features/auth/auth-panel";

const pages: Record<string, string> = {
  product: "about",
  "how-it-works": "methodology",
  methodology: "data-sources",
  pricing: "subscriptions",
  trust: "privacy",
  terms: "terms",
  help: "contact",
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "signin") {
    return { title: "Sign In · Strategic Souls" };
  }
  const key = pages[slug];
  const doc = key ? documents[key] : undefined;
  return {
    title: doc ? `${doc.title} · Strategic Souls` : "Strategic Souls",
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { slug } = await params;
  if (slug === "signin") {
    const query = await searchParams;
    const returnTo =
      typeof query.return_to === "string" ? query.return_to : "/";
    return (
      <main className="legal-page x2-signin-page">
        <Link className="legal-brand" href="/">
          ← Strategic Souls
        </Link>
        <div className="eyebrow">STRATEGIC SOULS · PRIVATE RESEARCH WORKSPACE</div>
        <h1>Sign in to your research workspace.</h1>
        <p className="legal-intro">
          Sign in or create an account to save watchlists, manual portfolios,
          Soul Scans, chart layouts, and private Community research in
          Cloudflare D1.
        </p>
        <AuthPanel returnTo={returnTo} />
        <p className="legal-note">
          Global Vertex Vectors · Research and education only. Sessions use
          HttpOnly cookies stored as SHA-256 hashes on Cloudflare Workers.
        </p>
      </main>
    );
  }

  const key = pages[slug];
  if (!key) notFound();
  const d = documents[key];
  return (
    <main className="legal-page">
      <Link className="legal-brand" href="/">
        ◌ STRATEGIC SOULS <span>BY GVV</span>
      </Link>
      <div className="eyebrow">STRATEGIC SOULS · RESEARCH</div>
      <h1>{d.title}</h1>
      <p className="legal-intro">{d.intro}</p>
      {d.sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      <nav className="legal-links" aria-label="Information pages">
        {Object.keys(pages).map((p) => {
          const label = p
            .split("-")
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
            .join(" ");
          return (
            <Link
              key={p}
              href={"/" + p}
              aria-current={p === slug ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
        <Link href="/legal/compliance">Compliance</Link>
      </nav>
      <Link className="primary" href="/workspace">
        Open private workspace ↗
      </Link>
      <p className="legal-note">
        Draft policies await qualified review. No broker execution or payment
        activation.
      </p>
    </main>
  );
}
