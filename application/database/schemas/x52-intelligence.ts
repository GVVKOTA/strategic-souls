import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./schema";
import { x1Bodies, x1Groups } from "./x1-community";

export const x52MarketPolls = sqliteTable(
  "x52_market_polls",
  {
    pollId: text("poll_id").primaryKey(),
    underlying: text("underlying").notNull(),
    sessionDate: text("session_date").notNull(),
    opensAtUtc: text("opens_at_utc").notNull(),
    closesAtUtc: text("closes_at_utc").notNull(),
    status: text("status").notNull(),
    referenceLabel: text("reference_label").notNull(),
    cutoffNote: text("cutoff_note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("x52_polls_underlying_date").on(t.underlying, t.sessionDate),
  ],
);

export const x52MarketPollVotes = sqliteTable(
  "x52_market_poll_votes",
  {
    pollId: text("poll_id")
      .notNull()
      .references(() => x52MarketPolls.pollId, { onDelete: "cascade" }),
    subject: text("subject")
      .notNull()
      .references(() => accounts.subject, { onDelete: "cascade" }),
    choice: text("choice").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pollId, t.subject] }),
    index("x52_poll_votes_poll").on(t.pollId, t.choice),
  ],
);

export const x52GroupPins = sqliteTable(
  "x52_group_pins",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => x1Groups.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    pinnedBy: text("pinned_by")
      .notNull()
      .references(() => x1Bodies.subject, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.targetKind, t.targetId] }),
    index("x52_group_pins_order").on(t.groupId, t.position, t.createdAt),
  ],
);

export const x52SearchHistory = sqliteTable("x52_search_history", {
  subject: text("subject")
    .primaryKey()
    .references(() => accounts.subject, { onDelete: "cascade" }),
  recentsJson: text("recents_json").notNull(),
  favoritesJson: text("favorites_json").notNull(),
  optedOut: integer("opted_out").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const x52WatchRegions = sqliteTable("x52_watch_regions", {
  subject: text("subject")
    .primaryKey()
    .references(() => accounts.subject, { onDelete: "cascade" }),
  regionsJson: text("regions_json").notNull(),
  categoriesJson: text("categories_json").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const x52IntelligenceEvents = sqliteTable(
  "x52_intelligence_events",
  {
    eventId: text("event_id").primaryKey(),
    providerId: text("provider_id").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    synopsis: text("synopsis").notNull(),
    occurredAt: text("occurred_at").notNull(),
    datePrecision: text("date_precision").notNull(),
    firstPublishedAt: text("first_published_at"),
    updatedAt: text("updated_at"),
    ingestedAt: text("ingested_at").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceName: text("source_name").notNull(),
    lat: real("lat"),
    lon: real("lon"),
    geoPrecision: text("geo_precision").notNull(),
    countryCode: text("country_code"),
    regionId: text("region_id"),
    entitiesJson: text("entities_json").notNull(),
    assetsJson: text("assets_json").notNull(),
    verified: integer("verified").notNull().default(1),
    licenseScope: text("license_scope").notNull(),
    dedupeHash: text("dedupe_hash").notNull(),
  },
  (t) => [
    uniqueIndex("x52_intel_dedupe").on(t.dedupeHash),
    index("x52_intel_cat_time").on(t.category, t.occurredAt),
  ],
);
