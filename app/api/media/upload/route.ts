/**
 * Strategic Souls X5.1 — Secure Media Upload Validator (R2-Ready, Zero Unsafe D1 Image Storage).
 * - Enforces authentication, CSRF same-origin check, max 2 MB cap, and strict magic-byte inspection.
 * - Rejects forged MIME types, SVG/XML, HTML, and script payloads with HTTP 400.
 * - Uses configured Cloudflare R2 bucket (`MEDIA_BUCKET`) when bound; otherwise fails closed
 *   honestly with HTTP 503 `OBJECT_STORAGE_NOT_CONFIGURED` so users use built-in curated presets.
 */
import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError } from "../../../../backend/middleware/security";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export function detectSafeImageMagicBytes(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length < 12) return null;
  // Reject any text/SVG/HTML/script prefix immediately
  const headText = new TextDecoder("ascii", { fatal: false })
    .decode(bytes.slice(0, Math.min(256, bytes.length)))
    .trimStart()
    .toLowerCase();
  if (
    headText.startsWith("<svg") ||
    headText.startsWith("<?xml") ||
    headText.startsWith("<!doctype") ||
    headText.startsWith("<html") ||
    headText.includes("<script")
  ) {
    return null;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to upload custom images.");
    }
    const origin = request.headers.get("origin");
    const expected = new URL(request.url).origin;
    if (!origin || origin !== expected) {
      throw new HttpError(403, "Cross-origin image upload rejected.");
    }

    await rate(user.userId + ":x51-media-upload", 15, 60_000);

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES + 65_536) {
      throw new HttpError(413, "Image exceeds the 2 MB upload limit.");
    }

    const ct = request.headers.get("content-type") ?? "";
    let bytes: Uint8Array;
    let declaredMime = "";

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new HttpError(400, "Attach an image file (PNG, JPEG, or WebP).");
      }
      declaredMime = (file.type || "").toLowerCase();
      if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
        throw new HttpError(400, "Image must be non-empty and at most 2 MB.");
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      throw new HttpError(400, "Use multipart/form-data with a PNG, JPEG, or WebP file.");
    }

    if (declaredMime.includes("svg") || declaredMime.includes("html")) {
      throw new HttpError(
        400,
        "SVG and HTML uploads are rejected for security. Use PNG, JPEG, or WebP.",
      );
    }

    const detected = detectSafeImageMagicBytes(bytes);
    if (!detected) {
      throw new HttpError(
        400,
        "File failed magic-byte image validation (forged MIME or unsupported format). Only authentic PNG, JPEG, and WebP files are accepted.",
      );
    }
    if (declaredMime && declaredMime !== detected) {
      throw new HttpError(
        400,
        `Declared MIME (${declaredMime}) does not match file signature (${detected}).`,
      );
    }

    const runtimeEnv = env as unknown as Record<string, unknown>;
    const bucket = runtimeEnv.MEDIA_BUCKET as
      | { put?: (key: string, value: Uint8Array, opts?: unknown) => Promise<unknown> }
      | undefined;

    if (!bucket || typeof bucket.put !== "function") {
      return json(
        {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          error:
            "Custom image upload storage (Cloudflare R2) is not enabled on this deployment. Your image passed security validation — use the 50 built-in avatars and 8 curated Obsidian banners today, or enable Cloudflare R2 (`MEDIA_BUCKET`) in the Cloudflare Dashboard.",
          missingCapability: "R2_OBJECT_STORAGE",
          validatedMime: detected,
          validatedBytes: bytes.length,
        },
        503,
      );
    }

    const ext = detected === "image/png" ? "png" : detected === "image/webp" ? "webp" : "jpg";
    const objectKey = `users/${user.userId}/${crypto.randomUUID()}.${ext}`;
    await bucket.put(objectKey, bytes, {
      httpMetadata: { contentType: detected },
    });

    return json({ ok: true, key: objectKey, contentType: detected, bytes: bytes.length });
  } catch (err) {
    return json(
      {
        code: err instanceof HttpError ? "UPLOAD_REJECTED" : "UPLOAD_FAILED",
        error:
          err instanceof HttpError
            ? err.message
            : "Image upload failed safely.",
      },
      err instanceof HttpError ? err.status : 503,
    );
  }
}
