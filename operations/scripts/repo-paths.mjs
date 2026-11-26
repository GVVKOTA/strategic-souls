import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "../..");
export const appRoot = resolve(repoRoot, "application");
export const databaseRoot = resolve(repoRoot, "database");
export const databaseMigrationsDir = resolve(databaseRoot, "migrations");
export const databaseSupabaseWorkdir = databaseRoot;
export const documentationRoot = resolve(repoRoot, "documentation");
export const operationsRoot = resolve(repoRoot, "operations");
