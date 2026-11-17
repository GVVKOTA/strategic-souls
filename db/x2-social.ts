import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { x1Bodies, x1Groups, x1GroupSouls } from "./x1-community";

export const x2SocialPreferences = sqliteTable("x2_social_preferences", {
  subject: text("subject")
    .primaryKey()
    .references(() => x1Bodies.subject, { onDelete: "cascade" }),
  discoverable: integer("discoverable").notNull().default(0),
  messages: text("messages").notNull().default("REQUESTS"),
  receipts: integer("receipts").notNull().default(0),
  notifications: integer("notifications").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const x2Blocks = sqliteTable(
  "x2_blocks",
  {
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    target: text("target")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subject, t.target] }),
    index("x2_block_reverse").on(t.target, t.subject),
  ],
);
export const x2Conversations = sqliteTable(
  "x2_conversations",
  {
    id: text("id").primaryKey(),
    firstSubject: text("first_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    secondSubject: text("second_subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("x2_conversation_pair").on(t.firstSubject, t.secondSubject),
    index("x2_conversation_first").on(t.firstSubject, t.updatedAt),
    index("x2_conversation_second").on(t.secondSubject, t.updatedAt),
  ],
);
export const x2ConversationViews = sqliteTable(
  "x2_conversation_views",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => x2Conversations.id, { onDelete: "cascade" }),
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    hidden: integer("hidden").notNull().default(0),
    muted: integer("muted").notNull().default(0),
    readAt: text("read_at"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.subject] })],
);
export const x2Messages = sqliteTable(
  "x2_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => x2Conversations.id, { onDelete: "cascade" }),
    sender: text("sender")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    content: text("content").notNull(),
    requestKey: text("request_key").notNull(),
    referenceSoul: text("reference_soul"),
    referenceRevision: integer("reference_revision"),
    createdAt: text("created_at").notNull(),
    editedAt: text("edited_at"),
    retractedAt: text("retracted_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("x2_message_retry").on(
      t.conversationId,
      t.sender,
      t.requestKey,
    ),
    index("x2_message_thread_time").on(t.conversationId, t.createdAt, t.id),
  ],
);
export const x2Notifications = sqliteTable(
  "x2_notifications",
  {
    id: text("id").primaryKey(),
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    eventKey: text("event_key").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [
    uniqueIndex("x2_notification_event").on(t.subject, t.eventKey),
    index("x2_notification_owner_time").on(t.subject, t.createdAt),
  ],
);
export const x2Bookmarks = sqliteTable(
  "x2_bookmarks",
  {
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.subject, t.kind, t.targetId] })],
);
export const x2SocialReports = sqliteTable(
  "x2_social_reports",
  {
    id: text("id").primaryKey(),
    reporter: text("reporter")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("x2_report_author").on(t.reporter, t.createdAt)],
);
export const x2GroupDirectory = sqliteTable(
  "x2_group_directory",
  {
    groupId: text("group_id")
      .primaryKey()
      .references(() => x1Groups.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    discoverable: integer("discoverable").notNull().default(0),
    pinnedSoul: text("pinned_soul").references(() => x1GroupSouls.id, {
      onDelete: "set null",
    }),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("x2_group_handle_unique").on(t.handle)],
);
export const x2JoinRequests = sqliteTable(
  "x2_join_requests",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => x1Groups.id, { onDelete: "cascade" }),
    subject: text("subject")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.subject] })],
);
export const x2Discussions = sqliteTable(
  "x2_discussions",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => x1Groups.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    author: text("author")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    sourceAsOf: text("source_as_of"),
    requestKey: text("request_key").notNull(),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    uniqueIndex("x2_discussion_retry").on(t.groupId, t.author, t.requestKey),
    index("x2_discussion_group_time").on(t.groupId, t.createdAt, t.id),
  ],
);
