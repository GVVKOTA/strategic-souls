import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const helpersDir = dirname(fileURLToPath(import.meta.url));
export const appRoot = resolve(helpersDir, "../..");
export const repoRoot = resolve(appRoot, "..");
export const d1MigrationsDir = resolve(repoRoot, "database/migrations");
export const supabaseMigrationsDir = resolve(repoRoot, "database/supabase/migrations");
export const resolveApp = (...segments) => resolve(appRoot, ...segments);
export const resolveRepo = (...segments) => resolve(repoRoot, ...segments);
