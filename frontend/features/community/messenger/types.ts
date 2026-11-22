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

/** Deduplicate and chronologically sort merged older + current messages by id so retractions/edits NEVER duplicate. */
export function mergeUniqueMessages(
  older: ChatMessage[],
  latest: ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of older) byId.set(m.id, m);
  // Latest server state always wins for overlapping IDs (edits, retractions, read receipts)
  for (const m of latest) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function shortClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function inboxTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return shortClockTime(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7 && diffDays >= 0) {
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
