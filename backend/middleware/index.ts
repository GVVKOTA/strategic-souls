import handler from "vinext/server/fetch-handler";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID().slice(0, 12);
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");

    let response: Response;
    try {
      response = await handler.fetch(request, env, ctx);
    } catch (err) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      console.error(
        JSON.stringify({
          event: "ss_worker_unhandled_error",
          requestId,
          method: request.method,
          path: url.pathname,
          durationMs,
          errorName: err instanceof Error ? err.name : "UnknownError",
        }),
      );
      throw err;
    }

    const durationMs = Math.max(0, Date.now() - startedAt);
    const secured = new Response(response.body, response);
    const correlationId = secured.headers.get("X-Scan-Trace-Id") ?? requestId;
    secured.headers.set("X-Request-Id", correlationId);
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
        "; frame-src https://s3.tradingview.com https://www.tradingview.com https://www.tradingview-widget.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    if (url.protocol === "https:") {
      secured.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    if (isApi) {
      secured.headers.set("Server-Timing", `app;dur=${durationMs}`);
      if (
        !url.pathname.startsWith("/api/markets/public") &&
        !url.pathname.startsWith("/api/community/public") &&
        !url.pathname.startsWith("/api/earth/conflicts")
      ) {
        secured.headers.set("Cache-Control", "private, no-store");
      }
    }

    // Low-noise, privacy-safe operational signal ONLY for 5xx, rate-limits, or slow API handlers.
    // Never logs query strings, Body IDs, cookies, message content, or secrets.
    if (
      secured.status >= 500 ||
      secured.status === 429 ||
      (isApi && durationMs > 1500)
    ) {
      console.warn(
        JSON.stringify({
          event: "ss_api_signal",
          requestId: correlationId,
          method: request.method,
          path: url.pathname,
          status: secured.status,
          durationMs,
        }),
      );
    }

    return secured;
  },
};

export default worker;
