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
    ],
  },
  {
    key: "clients",
    name: "Clients",
    description: "Accounts, leads and everything client-facing.",
    channels: [{ key: "leads", name: "leads", topic: "Fresh leads and who is chasing them." }],
  },
];

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
