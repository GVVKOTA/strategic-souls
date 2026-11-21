import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export * from "./x1-community";
export * from "./x1-workspace";
export const accounts = sqliteTable("accounts", {
  subject: text("subject").primaryKey(),
  alias: text("alias").notNull(),
  consentAt: text("consent_at").notNull(),
  consentVersion: text("consent_version").notNull(),
  adultConfirmed: integer("adult_confirmed").notNull(),
  lastActive: text("last_active").notNull(),
});
// Analytical records never contain account identifiers or personal free text.
export const souls = sqliteTable("souls", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  snapshotAt: text("snapshot_at").notNull(),
  instrument: text("instrument").notNull(),
  modelVersion: text("model_version").notNull(),
  payload: text("payload").notNull(),
  digest: text("digest").notNull(),
});
export const ownership = sqliteTable(
  "ownership",
  {
    subject: text("subject").notNull(),
    soulId: text("soul_id").notNull(),
    semanticKey: text("semantic_key"),
  },
  (t) => [
    primaryKey({ columns: [t.subject, t.soulId] }),
    uniqueIndex("owner_semantic_unique").on(t.subject, t.semanticKey),
  ],
);
export const outcomes = sqliteTable("outcomes", {
  id: text("id").primaryKey(),
  soulId: text("soul_id").notNull().unique(),
  recordedAt: text("recorded_at").notNull(),
  availableAt: text("available_at").notNull(),
  payload: text("payload").notNull(),
  digest: text("digest").notNull(),
});
export const requests = sqliteTable("support_requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});
export const limits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
// Additive owner-scoped private foundation. Existing six tables remain intact.
export const workspaceRecords = sqliteTable(
  "workspace_records",
  {
    id: text("id").primaryKey(),
    subject: text("subject").notNull(),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull(),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    uniqueIndex("workspace_owner_dedupe").on(t.subject, t.kind, t.dedupeKey),
  ],
);

export const notebookSouls = sqliteTable(
  "notebook_souls",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    uniqueIndex("notebook_owner_dedupe").on(t.subject, t.dedupeKey),
    index("notebook_owner_created").on(t.subject, t.createdAt, t.id),
  ],
);
export const notebookEvents = sqliteTable(
  "notebook_events",
  {
    id: text("id").primaryKey(),
    soulId: text("soul_id")
      .notNull()
      .references(() => notebookSouls.id, { onDelete: "cascade" }),
    recordedAt: text("recorded_at").notNull(),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    uniqueIndex("notebook_event_dedupe").on(t.soulId, t.dedupeKey),
    index("notebook_event_created").on(t.soulId, t.recordedAt, t.id),
  ],
);

export * from "./auth";
export * from "./x2-social";
export * from "./x2-data";
export * from "./x51-research-network";
