import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./database/schemas/schema.ts",
  dialect: "sqlite",
});
