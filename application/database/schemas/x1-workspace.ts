import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./schema";

export const x1Records = sqliteTable(
  "x1_records",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
    version: integer("version").notNull().default(1),
    archived: integer("archived").notNull().default(0),
    lastWrite: text("last_write").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("x1_records_owner").on(t.subject, t.kind, t.archived)],
);
export const x1Ledger = sqliteTable(
  "x1_ledger",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => x1Records.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("x1_ledger_retry").on(t.subject, t.requestKey),
    index("x1_ledger_portfolio").on(t.portfolioId, t.createdAt, t.id),
  ],
);
export const x1Scans = sqliteTable(
  "x1_scans",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    mode: text("mode").notNull(),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("x1_scan_retry").on(t.subject, t.requestKey),
    index("x1_scans_owner").on(t.subject, t.createdAt, t.id),
  ],
);
export const x1ScanEvents = sqliteTable(
  "x1_scan_events",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    scanId: text("scan_id")
      .notNull()
      .references(() => x1Scans.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("x1_scan_events_owner").on(t.subject, t.scanId, t.createdAt, t.id),
  ],
);
