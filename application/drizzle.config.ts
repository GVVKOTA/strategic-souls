import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "../database/migrations",
  schema: "./database/schemas/schema.ts",
  dialect: "sqlite",
});
