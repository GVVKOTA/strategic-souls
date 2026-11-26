import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./schema";
import { x1Bodies } from "./x1-community";

export const x51ScanReservations = sqliteTable(
  "x51_scan_reservations",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    istDay: text("ist_day").notNull(),
    state: text("state").notNull(),
    leaseExpiresAt: text("lease_expires_at").notNull(),
    completedAt: text("completed_at"),
    scanId: text("scan_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("x51_scan_res_idemp").on(t.subject, t.idempotencyKey),
    index("x51_scan_res_classic_day").on(t.subject, t.tier, t.istDay, t.state),
    index("x51_scan_res_adv_time").on(t.subject, t.tier, t.state, t.completedAt),
  ],
);

export const x51Follows = sqliteTable(
  "x51_follows",
  {
    followerSubject: text("follower_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    targetSubject: text("target_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerSubject, t.targetSubject] }),
    index("x51_follows_target").on(t.targetSubject, t.state),
  ],
);

export const x51WebSouls = sqliteTable(
  "x51_web_souls",
  {
    id: text("id").primaryKey(),
    authorSubject: text("author_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    authorHandle: text("author_handle").notNull(),
    scanId: text("scan_id").notNull(),
    soulVersion: integer("soul_version").notNull().default(1),
    mode: text("mode").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    formula: text("formula").notNull(),
    blueprintJson: text("blueprint_json").notNull(),
    timeframe: text("timeframe").notNull(),
    universeLabel: text("universe_label").notNull(),
    matchedSymbolsJson: text("matched_symbols_json").notNull(),
    evidenceStatus: text("evidence_status").notNull(),
    sourceAttribution: text("source_attribution").notNull(),
    riskNote: text("risk_note").notNull(),
    audience: text("audience").notNull(),
    groupId: text("group_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    pinned: integer("pinned").notNull().default(0),
    sourceDigest: text("source_digest").notNull(),
    copiedFromPostId: text("copied_from_post_id"),
    copiedFromHandle: text("copied_from_handle"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    uniqueIndex("x51_web_souls_idemp").on(t.authorSubject, t.idempotencyKey),
    index("x51_web_souls_feed").on(t.audience, t.deletedAt, t.createdAt),
    index("x51_web_souls_author").on(
      t.authorSubject,
      t.deletedAt,
      t.pinned,
      t.createdAt,
    ),
  ],
);

export const x51WebSoulSaves = sqliteTable(
  "x51_web_soul_saves",
  {
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => x51WebSouls.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.postId] })],
);

export const x51WebSoulComments = sqliteTable(
  "x51_web_soul_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => x51WebSouls.id, { onDelete: "cascade" }),
    authorSubject: text("author_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    authorHandle: text("author_handle").notNull(),
    content: text("content").notNull(),
    requestKey: text("request_key").notNull(),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    uniqueIndex("x51_web_comment_idemp").on(
      t.postId,
      t.authorSubject,
      t.requestKey,
    ),
    index("x51_web_comment_post").on(t.postId, t.createdAt),
  ],
);
