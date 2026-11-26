import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { accounts } from './schema';

// Additive X1 community records; the nine existing tables are unchanged.
export const x1Bodies = sqliteTable('x1_bodies', {
  subject: text('subject').primaryKey().references(() => accounts.subject, { onDelete: 'cascade' }),
  handle: text('handle').notNull(), displayName: text('display_name').notNull(), bio: text('bio').notNull(),
  avatar: text('avatar').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('x1_body_handle_unique').on(t.handle)]);

export const x56ProfileMetadata = sqliteTable('x56_profile_metadata', {
  subject: text('subject').primaryKey().references(() => accounts.subject, { onDelete: 'cascade' }),
  stateCode: text('state_code'),
  bannerId: text('banner_id'),
  bannerAlign: text('banner_align'),
  updatedAt: text('updated_at').notNull(),
});

export const x1Groups = sqliteTable('x1_groups', {
  id: text('id').primaryKey(), ownerSubject: text('owner_subject').notNull().references(() => x1Bodies.subject, { onDelete: 'cascade' }),
  name: text('name').notNull(), description: text('description').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('x1_group_owner').on(t.ownerSubject)]);

export const x1Memberships = sqliteTable('x1_memberships', {
  groupId: text('group_id').notNull().references(() => x1Groups.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull().references(() => x1Bodies.subject, { onDelete: 'cascade' }),
  role: text('role').notNull(), joinedAt: text('joined_at').notNull(),
}, t => [primaryKey({ columns: [t.groupId, t.subject] }), index('x1_membership_subject').on(t.subject, t.groupId)]);

export const x1Invitations = sqliteTable('x1_invitations', {
  id: text('id').primaryKey(), codeHash: text('code_hash').notNull(),
  groupId: text('group_id').notNull().references(() => x1Groups.id, { onDelete: 'cascade' }),
  invitedHandle: text('invited_handle').notNull(), role: text('role').notNull(),
  createdBy: text('created_by').notNull().references(() => x1Bodies.subject, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(),
  acceptedBy: text('accepted_by').references(() => x1Bodies.subject, { onDelete: 'set null' }),
  acceptedAt: text('accepted_at'), revokedAt: text('revoked_at'),
}, t => [uniqueIndex('x1_invite_code_unique').on(t.codeHash), index('x1_invite_group').on(t.groupId)]);

export const x1GroupSouls = sqliteTable('x1_group_souls', {
  id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => x1Groups.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), revisionId: text('revision_id').notNull(), state: text('state').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('x1_soul_group').on(t.groupId, t.updatedAt)]);

export const x1SoulRevisions = sqliteTable('x1_soul_revisions', {
  id: text('id').primaryKey(), soulId: text('soul_id').notNull().references(() => x1GroupSouls.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), title: text('title').notNull(), formula: text('formula').notNull(),
  summary: text('summary').notNull(), rule: text('rule').notNull(), changeNote: text('change_note').notNull(),
  authorSubject: text('author_subject').references(() => x1Bodies.subject, { onDelete: 'set null' }),
  authorHandle: text('author_handle').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('x1_soul_revision_unique').on(t.soulId, t.revision)]);

export const x1GroupPosts = sqliteTable('x1_group_posts', {
  id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => x1Groups.id, { onDelete: 'cascade' }),
  soulId: text('soul_id').notNull().references(() => x1GroupSouls.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), revisionId: text('revision_id').notNull().references(() => x1SoulRevisions.id, { onDelete: 'cascade' }),
  authorSubject: text('author_subject').references(() => x1Bodies.subject, { onDelete: 'set null' }),
  authorHandle: text('author_handle').notNull(), createdAt: text('created_at').notNull(),
  hiddenAt: text('hidden_at'),
}, t => [uniqueIndex('x1_post_revision_unique').on(t.soulId, t.revision), index('x1_post_group_created').on(t.groupId, t.createdAt)]);

export const x1Supers = sqliteTable('x1_supers', {
  postId: text('post_id').notNull().references(() => x1GroupPosts.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull().references(() => x1Bodies.subject, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
}, t => [primaryKey({ columns: [t.postId, t.subject] })]);

export const x1Comments = sqliteTable('x1_comments', {
  id: text('id').primaryKey(), postId: text('post_id').notNull().references(() => x1GroupPosts.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnySQLiteColumn => x1Comments.id, { onDelete: 'set null' }),
  authorSubject: text('author_subject').references(() => x1Bodies.subject, { onDelete: 'set null' }),
  authorHandle: text('author_handle').notNull(), content: text('content').notNull(),
  createdAt: text('created_at').notNull(), editedAt: text('edited_at'), deletedAt: text('deleted_at'),
  requestKey: text('request_key').notNull(),
}, t => [uniqueIndex('x1_comment_request_unique').on(t.postId, t.requestKey), index('x1_comment_post_created').on(t.postId, t.createdAt)]);

export const x1Reports = sqliteTable('x1_reports', {
  id: text('id').primaryKey(), postId: text('post_id').notNull().references(() => x1GroupPosts.id, { onDelete: 'cascade' }),
  reporterSubject: text('reporter_subject').notNull().references(() => x1Bodies.subject, { onDelete: 'cascade' }),
  reason: text('reason').notNull(), createdAt: text('created_at').notNull(), resolvedAt: text('resolved_at'),
}, t => [uniqueIndex('x1_report_author_post_unique').on(t.postId, t.reporterSubject)]);
