/**
 * Concealed local secret setup helper for the private Angel One read-only adapter.
 * - Uses raw-mode no-echo stdin reading (verified on Windows PowerShell, macOS, Linux).
 * - Never echoes MPIN, API Key, Client ID, or optional TOTP seed to terminal or shell history.
 * - Writes atomically to gitignored `.secrets/angelone.env` with restrictive OS ACLs (icacls on Windows / 0600 on POSIX).
 * - Writes ONLY gateway flags + random 256-bit service auth token to `.dev.vars` (never Angel One MPIN/TOTP!).
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const secretsDir = resolve(root, ".secrets");
const secretsFile = resolve(secretsDir, "angelone.env");
const devVarsFile = resolve(root, ".dev.vars");

function readConcealed(promptText) {
  return new Promise((resolveInput, rejectInput) => {
    if (!process.stdin.isTTY) {
      rejectInput(
        new Error(
          "Interactive TTY required for concealed secret entry. Run this script directly in a local terminal.",
        ),
      );
      return;
    }
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const prevRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolveInput(value.trim());
        return;
      }
      if (ch === "\u0003") {
        cleanup();
        process.stdout.write("\nAborted.\n");
        process.exit(130);
      }
      if (ch === "\u0008" || ch === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      // Handle pasted multi-char chunks safely without echoing raw characters
      for (const char of ch) {
        if (char >= " " && char !== "\u007f") {
          value += char;
          process.stdout.write("*");
        }
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(Boolean(prevRaw));
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

function parseEnvMap(filePath) {
  if (!existsSync(filePath)) return {};
  const map = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return map;
}

function atomicWrite(targetPath, content) {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  renameSync(tmpPath, targetPath);
  if (process.platform === "win32") {
    const user = process.env.USERNAME;
    if (user) {
      try {
        execFileSync(
          "icacls",
          [targetPath, "/inheritance:r", "/grant:r", `${user}:F`, "SYSTEM:F"],
          { stdio: "ignore" },
        );
      } catch {
        console.warn("Warning: Could not apply Windows icacls ACLs automatically; restrict folder permissions manually.");
      }
    }
  } else {
    try {
      chmodSync(targetPath, 0o600);
    } catch {
      /* best effort */
    }
  }
}

async function main() {
  console.log("Strategic Souls — Private Local Angel One Secret Setup (Concealed Entry)");
  console.log("Input is masked. Credentials stay strictly in gitignored .secrets/angelone.env.\n");

  const existingSecrets = parseEnvMap(secretsFile);
  const existingDevVars = parseEnvMap(devVarsFile);

  const apiKey =
    (await readConcealed(
      `Angel One SmartAPI Key${existingSecrets.ANGELONE_API_KEY ? " [Enter to keep existing]" : ""}: `,
    )) || existingSecrets.ANGELONE_API_KEY;
  const clientId =
    (await readConcealed(
      `Angel One Trading Client ID (NOT Demat BO/DP ID)${existingSecrets.ANGELONE_CLIENT_ID ? " [Enter to keep existing]" : ""}: `,
    )) || existingSecrets.ANGELONE_CLIENT_ID;
  const mpin =
    (await readConcealed(
      `Angel One Trading MPIN${existingSecrets.ANGELONE_MPIN ? " [Enter to keep existing]" : ""}: `,
    )) || existingSecrets.ANGELONE_MPIN;
  const totpSecret = await readConcealed(
    "Optional Base32 TOTP seed (RECOMMENDED: leave blank for manual 6-digit TOTP at login): ",
  );

  if (!apiKey || !clientId || !mpin) {
    console.error("FAIL: API Key, Trading Client ID, and MPIN are required.");
    process.exit(1);
  }

  const serviceToken =
    existingSecrets.MARKET_ADAPTER_AUTH_TOKEN ||
    existingDevVars.MARKET_ADAPTER_AUTH_TOKEN ||
    randomBytes(32).toString("base64url");

  const secretsContent = [
    "# Gitignored local private Angel One SmartAPI credentials (Windows ACL / 0600 restricted).",
    "# Never commit, share in chat, or copy into Cloudflare Worker Secrets.",
    `ANGELONE_API_KEY=${apiKey}`,
    `ANGELONE_CLIENT_ID=${clientId}`,
    `ANGELONE_MPIN=${mpin}`,
    ...(totpSecret ? [`ANGELONE_TOTP_SECRET=${totpSecret.toUpperCase()}`] : []),
    `MARKET_ADAPTER_AUTH_TOKEN=${serviceToken}`,
    "MARKET_ADAPTER_PORT=8791",
    "",
  ].join("\n");

  atomicWrite(secretsFile, secretsContent);

  if (process.platform === "win32" && process.env.USERNAME) {
    try {
      execFileSync(
        "icacls",
        [secretsDir, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:(OI)(CI)F`, "SYSTEM:(OI)(CI)F"],
        { stdio: "ignore" },
      );
    } catch {
      /* best effort */
    }
  }

  const ownerSubject = existingDevVars.X2_OWNER_SUBJECT || "";
  const devVarsLines = [
    "# Gitignored local Cloudflare Worker gateway variables (NO Angel One MPIN/TOTP here!)",
    `X2_OWNER_SUBJECT=${ownerSubject}`,
    "MARKET_DATA_PROVIDER=angelone",
    "MARKET_DATA_MODE=private",
    "ENABLE_PRIVATE_BROKER_DATA=true",
    "ENABLE_PUBLIC_EXCHANGE_QUOTES=false",
    "MARKET_DATA_DEMO_MODE=false",
    "MARKET_DATA_ALLOW_LOOPBACK=true",
    "MARKET_DATA_ADAPTER_URL=http://127.0.0.1:8791",
    `MARKET_ADAPTER_AUTH_TOKEN=${serviceToken}`,
    "",
  ];
  atomicWrite(devVarsFile, devVarsLines.join("\n"));

  console.log("\nPASS: Private credentials written to gitignored .secrets/angelone.env.");
  console.log("PASS: Local Worker gateway token & flags written to gitignored .dev.vars.");
  console.log("Next: Run `npm run broker:adapter` in one terminal and `npm run dev` in another.");
}

main().catch((err) => {
  console.error("Setup aborted:", err.message);
  process.exit(1);
});
