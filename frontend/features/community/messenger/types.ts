export type ChatBody = {
  handle: string;
  displayName: string;
  avatar: string;
  bio: string;
};

export type SharedSoulRef = {
  id: string;
  title: string;
  summary: string;
  formula?: string;
  groupId: string;
  revision: number;
  authorHandle?: string;
  unavailable?: boolean;
};

export type InboxThread = {
  id: string;
  handle: string;
  displayName: string;
  avatar?: string;
  state: string;
  requestedByMe: number;
  unread: number;
  muted: number;
  updatedAt: string;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  lastMessageRetracted?: number | null;
  lastMessageIsMine?: number | null;
};

export type ChatMessage = {
  id: string;
  text: string;
  authorHandle: string;
  isMine: boolean;
  createdAt: string;
  editedAt: string | null;
  retractedAt: string | null;
  version: number;
  status: string;
  reference: SharedSoulRef | null;
};

export type ChatThread = {
  id: string;
  state: string;
  requestedByMe: boolean;
  peer: ChatBody;
  preferences: { muted: number; hidden: number };
  messages: ChatMessage[];
  nextBefore: string | null;
};

const STATUS_RANK: Record<string, number> = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

function mergeMessagePair(existing: ChatMessage, incoming: ChatMessage): ChatMessage {
  const existingRank = STATUS_RANK[existing.status] ?? 0;
  const incomingRank = STATUS_RANK[incoming.status] ?? 0;
  const bestStatus =
    incomingRank >= existingRank ? incoming.status : existing.status;

  // Monotonic retraction: once retracted, stale snapshots must never revive old text
  if (existing.retractedAt && !incoming.retractedAt) {
    return { ...existing, status: bestStatus };
  }
  if (incoming.retractedAt && !existing.retractedAt) {
    return { ...incoming, status: bestStatus };
  }
  // Prefer higher edit version so out-of-order polls cannot downgrade a confirmed edit
  if (incoming.version < existing.version) {
    return { ...existing, status: bestStatus };
  }
  if (incoming.version > existing.version) {
    return { ...incoming, status: bestStatus };
  }
  if (
    existing.editedAt &&
    (!incoming.editedAt || existing.editedAt > incoming.editedAt)
  ) {
    return { ...existing, status: bestStatus };
  }
  return { ...incoming, status: bestStatus };
}

/** Deduplicate and chronologically sort merged older + current messages by id so retractions/edits/receipts NEVER duplicate or downgrade. */
export function mergeUniqueMessages(
  older: ChatMessage[],
  latest: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of older) {
    const prev = byId.get(m.id);
    byId.set(m.id, prev ? mergeMessagePair(prev, m) : m);
  }
  for (const m of latest) {
    const prev = byId.get(m.id);
    byId.set(m.id, prev ? mergeMessagePair(prev, m) : m);
  }
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function shortClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function inboxTimeLabel(
  iso: string | null | undefined,
  referenceNow?: Date,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = referenceNow ?? new Date();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const calendarDays = Math.round((startOfNow - startOfMsg) / 86_400_000);
  if (calendarDays === 0) return shortClockTime(iso);
  if (calendarDays === 1) return "Yesterday";
  if (calendarDays > 1 && calendarDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function dateDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateDividerLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (dateDayKey(iso) === dateDayKey(now.toISOString())) return "Today";
  const yest = new Date(now.getTime() - 86_400_000);
  if (dateDayKey(iso) === dateDayKey(yest.toISOString())) return "Yesterday";
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function inboxPreviewText(item: InboxThread): string {
  if (item.lastMessageRetracted) return "Message retracted";
  if (item.lastMessageText && item.lastMessageText.trim().length > 0) {
    const prefix = item.lastMessageIsMine ? "You: " : "";
    return prefix + item.lastMessageText.replace(/\s+/g, " ").trim();
  }
  if (item.state === "REQUESTED") {
    return item.requestedByMe ? "Message request sent" : "Message request";
  }
  return "No messages yet";
}
