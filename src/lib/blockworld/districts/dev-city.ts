// Dev City — where the work actually lives.
//
// Three buildings on one plaza, and the shape of them IS the data model:
//
//   Tower 1, Pipeline   — a floor per project still being built. Always lit.
//   Tower 2, Delivered  — a floor per finished project, ten storeys, restacked
//                         by niche. Codebase and live site reachable from the desk.
//   The Bungalow        — the tools the company built for itself.
//
// Every floor is one `Project` row: `buildingKey` picks the building, `floor`
// picks the storey. The desk on storey 7 of the pipeline tower opens storey 7,
// with its deadline, its task list, its client link and its data board — not a
// list of every project in the tower.
//
// A floor is deliberately one POI, not five. Aiming runs a ray against every
// point of interest in the world on every frame, so twenty-odd floors' worth of
// desks is a budget, not a rounding error.

import { B } from "../blocks";
import type { Cell } from "../build-ops";
import { box, Plot, type District, type DistrictPlan } from "./kit";

/** Storeys in each tower. The delivered tower is always ten. */
const FLOORS = 10;
/** Blocks per storey: three clear plus the slab you walk on. */
const STOREY = 4;
/** Footprint of a tower, walls included. */
const TOWER = 13;

const GROUND = 1;

type TowerSpec = {
  key: "pipeline" | "complete";
  name: string;
  facade: number;
  accent: number;
  /** Local x of the tower's west wall. */
  x0: number;
  z0: number;
};

/**
 * One storey: slab, shell, glazing, ceiling, and the desk that opens it.
 *
 * The floor's POI carries `building:storey` rather than a project id on purpose.
 * The tower is built once and stands still; projects come, get delivered and get
 * restacked underneath it. Binding to a position keeps the desk meaningful when
 * the project behind it changes.
 */
function storey(p: Plot, spec: TowerSpec, n: number): void {
  const y = GROUND + (n - 1) * STOREY;
  const shell = box(spec.x0, y, spec.z0, spec.x0 + TOWER - 1, y + STOREY - 1, spec.z0 + TOWER - 1);

  p.fill(shell, "floor", n === 1 ? B.marble : B.concrete);
  p.fill(shell, "walls", spec.facade);
  p.fill(shell, "ceiling", B.ceiling);

  // Glazing at eye level on every face, and a lit ceiling grid inside.
  p.windows(shell, y + 2, B.curtain_wall, 2);
  for (let x = spec.x0 + 3; x <= spec.x0 + TOWER - 4; x += 4) {
    for (let z = spec.z0 + 3; z <= spec.z0 + TOWER - 4; z += 4) {
      p.set(x, y + STOREY - 1, z, B.ceiling_light);
    }
  }

  // Carpet the storey, leaving the stair core bare.
  p.fill(
    box(spec.x0 + 1, y, spec.z0 + 1, spec.x0 + TOWER - 2, y, spec.z0 + TOWER - 2),
    "solid",
    spec.key === "pipeline" ? B.carpet_blue : B.carpet_green,
  );

  // --- the stair core, north-east corner, climbing south
  const sx = spec.x0 + TOWER - 4;
  const sz = spec.z0 + 2;
  if (n < FLOORS) p.stair(sx, sz, y + 1, STOREY * 2, 1, 2);
  // A hole in the slab above so the flight actually arrives somewhere.
  if (n < FLOORS) {
    p.fill(
      box(sx, y + STOREY, sz + STOREY * 2 - 3, sx + 1, y + STOREY, sz + STOREY * 2 - 1),
      "solid",
      0,
    );
  }

  // --- the working wall: desk, boards, terminal
  const dx = spec.x0 + 3;
  const dz = spec.z0 + TOWER - 3;
  p.set(dx, y + 1, dz, B.desk);
  p.set(dx + 1, y + 1, dz, B.desk);
  p.set(dx, y + 2, dz, B.monitor);
  p.set(dx + 1, y + 2, dz, B.cpu);
  p.set(dx + 2, y + 1, dz, B.chair);
  p.set(dx - 1, y + 1, dz, B.papers);

  // The documents board: client address, contacts, credentials — Project.dataBoard.
  p.set(dx + 4, y + 2, spec.z0 + TOWER - 1, B.corkboard);
  // The client's shareable link lives on the terminal beside it.
  p.set(dx + 5, y + 2, spec.z0 + TOWER - 1, B.tv);

  p.poi({
    x: dx,
    y: y + 2,
    z: dz,
    label: `${spec.name} · Floor ${n}`,
    sublabel: "Deadline, tasks, client link and the data board.",
    panel: "city",
    refId: `${spec.key}:${n}`,
  });

  p.region({
    key: `devcity-${spec.key}-${n}`,
    label: `${spec.name} · Floor ${n}`,
    min: { x: spec.x0, y, z: spec.z0 },
    max: { x: spec.x0 + TOWER, y: y + STOREY, z: spec.z0 + TOWER },
  });

  p.sign({
    text: `FLOOR ${n}`,
    x: spec.x0 + 1,
    y: y + 2,
    z: spec.z0,
    face: "s",
    size: 0.7,
  });
}

function tower(p: Plot, spec: TowerSpec): void {
  for (let n = 1; n <= FLOORS; n++) storey(p, spec, n);

  const top = GROUND + FLOORS * STOREY;
  const shell = box(spec.x0, top, spec.z0, spec.x0 + TOWER - 1, top, spec.z0 + TOWER - 1);
  p.fill(shell, "solid", B.roof);
  // A parapet, so the roof reads as a roof from the plaza.
  p.fill(
    box(spec.x0, top + 1, spec.z0, spec.x0 + TOWER - 1, top + 1, spec.z0 + TOWER - 1),
    "walls",
    spec.accent,
  );

  // Doorway on the plaza side.
  const doorX = spec.x0 + Math.floor(TOWER / 2);
  p.fill(box(doorX - 1, GROUND + 1, spec.z0, doorX + 1, GROUND + 2, spec.z0), "solid", 0);

  p.region({
    key: `devcity-${spec.key}`,
    label: spec.name,
    min: { x: spec.x0, y: GROUND, z: spec.z0 },
    max: { x: spec.x0 + TOWER, y: top + 2, z: spec.z0 + TOWER },
  });

  p.sign({
    text: spec.name.toUpperCase(),
    x: doorX,
    y: GROUND + 3,
    z: spec.z0,
    face: "s",
    size: 1.1,
  });
}

/** The bungalow: one long room, a bay per internal tool. */
function bungalow(p: Plot, x0: number, z0: number): void {
  const w = 21;
  const d = 11;
  const shell = box(x0, GROUND, z0, x0 + w - 1, GROUND + 4, z0 + d - 1);

  p.fill(shell, "floor", B.wood_floor);
  p.fill(shell, "walls", B.drywall_warm);
  p.fill(shell, "ceiling", B.ceiling);
  p.windows(shell, GROUND + 2, B.glass, 2);
  for (let x = x0 + 4; x < x0 + w - 2; x += 5) {
    p.set(x, GROUND + 4, z0 + 5, B.ceiling_light);
  }

  // Doorway, plaza side.
  const doorX = x0 + Math.floor(w / 2);
  p.fill(box(doorX - 1, GROUND + 1, z0, doorX + 1, GROUND + 2, z0), "solid", 0);

  // A bay per tool: bookshelf, a desk with a terminal, a plant.
  const tools = ["Sync AI", "Prompt Library", "Portfolio Site", "Niche Research"];
  tools.forEach((name, i) => {
    const bx = x0 + 3 + i * 5;
    const bz = z0 + d - 3;
    p.set(bx, GROUND + 1, bz, B.desk_dark);
    p.set(bx, GROUND + 2, bz, B.monitor);
    p.set(bx + 1, GROUND + 1, bz, B.books);
    p.set(bx - 1, GROUND + 1, bz, B.pot_white);
    p.set(bx - 1, GROUND + 2, bz, B.plant_tall);
    p.sign({
      text: name.toUpperCase(),
      x: bx,
      y: GROUND + 3,
      z: z0 + d - 1,
      face: "n",
      size: 0.55,
    });
  });

  p.poi({
    x: x0 + 3,
    y: GROUND + 2,
    z: z0 + d - 3,
    label: "Internal tools",
    sublabel: "Everything the company built for itself.",
    panel: "city",
    refId: "tools:1",
  });

  p.region({
    key: "devcity-tools",
    label: "The Bungalow",
    min: { x: x0, y: GROUND, z: z0 },
    max: { x: x0 + w, y: GROUND + 5, z: z0 + d },
  });

  p.sign({
    text: "INTERNAL TOOLS",
    x: doorX,
    y: GROUND + 3,
    z: z0,
    face: "s",
    size: 0.9,
  });
}

const WIDTH = 48;
const DEPTH = 40;
const HEIGHT = GROUND + FLOORS * STOREY + 3;

export const DEV_CITY: District = {
  key: "dev-city",
  label: "Dev City",
  blurb: "Two towers and the bungalow — a floor per project, a bay per tool.",
  size: { w: WIDTH, h: HEIGHT, d: DEPTH },
  build(origin: Cell): DistrictPlan {
    const p = new Plot(origin, { w: WIDTH, h: HEIGHT, d: DEPTH });

    // The plaza the buildings stand on.
    p.fill(box(0, 0, 0, WIDTH - 1, 0, DEPTH - 1), "solid", B.paving);

    tower(p, {
      key: "pipeline",
      name: "Pipeline Tower",
      facade: B.facade_blue,
      accent: B.metal,
      x0: 1,
      z0: 14,
    });
    tower(p, {
      key: "complete",
      name: "Delivered Tower",
      facade: B.facade_green,
      accent: B.metal,
      x0: 18,
      z0: 14,
    });
    bungalow(p, 1, 1);

    // Plaza dressing along the frontage.
    for (let x = 2; x < WIDTH - 2; x += 6) {
      p.set(x, GROUND, 12, B.pot);
      p.set(x, GROUND + 1, 12, B.plant_tall);
    }

    p.region({
      key: "devcity",
      label: "Dev City",
      min: { x: 0, y: 0, z: 0 },
      max: { x: WIDTH, y: HEIGHT, z: DEPTH },
    });

    return p.plan();
  },
};
