// Team chat — the shape of the workspace's talk.
//
// A "server" is a space (the agency, the client side); channels split that space
// into rooms. The seed below is what a fresh install boots with; the router
// upserts it idempotently so an existing install picks up new channels too.

export type ChatSeedChannel = {
  key: string;
  name: string;
  topic: string;
  kind?: string;
};

export type ChatSeedServer = {
  key: string;
  name: string;
  description: string;
  channels: ChatSeedChannel[];
};

export const CHAT_SEED: ChatSeedServer[] = [
  {
    key: "auxa-hq",
    name: "Auxa HQ",
    description: "The agency floor — everyone who works here.",
    channels: [
      { key: "general", name: "general", topic: "Day-to-day chatter for the whole team." },
      { key: "announcements", name: "announcements", topic: "Company-wide notices worth reading twice." },
      { key: "dev", name: "dev", topic: "Builds, bugs, deploys and code review." },
      { key: "video", name: "video", topic: "Edits in flight, delivery dates, feedback rounds." },
      { key: "creative", name: "creative", topic: "Design, campaigns, brand and references." },
      { key: "outreach", name: "outreach", topic: "Calls, follow-ups and pipeline movement." },
      { key: "random", name: "random", topic: "Off-topic. Keep it kind." },
      { key: "lounge", name: "lounge", topic: "Drop-in voice room.", kind: "voice" },
      { key: "standup", name: "standup", topic: "Daily standup call.", kind: "voice" },
    ],
  },
  {
    key: "clients",
    name: "Clients",
    description: "Accounts, leads and everything client-facing.",
    channels: [{ key: "leads", name: "leads", topic: "Fresh leads and who is chasing them." }],
  },
];

// ---------------------------------------------------------------------------
// Direct messages
//
// DMs are ordinary channels living under one hidden server (key "dms") whose
// channel keys encode the pair: `dm:<idA>:<idB>` with the ids sorted. That
// keeps the schema untouched while the router scopes each DM to its two
// members.
// ---------------------------------------------------------------------------

export const DM_SERVER_KEY = "dms";

/** The canonical channel key for a DM between two users (order-independent). */
export function dmKeyFor(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

export function isDmKey(key: string): boolean {
  return key.startsWith("dm:");
}

/** Both member ids encoded in a DM channel key. */
export function dmMemberIds(key: string): string[] {
  return isDmKey(key) ? key.split(":").slice(1) : [];
}

export function isDmMember(key: string, userId: string): boolean {
  return dmMemberIds(key).includes(userId);
}

/** The other person in a DM, or null when the key doesn't include me. */
export function dmPeerId(key: string, myId: string): string | null {
  const ids = dmMemberIds(key);
  if (!ids.includes(myId)) return null;
  return ids.find((id) => id !== myId) ?? myId;
}

/** Discord-style date-divider label: Today, Yesterday, or the full date. */
export function dayLabel(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}

/** True when two timestamps fall on different calendar days (local time). */
export function crossesDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  );
}

// ---------------------------------------------------------------------------
// Channel + server management
// ---------------------------------------------------------------------------

/** Channel kinds a space can hold. */
export const CHANNEL_KINDS = ["text", "voice"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/**
 * Discord-style channel slug: lowercase, spaces to hyphens, punctuation
 * dropped. "Design Review!" → "design-review".
 */
export function slugifyChannel(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** A space's slug — same rules, but it identifies the server. */
export function slugifyServer(name: string): string {
  return slugifyChannel(name) || "space";
}

/** Reserved keys the seed owns; user channels must never collide with them. */
export function isReservedServerKey(key: string): boolean {
  return key === DM_SERVER_KEY || CHAT_SEED.some((s) => s.key === key);
}

/** Make `base` unique against `taken` by suffixing -2, -3, … */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/** A voice row older than this has stopped heartbeating — treat it as gone. */
export const VOICE_STALE_MS = 15_000;

/** How often a connected client refreshes its voice presence row. */
export const VOICE_HEARTBEAT_MS = 4_000;

/**
 * In a full mesh both sides would offer at once and glare. The peer whose id
 * sorts first is the caller; the other waits for the offer.
 */
export function isVoiceInitiator(myId: string, peerId: string): boolean {
  return myId < peerId;
}

/** Consecutive messages from one person inside this window read as one block. */
export const GROUP_WINDOW_MS = 5 * 60_000;

export type GroupableMessage = {
  id: string;
  createdAt: Date | string;
  user: { id: string };
};

export type MessageGroup<T extends GroupableMessage> = {
  /** Stable key for React — the id of the message that opened the group. */
  key: string;
  userId: string;
  at: Date;
  messages: T[];
};

/**
 * Collapses a chronological message list into author blocks, the way Slack and
 * Discord do: one avatar and one timestamp per burst instead of per line.
 */
export function groupMessages<T extends GroupableMessage>(messages: T[]): MessageGroup<T>[] {
  const groups: MessageGroup<T>[] = [];
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const last = groups[groups.length - 1];
    const sameAuthor = last?.userId === message.user.id;
    const withinWindow =
      !!last && at.getTime() - new Date(last.messages[last.messages.length - 1].createdAt).getTime() <= GROUP_WINDOW_MS;
    if (last && sameAuthor && withinWindow) {
      last.messages.push(message);
    } else {
      groups.push({ key: message.id, userId: message.user.id, at, messages: [message] });
    }
  }
  return groups;
}

/** Badge text for an unread count — anything past the cap reads as "9+". */
export function unreadLabel(count: number, cap = 9): string {
  if (count <= 0) return "";
  return count > cap ? `${cap}+` : String(count);
}

/** Initials for the server rail buttons: "Auxa HQ" → "AH", "Clients" → "CL". */
export function serverInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
