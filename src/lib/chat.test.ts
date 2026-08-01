import { describe, it, expect } from "vitest";
import {
  CHAT_SEED,
  DM_SERVER_KEY,
  GROUP_WINDOW_MS,
  crossesDay,
  dayLabel,
  dmKeyFor,
  dmMemberIds,
  dmPeerId,
  groupMessages,
  isDmKey,
  isDmMember,
  isReservedServerKey,
  isVoiceInitiator,
  serverInitials,
  slugifyChannel,
  slugifyServer,
  uniqueKey,
  unreadLabel,
} from "./chat";

const base = new Date("2026-07-29T10:00:00.000Z");

function msg(id: string, userId: string, offsetMs: number) {
  return { id, user: { id: userId }, createdAt: new Date(base.getTime() + offsetMs) };
}

describe("CHAT_SEED", () => {
  it("ships both spaces with unique channel keys per space", () => {
    expect(CHAT_SEED.map((s) => s.key)).toEqual(["auxa-hq", "clients"]);
    for (const server of CHAT_SEED) {
      const keys = server.channels.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps the HQ channels the spec asked for", () => {
    const hq = CHAT_SEED.find((s) => s.key === "auxa-hq");
    expect(hq?.channels.filter((c) => (c.kind ?? "text") === "text").map((c) => c.key)).toEqual([
      "general",
      "announcements",
      "dev",
      "video",
      "creative",
      "outreach",
      "random",
    ]);
  });

  it("ships voice rooms to talk in", () => {
    const hq = CHAT_SEED.find((s) => s.key === "auxa-hq");
    expect(hq?.channels.filter((c) => c.kind === "voice").map((c) => c.key)).toEqual([
      "lounge",
      "standup",
    ]);
  });
});

describe("groupMessages", () => {
  it("returns nothing for an empty channel", () => {
    expect(groupMessages([])).toEqual([]);
  });

  it("merges a burst from one author", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u1", 30_000), msg("c", "u1", 60_000)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(groups[0].key).toBe("a");
  });

  it("breaks on a different author", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u2", 1000), msg("c", "u1", 2000)]);
    expect(groups.map((g) => g.userId)).toEqual(["u1", "u2", "u1"]);
  });

  it("breaks once the burst window lapses", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u1", GROUP_WINDOW_MS + 1)]);
    expect(groups).toHaveLength(2);
  });

  it("measures the window from the previous message, not the group start", () => {
    // Three messages each 4m apart: one long block, never a 5m gap.
    const step = 4 * 60_000;
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u1", step), msg("c", "u1", step * 2)]);
    expect(groups).toHaveLength(1);
  });

  it("accepts serialized dates", () => {
    const groups = groupMessages([
      { id: "a", user: { id: "u1" }, createdAt: base.toISOString() },
      { id: "b", user: { id: "u1" }, createdAt: new Date(base.getTime() + 1000).toISOString() },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].at.getTime()).toBe(base.getTime());
  });
});

describe("unreadLabel", () => {
  it("hides zero and negatives", () => {
    expect(unreadLabel(0)).toBe("");
    expect(unreadLabel(-3)).toBe("");
  });

  it("caps the badge", () => {
    expect(unreadLabel(4)).toBe("4");
    expect(unreadLabel(9)).toBe("9");
    expect(unreadLabel(10)).toBe("9+");
    expect(unreadLabel(400, 99)).toBe("99+");
  });
});

describe("direct-message keys", () => {
  it("is order-independent", () => {
    expect(dmKeyFor("bob", "alice")).toBe("dm:alice:bob");
    expect(dmKeyFor("alice", "bob")).toBe("dm:alice:bob");
  });

  it("detects dm keys", () => {
    expect(isDmKey("dm:a:b")).toBe(true);
    expect(isDmKey("general")).toBe(false);
  });

  it("extracts both members", () => {
    expect(dmMemberIds("dm:a:b")).toEqual(["a", "b"]);
    expect(dmMemberIds("general")).toEqual([]);
  });

  it("guards membership", () => {
    expect(isDmMember("dm:a:b", "a")).toBe(true);
    expect(isDmMember("dm:a:b", "c")).toBe(false);
  });

  it("finds the other person, and nobody for outsiders", () => {
    expect(dmPeerId("dm:a:b", "a")).toBe("b");
    expect(dmPeerId("dm:a:b", "b")).toBe("a");
    expect(dmPeerId("dm:a:b", "c")).toBeNull();
  });
});

describe("day dividers", () => {
  const now = new Date("2026-07-31T15:00:00");

  it("labels today and yesterday", () => {
    expect(dayLabel(new Date("2026-07-31T01:00:00"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-07-30T23:59:00"), now)).toBe("Yesterday");
  });

  it("spells out older dates", () => {
    expect(dayLabel(new Date("2026-07-01T10:00:00"), now)).toMatch(/July|7/);
  });

  it("knows when two stamps cross midnight", () => {
    expect(crossesDay(new Date("2026-07-30T23:59:00"), new Date("2026-07-31T00:01:00"))).toBe(true);
    expect(crossesDay(new Date("2026-07-31T08:00:00"), new Date("2026-07-31T22:00:00"))).toBe(false);
  });
});

describe("channel slugs", () => {
  it("lowercases and hyphenates like Discord", () => {
    expect(slugifyChannel("Design Review")).toBe("design-review");
    expect(slugifyChannel("  Q3   Planning!! ")).toBe("q3-planning");
    expect(slugifyChannel("it's-fine")).toBe("its-fine");
  });

  it("never leaves leading or trailing hyphens", () => {
    expect(slugifyChannel("--hi--")).toBe("hi");
    expect(slugifyChannel("!!!")).toBe("");
  });

  it("caps the length", () => {
    expect(slugifyChannel("a".repeat(80)).length).toBe(32);
  });

  it("falls back to a usable server slug", () => {
    expect(slugifyServer("!!!")).toBe("space");
    expect(slugifyServer("Design Team")).toBe("design-team");
  });
});

describe("uniqueKey", () => {
  it("passes through when free", () => {
    expect(uniqueKey("general", ["random"])).toBe("general");
  });

  it("suffixes until it finds a gap", () => {
    expect(uniqueKey("general", ["general"])).toBe("general-2");
    expect(uniqueKey("general", ["general", "general-2", "general-3"])).toBe("general-4");
  });
});

describe("reserved server keys", () => {
  it("protects the seed and the DM space", () => {
    expect(isReservedServerKey("auxa-hq")).toBe(true);
    expect(isReservedServerKey("clients")).toBe(true);
    expect(isReservedServerKey(DM_SERVER_KEY)).toBe(true);
    expect(isReservedServerKey("design-team")).toBe(false);
  });
});

describe("voice mesh", () => {
  it("picks exactly one initiator per pair", () => {
    expect(isVoiceInitiator("alice", "bob")).toBe(true);
    expect(isVoiceInitiator("bob", "alice")).toBe(false);
  });

  it("never lets both sides offer", () => {
    for (const [a, b] of [
      ["u1", "u2"],
      ["zeta", "alpha"],
      ["cms1", "cms2"],
    ]) {
      expect(isVoiceInitiator(a, b)).not.toBe(isVoiceInitiator(b, a));
    }
  });
});

describe("serverInitials", () => {
  it("takes the first two words", () => {
    expect(serverInitials("Auxa HQ")).toBe("AH");
  });

  it("falls back to two letters of a single word", () => {
    expect(serverInitials("Clients")).toBe("CL");
  });

  it("survives empty names", () => {
    expect(serverInitials("   ")).toBe("?");
  });
});
