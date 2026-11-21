import handler from "vinext/server/fetch-handler";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const response = await handler.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    const url = new URL(request.url);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    secured.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://s3.tradingview.com" +
        (import.meta.env.DEV ? " 'unsafe-eval'" : "") +
        "; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://gibs.earthdata.nasa.gov; font-src 'self'; connect-src 'self' https://gibs.earthdata.nasa.gov" +
        (import.meta.env.DEV ? " ws: wss:" : "") +
        "; frame-src https://s.tradingview.com https://www.tradingview.com https://www.tradingview-widget.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    if (url.protocol === "https:") {
      secured.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    if (
      url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/api/markets/public") &&
      !url.pathname.startsWith("/api/community/public") &&
      !url.pathname.startsWith("/api/earth/conflicts")
    ) {
      secured.headers.set("Cache-Control", "private, no-store");
    }
    return secured;
  },
};

export default worker;
