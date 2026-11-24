import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./schema";
import { authSessions, authUsers } from "./auth";
import { x51WebSouls } from "./x51-research-network";

export const v3FormulaPins = sqliteTable(
  "v3_formula_pins",
  {
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    formulaId: text("formula_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subject, t.formulaId] }),
    index("v3_formula_pins_subject_idx").on(t.subject, t.createdAt),
  ],
);

export const v3AuthTokens = sqliteTable(
  "v3_auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    targetEmail: text("target_email"),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("v3_auth_tokens_hash_unique").on(t.tokenHash),
    index("v3_auth_tokens_user_idx").on(t.userId, t.purpose, t.expiresAt),
  ],
);

export const v3SessionMeta = sqliteTable(
  "v3_session_meta",
  {
    tokenHash: text("token_hash")
      .primaryKey()
      .references(() => authSessions.tokenHash, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    deviceLabel: text("device_label").notNull(),
    userAgent: text("user_agent").notNull(),
    ipHint: text("ip_hint"),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (t) => [index("v3_session_meta_user_idx").on(t.userId, t.lastSeenAt)],
);

export const v3UserEmailVerification = sqliteTable(
  "v3_user_email_verification",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    verifiedEmail: text("verified_email"),
    verifiedAt: text("verified_at"),
    updatedAt: text("updated_at").notNull(),
  },
);

export const v3PostLikes = sqliteTable(
  "v3_post_likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => x51WebSouls.id, { onDelete: "cascade" }),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.subject] }),
    index("v3_post_likes_post_idx").on(t.postId),
  ],
);

export const v3PostViews = sqliteTable(
  "v3_post_views",
  {
    postId: text("post_id")
      .notNull()
      .references(() => x51WebSouls.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    dayBucket: text("day_bucket").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.viewerKey, t.dayBucket] }),
    index("v3_post_views_post_idx").on(t.postId),
  ],
);

export const v3PostShares = sqliteTable(
  "v3_post_shares",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => x51WebSouls.id, { onDelete: "cascade" }),
    actorKey: text("actor_key").notNull(),
    channel: text("channel").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("v3_post_shares_post_idx").on(t.postId)],
);
