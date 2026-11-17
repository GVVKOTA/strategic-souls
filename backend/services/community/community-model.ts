import { HttpError } from '../../middleware/security';

export type GroupRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export const AVATARS = ['mint', 'silver', 'slate', 'sky', 'lavender'] as const;
export type Avatar = typeof AVATARS[number];
const RESERVED = new Set(['admin', 'administrator', 'support', 'help', 'security', 'moderator', 'root', 'api', 'global', 'strategy', 'community', 'strategicsouls', 'strategic_souls', 'gvv', 'null', 'undefined', 'deleted']);

export function field(value: unknown, label: string, max: number, min = 1): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  const text = value.normalize('NFKC').trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new HttpError(400, `${label} must contain ${min}–${max} characters without control characters.`);
  return text;
}

export function bodyHandle(value: unknown): string {
  const handle = field(value, 'Body handle', 25, 3).replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle) || RESERVED.has(handle)) throw new HttpError(400, 'Choose a Body handle of 3–24 letters, numbers or underscores, starting with a letter. Reserved handles are unavailable.');
  return handle;
}

export function avatar(value: unknown): Avatar {
  if (!AVATARS.includes(value as Avatar)) throw new HttpError(400, 'Choose an available avatar colour. Profile photos are not connected.');
  return value as Avatar;
}

export function id(value: unknown, label = 'Record'): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) throw new HttpError(400, `${label} ID is invalid.`);
  return value;
}

export function assignableRole(value: unknown): Exclude<GroupRole, 'OWNER'> {
  if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(String(value))) throw new HttpError(400, 'Role must be ADMIN, EDITOR or VIEWER.');
  return value as Exclude<GroupRole, 'OWNER'>;
}

export function revisionNumber(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10000) throw new HttpError(400, 'A valid base revision is required.');
  return Number(value);
}

export function canWrite(role: GroupRole): boolean { return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR'; }
export function canAdmin(role: GroupRole): boolean { return role === 'OWNER' || role === 'ADMIN'; }

export const COMMUNITY_LIMITS = Object.freeze({ groupsPerBody: 30, membersPerGroup: 100, readPage: 50, revisionsPage: 100, commentsPage: 200, requestsPerMinute: 120, writesPerMinute: 30, invitesPerDay: 25 });
