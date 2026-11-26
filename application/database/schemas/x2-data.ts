import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./schema";
export const x2Providers = sqliteTable("x2_providers", {
  provider: text("provider").primaryKey(),
  version: integer("version").notNull(),
  payload: text("payload").notNull(),
  health: text("health").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastWrite: text("last_write").notNull(),
});
export const x2ProviderAudit = sqliteTable(
  "x2_provider_audit",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    requestKey: text("request_key").notNull(),
    createdAt: text("created_at").notNull(),
    action: text("action").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [
    uniqueIndex("x2_provider_audit_retry").on(t.subject, t.requestKey),
    index("x2_provider_audit_time").on(t.provider, t.createdAt),
  ],
);
export const x2ChartLayouts = sqliteTable(
  "x2_chart_layouts",
  {
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    instrumentId: text("instrument_id").notNull(),
    version: integer("version").notNull(),
    payload: text("payload").notNull(),
    lastWrite: text("last_write").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.instrumentId] })],
);
