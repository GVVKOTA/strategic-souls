import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Bind the `ss` D1 database to `DB` in Cloudflare Workers configuration before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
