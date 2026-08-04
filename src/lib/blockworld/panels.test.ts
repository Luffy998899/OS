import { describe, expect, it } from "vitest";
import { BLOCKS } from "./blocks";
import {
  bindingToPoi,
  CREATIVE_DOORS,
  isBindablePanel,
  PANEL_CATALOG,
  panelMeta,
  poiIdAt,
} from "./panels";

const cell = { x: 12, y: 3, z: 44 };

describe("the panel catalog", () => {
  it("lists each panel once", () => {
    const panels = PANEL_CATALOG.map((p) => p.panel);
    expect(new Set(panels).size).toBe(panels.length);
  });

  it("suggests a block that actually exists", () => {
    for (const p of PANEL_CATALOG) {
      expect(BLOCKS.some((b) => b.key === p.block), `${p.panel} -> ${p.block}`).toBe(true);
    }
  });

  it("gates only Vecna's desk behind admin", () => {
    expect(PANEL_CATALOG.filter((p) => p.adminOnly).map((p) => p.panel)).toEqual(["lair"]);
  });

  it("recognises its own panels and refuses the generated ones", () => {
    for (const p of PANEL_CATALOG) expect(isBindablePanel(p.panel)).toBe(true);
    // `rift` teleports and is authored by the world template, never wired.
    expect(isBindablePanel("rift")).toBe(false);
    expect(isBindablePanel("")).toBe(false);
    expect(panelMeta("nope")).toBeNull();
  });

  it("offers both studio doors", () => {
    expect(CREATIVE_DOORS.map((d) => d.id)).toEqual(["internal", "clients"]);
  });
});

describe("bindingToPoi", () => {
  it("builds a binding for a panel that needs no target", () => {
    expect(bindingToPoi(cell, "tasks", null, "Task wall")).toEqual({
      ...cell,
      panel: "tasks",
      refId: null,
      label: "Task wall",
      sublabel: "Your missions and the squad's work.",
      adminOnly: false,
    });
  });

  it("refuses a panel that needs a target until it has one", () => {
    expect(bindingToPoi(cell, "client", null, "Zen Salon")).toBeNull();
    expect(bindingToPoi(cell, "client", "cl_1", "Zen Salon")).toMatchObject({
      panel: "client",
      refId: "cl_1",
    });
  });

  it("refuses an unknown panel outright", () => {
    expect(bindingToPoi(cell, "rift", null, "Rift")).toBeNull();
    expect(bindingToPoi(cell, "", null, "x")).toBeNull();
  });

  it("drops a stray target on a panel that takes none", () => {
    expect(bindingToPoi(cell, "tasks", "cl_1", "Task wall")?.refId).toBeNull();
  });

  it("falls back to the catalog label when the builder leaves it blank", () => {
    expect(bindingToPoi(cell, "skills", null, "   ")?.label).toBe("Skill tree");
  });

  it("trims and caps the label at what the server accepts", () => {
    const long = "x".repeat(80);
    const poi = bindingToPoi(cell, "tasks", null, `  ${long}  `);
    expect(poi?.label.length).toBe(48);
  });

  it("carries adminOnly through so non-admins can't even aim at it", () => {
    expect(bindingToPoi(cell, "lair", null, "")?.adminOnly).toBe(true);
    expect(bindingToPoi(cell, "tasks", null, "")?.adminOnly).toBe(false);
  });

  it("keeps the cell it was given", () => {
    const poi = bindingToPoi(cell, "docs", null, "Desk");
    expect({ x: poi?.x, y: poi?.y, z: poi?.z }).toEqual(cell);
  });
});

describe("poiIdAt", () => {
  it("gives every cell its own id", () => {
    const ids = [poiIdAt(1, 2, 3), poiIdAt(3, 2, 1), poiIdAt(1, 2, 4)];
    expect(new Set(ids).size).toBe(3);
  });
});
