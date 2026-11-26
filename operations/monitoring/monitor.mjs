import { DEFAULT_THRESHOLDS, validateProductionUrl } from "./config.mjs";

export function formatTimestampUtcAndIst(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const utc = date.toISOString();
  const ist =
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date) + " IST";
  return { utc, ist };
}

function classifyTransportError(error) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("abort")) {
    return { category: "TIMEOUT", summary: "Request timed out before response completed." };
  }
  if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return { category: "TLS_ERROR", summary: "TLS/certificate handshake failed." };
  }
  return { category: "DNS_OR_NETWORK", summary: "Network or DNS connection error." };
}

async function readBoundedText(response, maxBodyBytes) {
  const contentLengthHeader = response.headers?.get("content-length");
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      await response.body?.cancel?.().catch(() => {});
      return { ok: false, errorCategory: "RESPONSE_TOO_LARGE", text: "" };
    }
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
      return { ok: false, errorCategory: "RESPONSE_TOO_LARGE", text: "" };
    }
    return { ok: true, text };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, errorCategory: "RESPONSE_TOO_LARGE", text: "" };
    }
    chunks.push(value);
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeEndpoint({
  url,
  fetchImpl,
  config,
  shouldRetryStatus = (status) => status >= 500 || status === 429,
  delayFn = sleep,
}) {
  const maxAttempts = 1 + (config.retries ?? 2);
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = performance.now();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: {
          "User-Agent": "StrategicSouls-Monitor/1.0",
          Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      const durationMs = Math.round(performance.now() - started);
      if (shouldRetryStatus(response.status) && attempt < maxAttempts) {
        await response.body?.cancel?.().catch(() => {});
        const backoff = config.retryBackoffMs?.[attempt - 1] ?? 1000;
        await delayFn(backoff);
        lastResult = {
          ok: false,
          status: response.status,
          durationMs,
          headers: response.headers,
          text: "",
          category: response.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
          summary: `Unexpected HTTP ${response.status} after ${attempt} attempt(s).`,
          attempts: attempt,
        };
        continue;
      }
      const bounded = await readBoundedText(response, config.maxBodyBytes);
      if (!bounded.ok) {
        return {
          ok: false,
          status: response.status,
          durationMs,
          headers: response.headers,
          text: "",
          category: bounded.errorCategory,
          summary: `Response exceeded ${config.maxBodyBytes} byte safety cap.`,
          attempts: attempt,
        };
      }
      return {
        ok: true,
        status: response.status,
        durationMs,
        headers: response.headers,
        text: bounded.text,
        category: "OK",
        summary: "OK",
        attempts: attempt,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - started);
      const classified = classifyTransportError(err);
      lastResult = {
        ok: false,
        status: null,
        durationMs,
        headers: null,
        text: "",
        category: classified.category,
        summary: classified.summary,
        attempts: attempt,
      };
      if (attempt < maxAttempts) {
        const backoff = config.retryBackoffMs?.[attempt - 1] ?? 1000;
        await delayFn(backoff);
        continue;
      }
    }
  }
  return lastResult;
}

function makeCheckResult(base) {
  return {
    id: base.id,
    label: base.label,
    path: base.path,
    impactedFeature: base.impactedFeature,
    severity: base.severity,
    ok: base.ok,
    category: base.category,
    httpStatus: base.httpStatus ?? null,
    durationMs: base.durationMs ?? null,
    attempts: base.attempts ?? 1,
    expected: base.expected,
    observed: base.observed,
    troubleshooting: base.troubleshooting,
  };
}

function extractSafeHomepageAssets(html) {
  const matches = [...html.matchAll(/(?:href|src)="(\/(?:_next\/static\/[^"\s]+\.(?:js|css)|gvv-approved\.jpg))"/gi)].map(
    (m) => m[1],
  );
  const unique = [...new Set(matches)];
  const logo = unique.includes("/gvv-approved.jpg") ? ["/gvv-approved.jpg"] : [];
  const staticCss = unique.filter((p) => p.startsWith("/_next/static/") && p.endsWith(".css")).slice(0, 1);
  const staticJs = unique.filter((p) => p.startsWith("/_next/static/") && p.endsWith(".js")).slice(0, 1);
  return [...new Set([...logo, ...staticCss, ...staticJs])];
}

function checkLatencyOutcome(check, config, warnings) {
  if (!check.ok || typeof check.durationMs !== "number") return check;
  if (check.durationMs > config.failLatencyMs) {
    return {
      ...check,
      ok: false,
      severity: "medium",
      category: "HIGH_LATENCY",
      observed: `Latency ${check.durationMs}ms exceeded fail threshold (${config.failLatencyMs}ms).`,
    };
  }
  if (check.durationMs > config.warnLatencyMs) {
    warnings.push({
      checkId: check.id,
      durationMs: check.durationMs,
      thresholdMs: config.warnLatencyMs,
      message: `${check.label} latency ${check.durationMs}ms exceeded warning threshold (${config.warnLatencyMs}ms).`,
    });
  }
  return check;
}

/**
 * Runs all read-only production probes against the validated HTTPS origin.
 * Returns sanitized diagnostic results only — never response bodies, headers, cookies, or tokens.
 */
export async function runProductionMonitor({
  targetUrl,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  config = DEFAULT_THRESHOLDS,
  delayFn = sleep,
}) {
  const urlValidation = validateProductionUrl(targetUrl);
  const stamps = formatTimestampUtcAndIst(now);
  if (!urlValidation.ok) {
    throw new Error(urlValidation.error);
  }
  const origin = urlValidation.origin;
  const warnings = [];
  const checks = [];
  let releaseMetadata = null;

  // 1. Homepage HTML + static asset delivery
  {
    const probe = await probeEndpoint({ url: `${origin}/`, fetchImpl, config, delayFn });
    let result;
    if (!probe.ok) {
      result = makeCheckResult({
        id: "homepage-html",
        label: "Homepage HTML & Static Assets",
        path: "/",
        impactedFeature: "Public Landing / Workspace Shell",
        severity: "critical",
        ok: false,
        category: probe.category,
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 HTML containing Strategic Souls shell, CSP/HSTS headers, and static assets",
        observed: probe.summary,
        troubleshooting: "Check Cloudflare Workers deployment status, route bindings, and latest build logs.",
      });
    } else if (probe.status !== 200) {
      result = makeCheckResult({
        id: "homepage-html",
        label: "Homepage HTML & Static Assets",
        path: "/",
        impactedFeature: "Public Landing / Workspace Shell",
        severity: "critical",
        ok: false,
        category: probe.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 text/html",
        observed: `HTTP ${probe.status}`,
        troubleshooting: "Inspect Cloudflare Worker logs and recent version promotions.",
      });
    } else {
      const contentType = probe.headers?.get("content-type") ?? "";
      const csp = probe.headers?.get("content-security-policy") ?? "";
      const hsts = probe.headers?.get("strict-transport-security") ?? "";
      const hasContent =
        /text\/html/i.test(contentType) &&
        probe.text.includes("Strategic Souls") &&
        probe.text.includes("/_next/static/");
      if (!hasContent || !csp || !hsts) {
        result = makeCheckResult({
          id: "homepage-html",
          label: "Homepage HTML & Static Assets",
          path: "/",
          impactedFeature: "Public Landing / Workspace Shell",
          severity: "critical",
          ok: false,
          category: "INVALID_CONTRACT",
          httpStatus: probe.status,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "text/html with Strategic Souls marker, /_next/static/ assets, CSP, and HSTS",
          observed: `contentType=${Boolean(/text\/html/i.test(contentType))}, marker=${probe.text.includes("Strategic Souls")}, staticRefs=${probe.text.includes("/_next/static/")}, csp=${Boolean(csp)}, hsts=${Boolean(hsts)}`,
          troubleshooting: "Verify middleware security headers and Vinext SSR output.",
        });
      } else {
        const assetPaths = extractSafeHomepageAssets(probe.text);
        let assetFailure = null;
        for (const assetPath of assetPaths) {
          const assetProbe = await probeEndpoint({ url: `${origin}${assetPath}`, fetchImpl, config, delayFn });
          const assetType = assetProbe.headers?.get("content-type") ?? "";
          const expectedType = assetPath.endsWith(".js")
            ? /javascript/i
            : assetPath.endsWith(".css")
              ? /text\/css/i
              : /image\//i;
          if (!assetProbe.ok || assetProbe.status !== 200 || !expectedType.test(assetType)) {
            assetFailure = `${assetPath} returned status=${assetProbe.status ?? assetProbe.category}`;
            break;
          }
        }
        result = assetFailure
          ? makeCheckResult({
              id: "homepage-html",
              label: "Homepage HTML & Static Assets",
              path: "/",
              impactedFeature: "Public Static Asset Delivery",
              severity: "high",
              ok: false,
              category: "ASSET_DELIVERY_FAILURE",
              httpStatus: probe.status,
              durationMs: probe.durationMs,
              attempts: probe.attempts,
              expected: "All sampled homepage static assets return HTTP 200 with expected Content-Type",
              observed: assetFailure,
              troubleshooting: "Verify Workers assets binding in dist/server/wrangler.json.",
            })
          : makeCheckResult({
              id: "homepage-html",
              label: "Homepage HTML & Static Assets",
              path: "/",
              impactedFeature: "Public Landing / Workspace Shell",
              severity: "critical",
              ok: true,
              category: "OK",
              httpStatus: probe.status,
              durationMs: probe.durationMs,
              attempts: probe.attempts,
              expected: "HTTP 200 HTML + CSP/HSTS + static assets",
              observed: `HTTP 200 (${assetPaths.length} sampled assets verified)`,
              troubleshooting: "None required.",
            });
      }
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  // 2. Release & Build Identity
  {
    const probe = await probeEndpoint({ url: `${origin}/api/release`, fetchImpl, config, delayFn });
    let result;
    if (!probe.ok || probe.status !== 200) {
      result = makeCheckResult({
        id: "release-identity",
        label: "Release & Provenance Endpoint",
        path: "/api/release",
        impactedFeature: "Deployment Provenance & Metadata",
        severity: "high",
        ok: false,
        category: !probe.ok ? probe.category : probe.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 JSON with IDENTIFIED provenance and buildCommit",
        observed: !probe.ok ? probe.summary : `HTTP ${probe.status}`,
        troubleshooting: "Check /api/release route handler and CF_VERSION_METADATA binding.",
      });
    } else {
      let json = null;
      try {
        json = JSON.parse(probe.text);
      } catch {
        json = null;
      }
      const cc = probe.headers?.get("cache-control") ?? "";
      const valid =
        json &&
        json.product === "Strategic Souls" &&
        json.provenance === "IDENTIFIED" &&
        typeof json.buildCommit === "string" &&
        /^[0-9a-f]{40}$/i.test(json.buildCommit) &&
        typeof json.workerVersionId === "string" &&
        json.workerVersionId.length > 0 &&
        /no-store/i.test(cc);
      if (json) {
        releaseMetadata = {
          release: typeof json.release === "string" ? json.release : null,
          releaseName: typeof json.releaseName === "string" ? json.releaseName : null,
          revisionMarker: typeof json.revisionMarker === "string" ? json.revisionMarker : null,
          buildCommit: typeof json.buildCommit === "string" ? json.buildCommit : null,
          workerVersionId: typeof json.workerVersionId === "string" ? json.workerVersionId : null,
        };
      }
      result = valid
        ? makeCheckResult({
            id: "release-identity",
            label: "Release & Provenance Endpoint",
            path: "/api/release",
            impactedFeature: "Deployment Provenance & Metadata",
            severity: "high",
            ok: true,
            category: "OK",
            httpStatus: 200,
            durationMs: probe.durationMs,
            attempts: probe.attempts,
            expected: "HTTP 200 non-cacheable JSON with IDENTIFIED buildCommit & workerVersionId",
            observed: `IDENTIFIED (${json.buildCommit.slice(0, 7)})`,
            troubleshooting: "None required.",
          })
        : makeCheckResult({
            id: "release-identity",
            label: "Release & Provenance Endpoint",
            path: "/api/release",
            impactedFeature: "Deployment Provenance & Metadata",
            severity: "high",
            ok: false,
            category: "INVALID_CONTRACT",
            httpStatus: 200,
            durationMs: probe.durationMs,
            attempts: probe.attempts,
            expected: "HTTP 200 non-cacheable JSON with IDENTIFIED buildCommit & workerVersionId",
            observed: `provenance=${json?.provenance ?? "invalid_json"}, cacheControlNoStore=${/no-store/i.test(cc)}`,
            troubleshooting: "Ensure production build ran on a clean Git checkout and CF_VERSION_METADATA is bound.",
          });
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  // 3. Health & D1 Readiness Endpoint
  {
    const probe = await probeEndpoint({ url: `${origin}/api/health`, fetchImpl, config, delayFn });
    let result;
    if (!probe.ok || probe.status !== 200) {
      result = makeCheckResult({
        id: "health-readiness",
        label: "Worker & D1 Readiness Health",
        path: "/api/health",
        impactedFeature: "Worker Runtime & Cloudflare D1 Connectivity",
        severity: "critical",
        ok: false,
        category: !probe.ok ? probe.category : probe.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 JSON with status=ok and D1 check ok=true",
        observed: !probe.ok ? probe.summary : `HTTP ${probe.status}`,
        troubleshooting: "Check Cloudflare D1 binding 'DB' (ss) health and Worker error logs.",
      });
    } else {
      let json = null;
      try {
        json = JSON.parse(probe.text);
      } catch {
        json = null;
      }
      const cc = probe.headers?.get("cache-control") ?? "";
      const valid =
        json &&
        json.status === "ok" &&
        json.checks?.worker?.ok === true &&
        json.checks?.database?.ok === true &&
        /no-store/i.test(cc);
      result = valid
        ? makeCheckResult({
            id: "health-readiness",
            label: "Worker & D1 Readiness Health",
            path: "/api/health",
            impactedFeature: "Worker Runtime & Cloudflare D1 Connectivity",
            severity: "critical",
            ok: true,
            category: "OK",
            httpStatus: 200,
            durationMs: probe.durationMs,
            attempts: probe.attempts,
            expected: "HTTP 200 JSON with status=ok and D1 check ok=true",
            observed: `ok (dbLatencyMs=${json.checks.database.latencyMs ?? "n/a"})`,
            troubleshooting: "None required.",
          })
        : makeCheckResult({
            id: "health-readiness",
            label: "Worker & D1 Readiness Health",
            path: "/api/health",
            impactedFeature: "Worker Runtime & Cloudflare D1 Connectivity",
            severity: "critical",
            ok: false,
            category: "INVALID_CONTRACT",
            httpStatus: 200,
            durationMs: probe.durationMs,
            attempts: probe.attempts,
            expected: "HTTP 200 JSON with status=ok and D1 check ok=true",
            observed: `status=${json?.status ?? "invalid_json"}, dbOk=${json?.checks?.database?.ok ?? false}`,
            troubleshooting: "Inspect Cloudflare D1 database 'ss' connectivity and Worker bindings.",
          });
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  // 4. Official Public Market References
  {
    const probe = await probeEndpoint({ url: `${origin}/api/markets/public`, fetchImpl, config, delayFn });
    let result;
    if (!probe.ok || probe.status !== 200) {
      result = makeCheckResult({
        id: "public-market-references",
        label: "Official Public Market References",
        path: "/api/markets/public",
        impactedFeature: "ECB FX & US Treasury Reference Feeds",
        severity: "medium",
        ok: false,
        category: !probe.ok ? probe.category : probe.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 JSON with valid asOf timestamp and providers list",
        observed: !probe.ok ? probe.summary : `HTTP ${probe.status}`,
        troubleshooting: "Check upstream ECB/US Treasury feed fetch or D1 official_reference_cache.",
      });
    } else {
      let json = null;
      try {
        json = JSON.parse(probe.text);
      } catch {
        json = null;
      }
      const asOfMs = json?.asOf ? Date.parse(json.asOf) : NaN;
      const providersValid = Array.isArray(json?.providers) && json.providers.length > 0;
      const maxAgeMs = config.referenceMaxAgeDays * 86_400_000;
      const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
      const stale = Number.isFinite(asOfMs) && nowMs - asOfMs > maxAgeMs;
      if (!json || !Number.isFinite(asOfMs) || !providersValid) {
        result = makeCheckResult({
          id: "public-market-references",
          label: "Official Public Market References",
          path: "/api/markets/public",
          impactedFeature: "ECB FX & US Treasury Reference Feeds",
          severity: "medium",
          ok: false,
          category: "INVALID_CONTRACT",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "HTTP 200 JSON with valid asOf and non-empty providers array",
          observed: "Malformed or incomplete public market reference payload",
          troubleshooting: "Inspect official-references.ts and D1 table 0020_official_reference_cache.",
        });
      } else if (stale) {
        result = makeCheckResult({
          id: "public-market-references",
          label: "Official Public Market References",
          path: "/api/markets/public",
          impactedFeature: "ECB FX & US Treasury Reference Feeds",
          severity: "medium",
          ok: false,
          category: "STALE_OFFICIAL_DATA",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: `asOf within ${config.referenceMaxAgeDays} days`,
          observed: `asOf=${json.asOf} exceeded ${config.referenceMaxAgeDays} day threshold`,
          troubleshooting: "Check ECB/Treasury official feed availability and scheduled cache refresh.",
        });
      } else {
        result = makeCheckResult({
          id: "public-market-references",
          label: "Official Public Market References",
          path: "/api/markets/public",
          impactedFeature: "ECB FX & US Treasury Reference Feeds",
          severity: "medium",
          ok: true,
          category: "OK",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "HTTP 200 JSON with valid official reference metadata",
          observed: `HTTP 200 (${json.providers.length} providers)`,
          troubleshooting: "None required.",
        });
      }
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  // 5. Public Market Overview & Rights Gate
  {
    const probe = await probeEndpoint({
      url: `${origin}/api/markets/overview?source=public-cache`,
      fetchImpl,
      config,
      delayFn,
    });
    let result;
    if (!probe.ok || probe.status !== 200) {
      result = makeCheckResult({
        id: "public-market-overview",
        label: "Public Market Overview & Rights Gate",
        path: "/api/markets/overview?source=public-cache",
        impactedFeature: "Global Dashboard Cards & Redistribution Rights Gate",
        severity: "high",
        ok: false,
        category: !probe.ok ? probe.category : probe.status >= 500 ? "HTTP_5XX" : "HTTP_4XX",
        httpStatus: probe.status,
        durationMs: probe.durationMs,
        attempts: probe.attempts,
        expected: "HTTP 200 JSON with 8 distinct cards and zero non-redistributable guest prices",
        observed: !probe.ok ? probe.summary : `HTTP ${probe.status}`,
        troubleshooting: "Check nine-card-markets.ts and D1 official reference cache.",
      });
    } else {
      let json = null;
      try {
        json = JSON.parse(probe.text);
      } catch {
        json = null;
      }
      const cards = Array.isArray(json?.cards) ? json.cards : null;
      const eightDistinct = cards && cards.length === 8 && new Set(cards.map((c) => c.canonicalId)).size === 8;
      const rightsSafe = cards && cards.every((c) => c.value === null || c.redistributable === true);
      if (!eightDistinct) {
        result = makeCheckResult({
          id: "public-market-overview",
          label: "Public Market Overview & Rights Gate",
          path: "/api/markets/overview?source=public-cache",
          impactedFeature: "Global Dashboard Cards & Redistribution Rights Gate",
          severity: "high",
          ok: false,
          category: "INVALID_CONTRACT",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "8 distinct market cards",
          observed: `cardsCount=${cards ? cards.length : "invalid_json"}`,
          troubleshooting: "Inspect /api/markets/overview route and nine-card-markets.ts.",
        });
      } else if (!rightsSafe) {
        result = makeCheckResult({
          id: "public-market-overview",
          label: "Public Market Overview & Rights Gate",
          path: "/api/markets/overview?source=public-cache",
          impactedFeature: "Market-Data Redistribution Rights Gate",
          severity: "critical",
          ok: false,
          category: "SECURITY_INVARIANT_VIOLATION",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "Every guest card price is either null or marked redistributable=true",
          observed: "Guest overview exposed non-redistributable numeric price",
          troubleshooting: "IMMEDIATE: verify guest rights gating in nine-card-markets.ts and rollback if needed.",
        });
      } else {
        result = makeCheckResult({
          id: "public-market-overview",
          label: "Public Market Overview & Rights Gate",
          path: "/api/markets/overview?source=public-cache",
          impactedFeature: "Global Dashboard Cards & Redistribution Rights Gate",
          severity: "high",
          ok: true,
          category: "OK",
          httpStatus: 200,
          durationMs: probe.durationMs,
          attempts: probe.attempts,
          expected: "8 distinct cards with fail-closed redistribution gating",
          observed: `8 cards (${cards.filter((c) => c.value !== null).length} public, ${cards.filter((c) => c.value === null).length} entitlement-gated)`,
          troubleshooting: "None required.",
        });
      }
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  // 6. Auth Session & Private Fail-Closed Isolation
  {
    const [sessionProbe, workspaceProbe, providersProbe] = await Promise.all([
      probeEndpoint({ url: `${origin}/api/auth/session`, fetchImpl, config, delayFn }),
      probeEndpoint({
        url: `${origin}/api/x1/workspace`,
        fetchImpl,
        config,
        shouldRetryStatus: (s) => s >= 500,
        delayFn,
      }),
      probeEndpoint({
        url: `${origin}/api/x2/providers`,
        fetchImpl,
        config,
        shouldRetryStatus: (s) => s >= 500,
        delayFn,
      }),
    ]);

    const maxDurationMs = Math.max(
      sessionProbe.durationMs ?? 0,
      workspaceProbe.durationMs ?? 0,
      providersProbe.durationMs ?? 0,
    );
    const totalAttempts = Math.max(sessionProbe.attempts, workspaceProbe.attempts, providersProbe.attempts);
    let result;
    let sessionJson = null;
    try {
      sessionJson = sessionProbe.ok ? JSON.parse(sessionProbe.text) : null;
    } catch {
      sessionJson = null;
    }

    const sessionValid =
      sessionProbe.ok &&
      sessionProbe.status === 200 &&
      sessionJson &&
      sessionJson.authenticated === false &&
      sessionJson.isOwner === false;

    const failOpen = workspaceProbe.status === 200 || providersProbe.status === 200;
    const privServerErr = (workspaceProbe.status ?? 0) >= 500 || (providersProbe.status ?? 0) >= 500;
    const privTransportErr = !workspaceProbe.ok || !providersProbe.ok;
    const privClosed =
      (workspaceProbe.status === 401 || workspaceProbe.status === 403) &&
      (providersProbe.status === 401 || providersProbe.status === 403);

    if (failOpen) {
      result = makeCheckResult({
        id: "auth-session-and-isolation",
        label: "Auth Session & Fail-Closed Isolation",
        path: "/api/auth/session, /api/x1/workspace, /api/x2/providers",
        impactedFeature: "Authentication & Private Owner Isolation",
        severity: "critical",
        ok: false,
        category: "SECURITY_INVARIANT_VIOLATION",
        httpStatus: 200,
        durationMs: maxDurationMs,
        attempts: totalAttempts,
        expected: "Guest session false and private endpoints return 401/403",
        observed: `Private endpoint fail-open! workspace=${workspaceProbe.status}, providers=${providersProbe.status}`,
        troubleshooting: "IMMEDIATE: inspect auth/session middleware and rollback production Worker.",
      });
    } else if (!sessionValid || privTransportErr || privServerErr || !privClosed) {
      const cat = !sessionProbe.ok
        ? sessionProbe.category
        : privTransportErr
          ? (!workspaceProbe.ok ? workspaceProbe.category : providersProbe.category)
          : privServerErr || (sessionProbe.status ?? 0) >= 500
            ? "HTTP_5XX"
            : "INVALID_CONTRACT";
      result = makeCheckResult({
        id: "auth-session-and-isolation",
        label: "Auth Session & Fail-Closed Isolation",
        path: "/api/auth/session, /api/x1/workspace, /api/x2/providers",
        impactedFeature: "Authentication & Private Owner Isolation",
        severity: "critical",
        ok: false,
        category: cat,
        httpStatus: sessionProbe.status ?? workspaceProbe.status ?? providersProbe.status,
        durationMs: maxDurationMs,
        attempts: totalAttempts,
        expected: "session=200 (authenticated=false), workspace=401/403, providers=401/403",
        observed: `session=${sessionProbe.status ?? sessionProbe.category}, workspace=${workspaceProbe.status ?? workspaceProbe.category}, providers=${providersProbe.status ?? providersProbe.category}`,
        troubleshooting: "Check auth session handler, D1 connectivity, and private route guards.",
      });
    } else {
      result = makeCheckResult({
        id: "auth-session-and-isolation",
        label: "Auth Session & Fail-Closed Isolation",
        path: "/api/auth/session, /api/x1/workspace, /api/x2/providers",
        impactedFeature: "Authentication & Private Owner Isolation",
        severity: "critical",
        ok: true,
        category: "OK",
        httpStatus: 200,
        durationMs: maxDurationMs,
        attempts: totalAttempts,
        expected: "session=200 (authenticated=false), workspace=401/403, providers=401/403",
        observed: `session=200, workspace=${workspaceProbe.status}, providers=${providersProbe.status}`,
        troubleshooting: "None required.",
      });
    }
    checks.push(checkLatencyOutcome(result, config, warnings));
  }

  const failedChecks = checks.filter((c) => !c.ok);
  return {
    ok: failedChecks.length === 0,
    targetOrigin: origin,
    checkedAtUtc: stamps.utc,
    checkedAtIst: stamps.ist,
    releaseMetadata,
    checks,
    warnings,
    summary: {
      total: checks.length,
      passed: checks.length - failedChecks.length,
      failed: failedChecks.length,
      warnings: warnings.length,
    },
  };
}
