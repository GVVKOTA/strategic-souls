/**
 * Zero-dependency RFC 6238 TOTP generator using Web Crypto HMAC-SHA1.
 * Works identically in Node.js 22+ and Cloudflare Workers without third-party dependencies.
 * Default workflow prefers manual 6-digit TOTP entry; seed generation is opt-in only.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (clean.length === 0) {
    throw new Error("Invalid Base32 TOTP secret.");
  }
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export async function generateTotpCode(
  base32Secret: string,
  nowMs = Date.now(),
  stepSeconds = 30,
  digits = 6,
): Promise<{ code: string; secondsRemaining: number }> {
  const keyBytes = decodeBase32(base32Secret);
  const epochSeconds = Math.floor(nowMs / 1000);
  const counter = Math.floor(epochSeconds / stepSeconds);
  const secondsRemaining = stepSeconds - (epochSeconds % stepSeconds);

  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, counterBytes as BufferSource),
  );
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);

  const mod = 10 ** digits;
  const code = String(binary % mod).padStart(digits, "0");
  return { code, secondsRemaining };
}

export function isValidSixDigitTotp(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}
