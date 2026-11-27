export type NoticeTarget =
  | { kind: "chat" | "soul" | "room" | "profile" | "scan" | "alert" | "event"; id: string; anchor?: string }
  | { kind: "security" | "system" | "rooms" };

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const HANDLE = /^[a-z][a-z0-9_]{2,23}$/i;

const NOTIFICATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  MESSAGE: "New direct message",
  MESSAGE_REPLY: "Reply in direct chat",
  MESSAGE_REQUEST: "New message request",
  SOUL_LIKE: "Someone liked your Soul",
  SOUL_SAVE: "Someone saved your Soul",
  SOUL_COMMENT: "New comment on your Soul",
  SOUL_REPLY: "Reply on a Soul discussion",
  NEW_FOLLOWER: "New follower",
  FOLLOW_REQUEST: "New follow request",
  FOLLOW_APPROVED: "Follow request approved",
  MENTION: "You were mentioned in a room",
  JOIN_REQUEST: "Room join request",
  JOIN_DECISION: "Room join update",
  ROOM_MESSAGE: "New room activity",
  ROOM_INVITE: "Research Room invitation",
  SCAN_COMPLETE: "Soul Scan completed",
  PRICE_ALERT: "Price alert triggered",
  ECONOMIC_EVENT: "Economic calendar update",
  SECURITY: "Account security notice",
  ACCOUNT_SECURITY: "Account security notice",
  ACCOUNT: "Account update",
  SYSTEM: "System update",
  ANNOUNCEMENT: "Strategic Souls update",
});

export function notificationLabel(kind: string): string {
  return NOTIFICATION_LABELS[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

export function notificationTarget(kind: string, id: string, key = ""): NoticeTarget | null {
  if (["SECURITY", "ACCOUNT_SECURITY", "ACCOUNT"].includes(kind)) return { kind: "security" };
  if (["SYSTEM", "ANNOUNCEMENT"].includes(kind)) return { kind: "system" };
  if (["NEW_FOLLOWER", "FOLLOW_REQUEST", "FOLLOW_APPROVED"].includes(kind))
    return HANDLE.test(id) ? { kind: "profile", id } : null;
  if (!ID.test(id)) return null;
  const asset = key.split(":")[1] ?? "";
  const anchor = ID.test(asset) && asset !== id ? asset : undefined;
  switch (kind) {
    case "MESSAGE": case "MESSAGE_REPLY": case "MESSAGE_REQUEST": return { kind: "chat", id, anchor };
    case "SOUL_LIKE": case "SOUL_SAVE": return { kind: "soul", id };
    case "SOUL_COMMENT": case "SOUL_REPLY": return { kind: "soul", id, anchor };
    case "MENTION": case "ROOM_MESSAGE":
      return { kind: "room", id, anchor };
    case "JOIN_REQUEST": case "JOIN_DECISION": case "ROOM_INVITE":
      return { kind: "room", id };
    case "SCAN_COMPLETE": return { kind: "scan", id };
    case "PRICE_ALERT": return { kind: "alert", id };
    case "ECONOMIC_EVENT": return { kind: "event", id };
    default: return null;
  }
}

export function notificationHref(target: NoticeTarget) {
  const params = new URLSearchParams();
  switch (target.kind) {
    case "chat": params.set("view", "community"); params.set("tab", "chats"); params.set("thread", target.id); break;
    case "soul": params.set("view", "community"); params.set("tab", "souls"); params.set("post", target.id); break;
    case "room": params.set("view", "community"); params.set("tab", "rooms"); params.set("room", target.id); break;
    case "rooms": params.set("view", "community"); params.set("tab", "rooms"); break;
    case "profile": params.set("view", "community"); params.set("tab", "souls"); params.set("profile", target.id); break;
    case "scan": params.set("view", "strategy"); params.set("scan", target.id); break;
    case "alert": params.set("view", "global"); params.set("section", "price-alerts"); params.set("alert", target.id); break;
    case "event": params.set("view", "global"); params.set("section", "calendar"); params.set("event", target.id); break;
    default: params.set("view", "settings"); params.set("section", target.kind === "security" ? "security" : "about");
  }
  if ("anchor" in target && target.anchor) params.set("anchor", target.anchor);
  return "/?" + params;
}
