// The crew roster.
//
// Every player on the floor is a distinct character — not a hue rotated off a
// user id, but a named crewmate with their own suit, visor tint and headgear, so
// you recognise a teammate across the room in first person before you can read
// their nameplate. Slots are claimed one per person and persisted on AvatarState,
// which is what keeps them unique instead of merely random.

import type { SkillKey } from "./skills";

export type Accessory =
  | "none"
  | "antenna"
  | "cap"
  | "headset"
  | "crown"
  | "bandana"
  | "horns"
  | "halo"
  | "bun"
  | "beanie"
  | "shades"
  | "tuft"
  | "visor-lamp"
  | "flower";

export type Character = {
  id: string;
  /** Crew codename, shown under the player's real name. */
  name: string;
  /** Suit base colour. */
  suit: string;
  /** Shaded side of the suit — pre-computed so the renderer stays cheap. */
  suitDark: string;
  /** Suit highlight, used for the trim and the backpack strap. */
  suitLight: string;
  visor: string;
  accessory: Accessory;
  accessoryColor: string;
  trait: string;
  craft: SkillKey;
};

export const CHARACTERS: Character[] = [
  { id: "vermilion", name: "Vermilion", suit: "#e0574f", suitDark: "#a83c36", suitLight: "#f08a83", visor: "#bfe8f5", accessory: "antenna", accessoryColor: "#ffd166", trait: "Runs at the fire first.", craft: "ops" },
  { id: "cobalt", name: "Cobalt", suit: "#4f7fe0", suitDark: "#33569c", suitLight: "#8bb0f5", visor: "#d3f0ff", accessory: "headset", accessoryColor: "#2b2f38", trait: "Ships before standup.", craft: "dev" },
  { id: "moss", name: "Moss", suit: "#4fae5a", suitDark: "#357a3d", suitLight: "#8ad693", visor: "#e2f7d8", accessory: "flower", accessoryColor: "#f2a5c0", trait: "Keeps the board tidy.", craft: "design" },
  { id: "amber", name: "Amber", suit: "#e0a13a", suitDark: "#a67322", suitLight: "#f5c877", visor: "#fff0cf", accessory: "cap", accessoryColor: "#3a3630", trait: "Cuts on the beat.", craft: "video" },
  { id: "orchid", name: "Orchid", suit: "#a76ad6", suitDark: "#7a479f", suitLight: "#c99ceb", visor: "#f1e0ff", accessory: "bun", accessoryColor: "#3b2f27", trait: "Storyboards in her sleep.", craft: "design" },
  { id: "teal", name: "Teal", suit: "#3fb0ad", suitDark: "#2a7d7b", suitLight: "#7ed6d3", visor: "#d9fbfa", accessory: "shades", accessoryColor: "#26241f", trait: "Never misses a deadline.", craft: "ops" },
  { id: "rust", name: "Rust", suit: "#c26b3c", suitDark: "#8c4826", suitLight: "#e09b70", visor: "#ffe4cd", accessory: "beanie", accessoryColor: "#5a5144", trait: "Refactors for fun.", craft: "dev" },
  { id: "slate", name: "Slate", suit: "#6c7684", suitDark: "#49515c", suitLight: "#9aa4b1", visor: "#e6edf5", accessory: "none", accessoryColor: "#000000", trait: "Reads the whole thread.", craft: "ops" },
  { id: "magenta", name: "Magenta", suit: "#d6539b", suitDark: "#9c3670", suitLight: "#ec8dc1", visor: "#ffe0f1", accessory: "bandana", accessoryColor: "#26241f", trait: "Colour theory evangelist.", craft: "design" },
  { id: "lime", name: "Lime", suit: "#9ac93f", suitDark: "#6d9127", suitLight: "#c1e37e", visor: "#f2ffd6", accessory: "antenna", accessoryColor: "#4fae5a", trait: "First to claim a bounty.", craft: "video" },
  { id: "indigo", name: "Indigo", suit: "#5b52c9", suitDark: "#3d3691", suitLight: "#8d86e6", visor: "#dedbff", accessory: "halo", accessoryColor: "#ffd166", trait: "Writes the docs nobody asks for.", craft: "dev" },
  { id: "sand", name: "Sand", suit: "#d9c48a", suitDark: "#a68f5c", suitLight: "#f0e2b8", visor: "#fff8e2", accessory: "cap", accessoryColor: "#c26b3c", trait: "Calm in every review.", craft: "ops" },
  { id: "crimson", name: "Crimson", suit: "#b03047", suitDark: "#7d1e30", suitLight: "#d76b7d", visor: "#ffd8de", accessory: "horns", accessoryColor: "#26241f", trait: "Argues with the brief.", craft: "design" },
  { id: "aqua", name: "Aqua", suit: "#4fc3e8", suitDark: "#3089a5", suitLight: "#93dff5", visor: "#e4fbff", accessory: "headset", accessoryColor: "#4f7fe0", trait: "Lives in the edit bay.", craft: "video" },
  { id: "olive", name: "Olive", suit: "#7f8c4a", suitDark: "#586231", suitLight: "#aab87c", visor: "#eef5d9", accessory: "tuft", accessoryColor: "#3b2f27", trait: "Estimates honestly.", craft: "dev" },
  { id: "plum", name: "Plum", suit: "#7b4b7a", suitDark: "#563455", suitLight: "#a97ea8", visor: "#f3e2f2", accessory: "crown", accessoryColor: "#ffd166", trait: "Owns the roadmap.", craft: "ops" },
  { id: "coral", name: "Coral", suit: "#f08a6b", suitDark: "#b45f45", suitLight: "#ffb59e", visor: "#ffeae2", accessory: "flower", accessoryColor: "#e0574f", trait: "Turns feedback into gold.", craft: "design" },
  { id: "steel", name: "Steel", suit: "#4a6d8c", suitDark: "#324a61", suitLight: "#82a3bd", visor: "#dff0ff", accessory: "visor-lamp", accessoryColor: "#ffd166", trait: "Debugs by intuition.", craft: "dev" },
  { id: "saffron", name: "Saffron", suit: "#f0c04f", suitDark: "#b48d2e", suitLight: "#ffdd92", visor: "#fff6d6", accessory: "shades", accessoryColor: "#3a3630", trait: "Colour-grades everything.", craft: "video" },
  { id: "fern", name: "Fern", suit: "#39946e", suitDark: "#26694d", suitLight: "#77c3a2", visor: "#ddf7ec", accessory: "beanie", accessoryColor: "#26241f", trait: "Reviews with kindness.", craft: "ops" },
  { id: "iris", name: "Iris", suit: "#8f7ce8", suitDark: "#6455ab", suitLight: "#b9adf5", visor: "#eae5ff", accessory: "bun", accessoryColor: "#7b4b7a", trait: "Prototypes in a lunch break.", craft: "design" },
  { id: "ember", name: "Ember", suit: "#e07a2f", suitDark: "#a5551c", suitLight: "#f7ab6d", visor: "#ffeddb", accessory: "horns", accessoryColor: "#b03047", trait: "Chases the urgent bonus.", craft: "video" },
  { id: "frost", name: "Frost", suit: "#cfe0ea", suitDark: "#9bb0bd", suitLight: "#eef6fb", visor: "#bfe8f5", accessory: "antenna", accessoryColor: "#4fc3e8", trait: "Zero-inbox, always.", craft: "ops" },
  { id: "onyx", name: "Onyx", suit: "#3b3f4a", suitDark: "#262932", suitLight: "#6b7180", visor: "#c9d6e0", accessory: "visor-lamp", accessoryColor: "#4fae5a", trait: "Works the late shift.", craft: "dev" },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function characterById(id: string | null | undefined): Character | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Stable index in the roster derived from a user id. */
export function rosterSeed(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % CHARACTERS.length;
}

/**
 * Claim a slot for a user: start at their preferred seat and walk the roster
 * until an unclaimed one turns up. Deterministic for a given roster state, and
 * unique while the team is smaller than the roster. Past that it wraps and
 * re-uses the preferred seat rather than refusing to hand anyone a character.
 */
export function assignCharacter(userId: string, taken: Iterable<string>): Character {
  const claimed = new Set(taken);
  const start = rosterSeed(userId);
  for (let i = 0; i < CHARACTERS.length; i++) {
    const c = CHARACTERS[(start + i) % CHARACTERS.length];
    if (!claimed.has(c.id)) return c;
  }
  return CHARACTERS[start];
}

/** What the renderer calls: a persisted character, or a deterministic fallback. */
export function characterFor(
  characterId: string | null | undefined,
  userId: string,
): Character {
  return characterById(characterId) ?? CHARACTERS[rosterSeed(userId)];
}
