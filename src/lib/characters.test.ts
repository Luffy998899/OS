import { describe, it, expect } from "vitest";
import {
  CHARACTERS,
  CHARACTER_IDS,
  assignCharacter,
  characterById,
  characterFor,
  rosterSeed,
} from "./characters";

describe("roster", () => {
  it("has no duplicate ids, names or suits", () => {
    expect(new Set(CHARACTER_IDS).size).toBe(CHARACTERS.length);
    expect(new Set(CHARACTERS.map((c) => c.name)).size).toBe(CHARACTERS.length);
    expect(new Set(CHARACTERS.map((c) => c.suit)).size).toBe(CHARACTERS.length);
  });

  it("gives every character the parts the renderer needs", () => {
    for (const c of CHARACTERS) {
      expect(c.suit).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.suitDark).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.visor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.trait.length).toBeGreaterThan(0);
    }
  });
});

describe("assignCharacter", () => {
  it("hands out a free slot", () => {
    const c = assignCharacter("user-1", []);
    expect(CHARACTER_IDS).toContain(c.id);
  });

  it("is stable for the same user and roster state", () => {
    expect(assignCharacter("user-1", []).id).toBe(assignCharacter("user-1", []).id);
  });

  it("never repeats a character while slots remain", () => {
    const taken: string[] = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      const c = assignCharacter(`user-${i}`, taken);
      expect(taken).not.toContain(c.id);
      taken.push(c.id);
    }
    expect(new Set(taken).size).toBe(CHARACTERS.length);
  });

  it("still returns someone once the roster is exhausted", () => {
    const c = assignCharacter("user-overflow", CHARACTER_IDS);
    expect(CHARACTER_IDS).toContain(c.id);
  });

  it("spreads different users across the roster", () => {
    const seeds = new Set(Array.from({ length: 40 }, (_, i) => rosterSeed(`u${i}`)));
    expect(seeds.size).toBeGreaterThan(5);
  });
});

describe("characterFor", () => {
  it("uses the stored character when there is one", () => {
    expect(characterFor("cobalt", "anyone").id).toBe("cobalt");
  });

  it("falls back to a deterministic character when unassigned", () => {
    const a = characterFor(null, "user-9");
    const b = characterFor(undefined, "user-9");
    expect(a.id).toBe(b.id);
  });

  it("falls back when the stored id is no longer in the roster", () => {
    expect(characterById("retired-crewmate")).toBeNull();
    expect(characterFor("retired-crewmate", "user-9").id).toBe(characterFor(null, "user-9").id);
  });
});
