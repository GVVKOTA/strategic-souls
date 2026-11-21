/**
 * Minimal Node ESM hook allowing Node --experimental-strip-types to resolve
 * extensionless relative TypeScript imports (`./foo` -> `./foo.ts`) shared with Vite/Vinext/Workers.
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let registered = false;

export function registerTsExtensionHook() {
  if (registered) return;
  registered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.[a-z0-9]+$/i.test(specifier) &&
        context.parentURL?.startsWith("file:")
      ) {
        const candidate = resolve(
          dirname(fileURLToPath(context.parentURL)),
          `${specifier}.ts`,
        );
        if (existsSync(candidate)) {
          return {
            shortCircuit: true,
            url: pathToFileURL(candidate).href,
          };
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

registerTsExtensionHook();
