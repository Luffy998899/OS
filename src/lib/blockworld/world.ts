// AUXA HQ — the whole office, generated as pure data. No DOM, no three.js,
// no randomness. Coordinates: x east, y up, z south. y0 is the structural
// slab, the ground floor is WALKED AT y1 and capped by a suspended ceiling at
// y6. Fill ranges are inclusive and clamp to bounds. Yaw 0 faces -z (north).
//
// The shape of the place: one spine corridor running north from the reception
// lobby, glass-fronted rooms hanging off both sides, a pantry at the far end,
// and two ten-storey project towers standing on the roof above the Dev Wing,
// reached by the lifts in the Dev Wing lobby.

import { B } from "./blocks";
import type { Npc, PanelKind, Poi, Region, TextSign, Vec3, World } from "./types";

export type WorldInput = {
  rooms: { id: string; key: string; name: string; kind: string }[];
  projects: { id: string; name: string; floor: number; buildingKey: string }[];
};

const SX = 180;
const SY = 76;
const SZ = 140;
const AIR = 0;

/** Ground floor levels. */
const SLAB = 0;
const FLOOR = 1;
const CEIL = 6;
const ROOF = 7;

/** HQ envelope — the wall blocks themselves. */
const HX0 = 10;
const HX1 = 170;
const HZ0 = 6;
const HZ1 = 134;
/** Everything inside the envelope starts life as a solid drywall mass. */
const IX0 = 11;
const IX1 = 169;
const IZ0 = 7;
const IZ1 = 133;

/** The spine corridor. */
const COR_X0 = 84;
const COR_X1 = 96;
const COR_Z0 = 14;
const COR_Z1 = 117;

/** West rooms: interior x range, glass front on their east wall. */
const WX0 = 14;
const WX1 = 82;
const W_FRONT = 83;
/** East rooms: interior x range, glass front on their west wall. */
const EX0 = 98;
const EX1 = 166;
const E_FRONT = 97;

/** Room bands along z (interior, inclusive). */
const BAND1_Z0 = 14;
const BAND1_Z1 = 44;
const BAND2_Z0 = 48;
const BAND2_Z1 = 78;
const BAND3_Z0 = 82;
const BAND3_Z1 = 112;
const BAND4_Z0 = 118;
const BAND4_Z1 = 133;

const LOB_X0 = 74;
const LOB_X1 = 106;
const SHOOT_X1 = 72;
const SHOOT_FRONT = 73;
const MH_X0 = 108;
const MH_FRONT = 107;
const PAN_Z0 = 7;
const PAN_Z1 = 12;
const PAN_FRONT = 13;

/** Entrance gap in the south facade. */
const DOOR_X0 = 86;
const DOOR_X1 = 92;

/** Towers: both z 14..44, stacked on the roof above the Dev Wing. */
const TZ0 = 14;
const TZ1 = 44;
const FLOORS = 10;
const floorPlate = (n: number): number => 8 + (n - 1) * 6;

/** The Upside Down: a sealed box no surface path can ever touch. */
const LX0 = 6;
const LX1 = 66;
const LY0 = 60;
const LY1 = 70;
const LZ0 = 6;
const LZ1 = 66;

type Facing = "n" | "s" | "e" | "w";
const STEP: Record<Facing, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};
/** Yaw that looks in a given compass direction (yaw 0 looks -z). */
const YAW: Record<Facing, number> = {
  n: 0,
  s: Math.PI,
  e: Math.PI / 2,
  w: -Math.PI / 2,
};

type Tower = {
  key: string;
  label: string;
  x0: number;
  x1: number;
  /** Wall carrying the lift doors (the face turned towards the other tower). */
  inner: number;
  /** Which side of `inner` the tower's own floor is on. */
  innerFace: Facing;
  carpet: number;
  facade: number;
  arrival: number;
};

const TOWERS: Tower[] = [
  {
    key: "pipeline",
    label: "Pipeline Tower",
    x0: 98,
    x1: 130,
    inner: 130,
    innerFace: "w",
    carpet: B.carpet_blue,
    facade: B.facade_blue,
    arrival: 127.5,
  },
  {
    key: "complete",
    label: "Completed Tower",
    x0: 134,
    x1: 166,
    inner: 134,
    innerFace: "e",
    carpet: B.carpet_green,
    facade: B.facade_warm,
    arrival: 136.5,
  },
];

/** Where the lifts drop you back out in the Dev Wing. */
const LIFT_LOBBY: Vec3 = { x: 164.5, y: FLOOR, z: 25.5 };
/** Arrival pads for the two rift ends. */
const RIFT_LAIR: Vec3 = { x: 36.5, y: LY0 + 1, z: 40.5 };
const RIFT_OFFICE: Vec3 = { x: 161.5, y: FLOOR, z: 125.5 };

export function buildWorld(input: WorldInput): World {
  const blocks = new Uint8Array(SX * SY * SZ);
  const pois: Poi[] = [];
  const regions: Region[] = [];
  const signs: TextSign[] = [];
  const npcs: Npc[] = [];

  /** Deterministic hue per person so nobody is dressed the same. */
  const hueFor = (seed: string): number => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return h;
  };

  const npc = (
    id: string,
    name: string,
    role: string,
    kind: "staff" | "client",
    x: number,
    z: number,
    yaw: number,
    opts?: { seated?: boolean; y?: number; poiId?: string },
  ): void => {
    npcs.push({
      id,
      name,
      role,
      kind,
      x: x + 0.5,
      y: opts?.y ?? FLOOR,
      z: z + 0.5,
      yaw,
      seated: opts?.seated,
      hue: hueFor(id + name),
      poiId: opts?.poiId,
    });
  };

  // Compass yaws: the contract is yaw 0 = -z (north), positive toward +x.
  const YAW = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 };

  const roomId = (...keys: string[]): string | null =>
    input.rooms.find((r) => keys.includes(r.key))?.id ?? null;
  const roomName = (fallback: string, ...keys: string[]): string =>
    input.rooms.find((r) => keys.includes(r.key))?.name ?? fallback;
  const clients = input.rooms.filter((r) => r.kind === "client");
  const pipelineProjects = input.projects
    .filter((p) => p.buildingKey !== "tools")
    .sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name));
  const completedProjects = input.projects
    .filter((p) => p.buildingKey === "tools")
    .sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name));

  // --- primitives ----------------------------------------------------------

  const inBounds = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;

  const set = (x: number, y: number, z: number, id: number): void => {
    if (inBounds(x, y, z)) blocks[(y * SZ + z) * SX + x] = id;
  };

  const get = (x: number, y: number, z: number): number =>
    inBounds(x, y, z) ? blocks[(y * SZ + z) * SX + x] : B.concrete;

  const fill = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: number,
  ): void => {
    for (let y = Math.max(0, y0); y <= Math.min(SY - 1, y1); y++)
      for (let z = Math.max(0, z0); z <= Math.min(SZ - 1, z1); z++)
        for (let x = Math.max(0, x0); x <= Math.min(SX - 1, x1); x++)
          blocks[(y * SZ + z) * SX + x] = id;
  };

  const carve = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): void => fill(x0, y0, z0, x1, y1, z1, AIR);

  const poi = (p: Poi): void => {
    pois.push(p);
  };
  const region = (r: Region): void => {
    regions.push(r);
  };
  const sign = (
    text: string,
    x: number,
    y: number,
    z: number,
    face: TextSign["face"],
    size?: number,
    extra?: Partial<TextSign>,
  ): void => {
    signs.push({ text, x, y, z, face, size, ...extra });
  };

  /** Recessed lights sit on a fixed 6-block grid, so every room catches some. */
  const isLightCell = (x: number, z: number): boolean =>
    ((x % 6) + 6) % 6 === 2 && ((z % 6) + 6) % 6 === 2;

  /** A suspended ceiling plane with its recessed lights. */
  const ceilingOver = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    tiles = true,
  ): void => {
    if (tiles) fill(x0, y, z0, x1, y, z1, B.ceiling);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (isLightCell(x, z)) set(x, y, z, B.ceiling_light);
  };

  /** Hollow out an occupiable room: floor finish, clear air, lit ceiling. */
  const space = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    floorId: number,
  ): void => {
    carve(x0, FLOOR, z0, x1, CEIL - 1, z1);
    fill(x0, SLAB, z0, x1, SLAB, z1, floorId);
    ceilingOver(x0, z0, x1, z1, CEIL);
  };

  /** Glass shopfront on a north/south-running wall: trim sill, glass, header. */
  const glazedFrontX = (xw: number, z0: number, z1: number): void => {
    fill(xw, FLOOR, z0, xw, FLOOR, z1, B.trim);
    fill(xw, FLOOR + 1, z0, xw, FLOOR + 3, z1, B.glass);
    fill(xw, FLOOR + 4, z0, xw, CEIL, z1, B.drywall);
  };

  /** Same, on an east/west-running wall. */
  const glazedFrontZ = (zw: number, x0: number, x1: number): void => {
    fill(x0, FLOOR, zw, x1, FLOOR, zw, B.trim);
    fill(x0, FLOOR + 1, zw, x1, FLOOR + 3, zw, B.glass);
    fill(x0, FLOOR + 4, zw, x1, CEIL, zw, B.drywall);
  };

  /** A 3 wide x 3 high doorway with a lit name strip over it. */
  const doorX = (
    xw: number,
    z0: number,
    reader: "e" | "w",
    text: string,
  ): void => {
    carve(xw, FLOOR, z0, xw, FLOOR + 2, z0 + 2);
    fill(xw, FLOOR + 3, z0, xw, FLOOR + 3, z0 + 2, B.sign);
    sign(text, reader === "e" ? xw + 1.05 : xw - 0.05, FLOOR + 3.5, z0 + 1.5, reader, 0.9);
  };

  const doorZ = (
    zw: number,
    x0: number,
    reader: "n" | "s",
    text: string,
  ): void => {
    carve(x0, FLOOR, zw, x0 + 2, FLOOR + 2, zw);
    fill(x0, FLOOR + 3, zw, x0 + 2, FLOOR + 3, zw, B.sign);
    sign(text, x0 + 1.5, FLOOR + 3.5, reader === "s" ? zw + 1.05 : zw - 0.05, reader, 0.9);
  };

  type RoomSpec = {
    key: string;
    label: string;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    floorId: number;
    /** The glass front and which side of it the corridor is on. */
    frontX: number;
    reader: "e" | "w";
    doors: { z: number; text: string }[];
    roomId?: string | null;
  };

  /** A glass-fronted office room: shell, front, doors, signage, region. */
  const room = (spec: RoomSpec): void => {
    space(spec.x0, spec.z0, spec.x1, spec.z1, spec.floorId);
    glazedFrontX(spec.frontX, spec.z0, spec.z1);
    for (const d of spec.doors) doorX(spec.frontX, d.z, spec.reader, d.text);
    region({
      key: spec.key,
      label: spec.label,
      roomId: spec.roomId ?? null,
      min: { x: spec.x0, y: FLOOR, z: spec.z0 },
      max: { x: spec.x1 + 1, y: CEIL + 1, z: spec.z1 + 1 },
    });
  };

  // --- furniture -----------------------------------------------------------

  const chair = (x: number, z: number): void => {
    if (get(x, FLOOR, z) === AIR) set(x, FLOOR, z, B.chair);
  };

  const plantPair = (x: number, z: number): void => {
    set(x, FLOOR, z, B.planter);
    set(x, FLOOR + 1, z, B.plant);
  };

  type Tool = {
    id: string;
    label: string;
    sublabel: string;
    panel: PanelKind;
    refId?: string;
  };

  /** Desk + monitor + chair. With `tool`, the monitor is a usable computer. */
  const workstation = (
    x: number,
    z: number,
    seat: Facing,
    tool?: Tool,
  ): void => {
    set(x, FLOOR, z, B.desk);
    set(x, FLOOR + 1, z, B.monitor);
    const [dx, dz] = STEP[seat];
    chair(x + dx, z + dz);
    if (tool)
      poi({
        id: tool.id,
        label: tool.label,
        sublabel: tool.sublabel,
        panel: tool.panel,
        refId: tool.refId,
        min: { x, y: FLOOR + 1, z },
        max: { x: x + 1, y: FLOOR + 2, z: z + 1 },
      });
  };

  /** A run of plain desks — the bench seating everybody actually sits at. */
  const deskCluster = (
    x: number,
    z: number,
    count: number,
    seat: Facing,
    axis: "x" | "z",
    gap = 2,
  ): void => {
    for (let i = 0; i < count; i++)
      workstation(
        axis === "x" ? x + i * gap : x,
        axis === "z" ? z + i * gap : z,
        seat,
      );
  };

  /** A meeting table with chairs down its two long sides. */
  const meetingTable = (x0: number, z0: number, x1: number, z1: number): void => {
    fill(x0, FLOOR, z0, x1, FLOOR, z1, B.table);
    if (x1 - x0 >= z1 - z0) {
      for (let x = x0; x <= x1; x += 2) {
        chair(x, z0 - 1);
        chair(x, z1 + 1);
      }
    } else {
      for (let z = z0; z <= z1; z += 2) {
        chair(x0 - 1, z);
        chair(x1 + 1, z);
      }
    }
  };

  /** Every room is a route into work, not decoration: its mission board. */
  const missionBoard = (
    key: string,
    name: string,
    min: Vec3,
    max: Vec3,
    ...keys: string[]
  ): void => {
    poi({
      id: `board-${key}`,
      label: `${name} board`,
      sublabel: "open missions here",
      panel: "missions",
      refId: roomId(...keys) ?? undefined,
      min,
      max,
    });
  };

  // --- shell ---------------------------------------------------------------

  const buildShell = (): void => {
    // Structural slab, then plaza paving everywhere outside the envelope.
    fill(0, SLAB, 0, SX - 1, SLAB, SZ - 1, B.concrete);
    fill(0, SLAB, 0, SX - 1, SLAB, HZ0 - 1, B.paving);
    fill(0, SLAB, HZ1 + 1, SX - 1, SLAB, SZ - 1, B.paving);
    fill(0, SLAB, HZ0, HX0 - 1, SLAB, HZ1, B.paving);
    fill(HX1 + 1, SLAB, HZ0, SX - 1, SLAB, HZ1, B.paving);

    // The interior starts as solid drywall; every space is carved out of it,
    // so leftovers are risers and service voids rather than accidental holes.
    fill(IX0, FLOOR, IZ0, IX1, CEIL, IZ1, B.drywall);

    // Facade with curtain-wall window bands, piers every 8 blocks.
    fill(HX0, FLOOR, HZ0, HX0, CEIL, HZ1, B.facade);
    fill(HX1, FLOOR, HZ0, HX1, CEIL, HZ1, B.facade);
    fill(HX0, FLOOR, HZ0, HX1, CEIL, HZ0, B.facade);
    fill(HX0, FLOOR, HZ1, HX1, CEIL, HZ1, B.facade);
    for (let z = HZ0 + 2; z <= HZ1 - 2; z++) {
      if (z % 8 === 0) continue;
      fill(HX0, FLOOR + 1, z, HX0, FLOOR + 3, z, B.curtain_wall);
      fill(HX1, FLOOR + 1, z, HX1, FLOOR + 3, z, B.curtain_wall);
    }
    for (let x = HX0 + 2; x <= HX1 - 2; x++) {
      if (x % 8 === 0) continue;
      fill(x, FLOOR + 1, HZ0, x, FLOOR + 3, HZ0, B.curtain_wall);
      fill(x, FLOOR + 1, HZ1, x, FLOOR + 3, HZ1, B.curtain_wall);
    }
    fill(HX0, ROOF, HZ0, HX1, ROOF, HZ1, B.roof);
  };

  // --- circulation ---------------------------------------------------------

  const buildCorridor = (): void => {
    space(COR_X0, COR_Z0, COR_X1, COR_Z1, B.carpet_gray);
    region({
      key: "corridor",
      label: "Main Corridor",
      roomId: null,
      min: { x: COR_X0, y: FLOOR, z: COR_Z0 },
      max: { x: COR_X1 + 1, y: CEIL + 1, z: COR_Z1 + 1 },
    });
  };

  /** Runs after the rooms, so the shopfronts don't paint over the dressing. */
  const dressCorridor = (): void => {
    // Planters and felt baffles down the spine, kept off the door approaches.
    for (const z of [18, 40, 52, 74, 84, 110]) {
      plantPair(COR_X0 + 1, z);
      plantPair(COR_X1 - 1, z);
    }
    for (const z of [22, 44, 66, 92, 114]) {
      fill(W_FRONT, FLOOR + 2, z, W_FRONT, FLOOR + 3, z, B.felt_teal);
      fill(E_FRONT, FLOOR + 2, z, E_FRONT, FLOOR + 3, z, B.felt_orange);
    }
    sign("AUXA HQ · LEVEL 1", 90, FLOOR + 4.4, COR_Z0 - 0.05, "s", 1.1);
  };

  const buildLobby = (): void => {
    space(LOB_X0, BAND4_Z0, LOB_X1, BAND4_Z1, B.marble);
    // Entrance: 6 wide x 4 high through the south facade, with a canopy sign.
    carve(DOOR_X0, FLOOR, HZ1, DOOR_X1, FLOOR + 3, HZ1);
    fill(DOOR_X0 - 1, FLOOR + 4, HZ1, DOOR_X1 + 1, FLOOR + 4, HZ1, B.sign);
    sign("AUXA HQ", (DOOR_X0 + DOOR_X1 + 1) / 2, FLOOR + 4.5, HZ1 + 1.05, "s", 1.8);
    sign("RECEPTION", 89.5, FLOOR + 4.3, BAND4_Z0 - 0.05, "s", 1);

    // Reception desk facing the doors, with the bounty terminal on it.
    fill(84, FLOOR, 126, 89, FLOOR, 126, B.desk);
    set(87, FLOOR + 1, 126, B.monitor);
    workstation(85, 126, "n", {
      id: "reception-pc",
      label: "Reception terminal",
      sublabel: "sit down and work · opens the open bounty board",
      panel: "bounties",
    });
    chair(88, 125);

    // Planting either side of the doors (the wall display goes up with the
    // studio's shopfront, which is built later).
    plantPair(DOOR_X0 - 2, BAND4_Z1);
    plantPair(DOOR_X1 + 2, BAND4_Z1);
    plantPair(LOB_X0 + 1, BAND4_Z0 + 1);
    plantPair(LOB_X1 - 1, BAND4_Z0 + 1);

    // Waiting area: two chair pairs around low tables.
    for (const [x, z] of [
      [78, 124],
      [98, 131],
    ] as const) {
      set(x, FLOOR, z, B.table);
      chair(x - 1, z);
      chair(x + 1, z);
      set(x, FLOOR, z + 1, B.rug);
    }

    region({
      key: "lobby",
      label: "Reception",
      roomId: null,
      min: { x: LOB_X0, y: FLOOR, z: BAND4_Z0 },
      max: { x: LOB_X1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });

    // Bell & timetable alcove against the lobby's east wall.
    fill(MH_FRONT, FLOOR, 120, MH_FRONT, CEIL, 128, B.drywall_warm);
    fill(MH_FRONT, FLOOR + 2, 123, MH_FRONT, FLOOR + 4, 125, B.clock);
    fill(MH_FRONT, FLOOR + 1, 120, MH_FRONT, FLOOR + 3, 121, B.corkboard);
    fill(MH_FRONT, FLOOR + 1, 127, MH_FRONT, FLOOR + 3, 128, B.felt_orange);
    sign("THE BELL SCHEDULE", MH_FRONT - 0.05, FLOOR + 5.3, 124.5, "w", 0.8);
    poi({
      id: "timetable-board",
      label: "Daily timetable",
      sublabel: "your blocks today · the bell rings on the change",
      panel: "timetable",
      // Reaches down to floor level: the old box started above eye height, so
      // you had to jump to put the crosshair on it.
      min: { x: MH_FRONT, y: FLOOR, z: 120 },
      max: { x: MH_FRONT + 1, y: FLOOR + 5, z: 129 },
    });
    workstation(102, 126, "w", {
      id: "timetable-pc",
      label: "Attendance terminal",
      sublabel: "sit down and work · opens the bell schedule",
      panel: "timetable",
    });
    plantPair(101, 121);
    region({
      key: "timetable",
      label: roomName("Timetable", "timetable"),
      roomId: roomId("timetable"),
      min: { x: 100, y: FLOOR, z: 120 },
      max: { x: 107, y: CEIL + 1, z: 129 },
    });
  };

  const buildPantry = (): void => {
    space(LOB_X0, PAN_Z0, LOB_X1, PAN_Z1, B.wood_floor);
    glazedFrontZ(PAN_FRONT, LOB_X0, LOB_X1);
    doorZ(PAN_FRONT, 88, "s", "PANTRY");
    // Counter along the north wall, warm felt, tables and a screen.
    fill(78, FLOOR, PAN_Z0, 92, FLOOR, PAN_Z0, B.pantry);
    fill(78, FLOOR + 1, HZ0, 92, FLOOR + 3, HZ0, B.felt_orange);
    fill(96, FLOOR + 2, HZ0, 100, FLOOR + 3, HZ0, B.tv);
    for (const x of [80, 86, 96, 102]) {
      set(x, FLOOR, 10, B.table);
      chair(x - 1, 10);
      chair(x + 1, 10);
    }
    plantPair(LOB_X0 + 1, PAN_Z1);
    plantPair(LOB_X1 - 1, PAN_Z1);
    fill(75, FLOOR + 1, PAN_Z0, 75, FLOOR + 3, PAN_Z0, B.corkboard);
    poi({
      id: "pantry-board",
      label: "Break room board",
      sublabel: "today's blocks · who is on shift",
      panel: "timetable",
      min: { x: 75, y: FLOOR + 1, z: PAN_Z0 },
      max: { x: 76, y: FLOOR + 4, z: PAN_Z0 + 1 },
    });
    region({
      key: "pantry",
      label: "Pantry",
      roomId: null,
      min: { x: LOB_X0, y: FLOOR, z: PAN_Z0 },
      max: { x: LOB_X1 + 1, y: CEIL + 1, z: PAN_Z1 + 1 },
    });
  };

  // --- west side -----------------------------------------------------------

  const buildConferenceHall = (): void => {
    const name = roomName("Conference Hall", "common-board");
    room({
      key: "conference",
      label: name,
      x0: WX0,
      z0: BAND1_Z0,
      x1: WX1,
      z1: BAND1_Z1,
      floorId: B.carpet_blue,
      frontX: W_FRONT,
      reader: "e",
      doors: [{ z: 28, text: "CONFERENCE HALL" }],
      roomId: roomId("common-board"),
    });

    // Presentation wall at the far (west) end, lectern in front of it.
    fill(WX0 - 1, FLOOR, 20, WX0 - 1, CEIL - 1, 38, B.drywall_accent);
    fill(WX0 - 1, FLOOR + 1, 26, WX0 - 1, FLOOR + 3, 31, B.tv);
    fill(WX0 - 1, FLOOR + 1, 22, WX0 - 1, FLOOR + 3, 25, B.felt);
    fill(WX0 - 1, FLOOR + 1, 32, WX0 - 1, FLOOR + 3, 35, B.felt);
    set(18, FLOOR, 29, B.desk_dark);
    set(18, FLOOR + 1, 29, B.monitor);
    poi({
      id: "lectern",
      label: "Speaker's lectern",
      sublabel: "call a meeting · post announcements",
      panel: "conference",
      refId: "compose",
      min: { x: 18, y: FLOOR + 1, z: 29 },
      max: { x: 19, y: FLOOR + 2, z: 30 },
    });

    meetingTable(36, 29, 49, 29);
    for (const z of [26, 32]) meetingTable(38, z, 47, z);

    // Announcement board and the room's mission board on the north wall.
    fill(20, FLOOR + 1, BAND1_Z0 - 1, 25, FLOOR + 3, BAND1_Z0 - 1, B.corkboard);
    sign("ANNOUNCEMENTS", 22.5, FLOOR + 4.3, BAND1_Z0 - 0.05, "s", 0.8);
    poi({
      id: "announce-board",
      label: "Announcement board",
      sublabel: "what the whole floor needs to know",
      panel: "conference",
      min: { x: 20, y: FLOOR + 1, z: BAND1_Z0 - 1 },
      max: { x: 26, y: FLOOR + 4, z: BAND1_Z0 },
    });
    fill(70, FLOOR + 1, BAND1_Z0 - 1, 73, FLOOR + 3, BAND1_Z0 - 1, B.corkboard);
    missionBoard(
      "conference",
      name,
      { x: 70, y: FLOOR + 1, z: BAND1_Z0 - 1 },
      { x: 74, y: FLOOR + 4, z: BAND1_Z0 },
      "common-board",
    );

    // Whiteboard, breakout desks and greenery.
    fill(60, FLOOR + 1, BAND1_Z1 + 1, 63, FLOOR + 3, BAND1_Z1 + 1, B.whiteboard);
    workstation(66, 40, "n", {
      id: "conference-pc",
      label: "Conference terminal",
      sublabel: "sit down and work · opens the meeting log",
      panel: "conference",
    });
    deskCluster(70, 36, 3, "n", "x");
    deskCluster(54, 18, 4, "s", "x", 3);
    fill(52, FLOOR + 1, BAND1_Z1 + 1, 57, FLOOR + 3, BAND1_Z1 + 1, B.felt_teal);
    for (const [x, z] of [
      [16, 16],
      [80, 16],
      [16, 42],
      [80, 42],
      [30, 20],
      [66, 24],
    ] as const)
      plantPair(x, z);
  };

  const buildVideoBay = (): void => {
    const name = roomName("Video Editing Bay", "video-editing");
    room({
      key: "video",
      label: name,
      x0: WX0,
      z0: BAND2_Z0,
      x1: WX1,
      z1: BAND2_Z1,
      floorId: B.carpet_gray,
      frontX: W_FRONT,
      reader: "e",
      doors: [{ z: 60, text: "VIDEO EDITING BAY" }],
      roomId: roomId("video-editing"),
    });

    // Three edit suites along the north wall: desk pair, twin monitors, chair.
    const suites: Tool[] = [
      {
        id: "video-pc-1",
        label: "Edit bay workstation 1",
        sublabel: "sit down and work · opens the edit queue",
        panel: "video",
      },
      {
        id: "video-pc-2",
        label: "Edit bay workstation 2",
        sublabel: "sit down and work · opens the edit queue",
        panel: "video",
      },
      {
        id: "video-pc-3",
        label: "Edit bay workstation 3",
        sublabel: "sit down and work · opens the edit queue",
        panel: "video",
      },
    ];
    suites.forEach((tool, i) => {
      const x = 22 + i * 18;
      workstation(x, BAND2_Z0 + 1, "s", tool);
      set(x + 1, FLOOR, BAND2_Z0 + 1, B.desk);
      set(x + 1, FLOOR + 1, BAND2_Z0 + 1, B.monitor);
      fill(x - 1, FLOOR + 1, BAND2_Z0 - 1, x + 2, FLOOR + 3, BAND2_Z0 - 1, B.felt_teal);
    });

    // The queue wall: 8 x 3 of whiteboard, and a screen showing the render.
    fill(30, FLOOR + 1, BAND2_Z1 + 1, 37, FLOOR + 3, BAND2_Z1 + 1, B.whiteboard);
    sign("IN THE QUEUE", 33.5, FLOOR + 4.3, BAND2_Z1 + 1.05, "n", 1);
    fill(WX0 - 1, FLOOR + 2, 60, WX0 - 1, FLOOR + 3, 63, B.tv);
    poi({
      id: "video-suites",
      label: "Edit bay workstation",
      sublabel: "queue · timers · what's rendering now",
      panel: "video",
      min: { x: WX0 - 1, y: FLOOR + 2, z: 60 },
      max: { x: WX0, y: FLOOR + 4, z: 64 },
    });

    // Script corner.
    workstation(70, 70, "n", {
      id: "script-pc",
      label: "Script terminal",
      sublabel: "sit down and work · opens the script docs",
      panel: "docs",
    });
    set(72, FLOOR, 70, B.desk_dark);
    set(72, FLOOR + 1, 70, B.monitor);
    poi({
      id: "script-terminal",
      label: "Script terminal",
      sublabel: "write & copy the script",
      panel: "docs",
      min: { x: 72, y: FLOOR + 1, z: 70 },
      max: { x: 73, y: FLOOR + 2, z: 71 },
    });
    fill(66, FLOOR + 1, BAND2_Z1 + 1, 69, FLOOR + 3, BAND2_Z1 + 1, B.books);

    fill(52, FLOOR + 1, BAND2_Z1 + 1, 55, FLOOR + 3, BAND2_Z1 + 1, B.corkboard);
    missionBoard(
      "video",
      name,
      { x: 52, y: FLOOR + 1, z: BAND2_Z1 + 1 },
      { x: 56, y: FLOOR + 4, z: BAND2_Z1 + 2 },
      "video-editing",
    );
    deskCluster(44, 70, 3, "n", "x");
    deskCluster(22, 74, 5, "n", "x", 3);
    for (const [x, z] of [
      [16, 76],
      [80, 50],
      [80, 76],
      [40, 52],
      [62, 52],
    ] as const)
      plantPair(x, z);
  };

  const buildCreativeStudio = (): void => {
    const name = roomName("Creative Studio", "creative");
    room({
      key: "creative",
      label: name,
      x0: WX0,
      z0: BAND3_Z0,
      x1: WX1,
      z1: BAND3_Z1,
      floorId: B.carpet_green,
      frontX: W_FRONT,
      reader: "e",
      doors: [
        { z: 87, text: "CREATIVE — INTERNAL" },
        { z: 103, text: "CREATIVE — CLIENTS" },
      ],
      roomId: roomId("creative"),
    });
    // A partition splits the studio into two wings, each with its own door.
    fill(WX0, FLOOR, 97, WX1, CEIL, 97, B.drywall);
    fill(WX0, FLOOR + 1, 97, WX0 + 30, FLOOR + 3, 97, B.felt_teal);

    // Internal wing (north).
    fill(WX0 - 1, FLOOR + 1, 84, WX0 - 1, FLOOR + 3, 88, B.whiteboard);
    workstation(20, 90, "e", {
      id: "creative-pc-internal",
      label: "Internal creative desk",
      sublabel: "sit down and work · opens the internal brief queue",
      panel: "creative",
      refId: "internal",
    });
    deskCluster(24, 90, 4, "e", "x", 3);
    deskCluster(50, 86, 4, "s", "x", 3);
    fill(WX0, FLOOR + 1, BAND3_Z0 - 1, WX0 + 3, FLOOR + 3, BAND3_Z0 - 1, B.books);
    fill(30, FLOOR + 1, BAND3_Z0 - 1, 34, FLOOR + 3, BAND3_Z0 - 1, B.corkboard);
    poi({
      id: "creative-internal",
      label: "Internal wing",
      sublabel: "briefs the crew writes for itself",
      panel: "creative",
      refId: "internal",
      min: { x: 30, y: FLOOR + 1, z: BAND3_Z0 - 1 },
      max: { x: 35, y: FLOOR + 4, z: BAND3_Z0 },
    });
    fill(60, FLOOR + 1, BAND3_Z0 - 1, 63, FLOOR + 3, BAND3_Z0 - 1, B.corkboard);
    missionBoard(
      "creative",
      name,
      { x: 60, y: FLOOR + 1, z: BAND3_Z0 - 1 },
      { x: 64, y: FLOOR + 4, z: BAND3_Z0 },
      "creative",
    );
    region({
      key: "creative-internal",
      label: `${name} — Internal`,
      roomId: null,
      min: { x: WX0, y: FLOOR, z: BAND3_Z0 },
      max: { x: WX1 + 1, y: CEIL + 1, z: 97 },
    });

    // Clients wing (south).
    fill(WX0 - 1, FLOOR + 1, 104, WX0 - 1, FLOOR + 3, 108, B.whiteboard);
    workstation(20, 106, "e", {
      id: "creative-pc-clients",
      label: "Client creative desk",
      sublabel: "sit down and work · opens the client brief queue",
      panel: "creative",
      refId: "clients",
    });
    deskCluster(24, 106, 4, "e", "x", 3);
    deskCluster(50, 108, 4, "n", "x", 3);
    fill(WX0, FLOOR + 1, BAND3_Z1 + 1, WX0 + 3, FLOOR + 3, BAND3_Z1 + 1, B.books);
    fill(30, FLOOR + 1, BAND3_Z1 + 1, 34, FLOOR + 3, BAND3_Z1 + 1, B.corkboard);
    fill(40, FLOOR + 1, BAND3_Z1 + 1, 46, FLOOR + 3, BAND3_Z1 + 1, B.felt_orange);
    poi({
      id: "creative-clients",
      label: "Clients wing",
      sublabel: "briefs the clients are waiting on",
      panel: "creative",
      refId: "clients",
      min: { x: 30, y: FLOOR + 1, z: BAND3_Z1 + 1 },
      max: { x: 35, y: FLOOR + 4, z: BAND3_Z1 + 2 },
    });
    region({
      key: "creative-clients",
      label: `${name} — Clients`,
      roomId: null,
      min: { x: WX0, y: FLOOR, z: 98 },
      max: { x: WX1 + 1, y: CEIL + 1, z: BAND3_Z1 + 1 },
    });

    sign("INTERNAL", W_FRONT + 1.05, FLOOR + 4.4, 92, "e", 0.8);
    sign("CLIENTS", W_FRONT + 1.05, FLOOR + 4.4, 108, "e", 0.8);
    for (const [x, z] of [
      [16, 84],
      [80, 84],
      [16, 110],
      [80, 110],
    ] as const)
      plantPair(x, z);
  };

  const buildShootStudio = (): void => {
    const name = roomName("Shoot Studio", "shoot", "creativity");
    space(WX0, BAND4_Z0, SHOOT_X1, BAND4_Z1, B.concrete);
    glazedFrontX(SHOOT_FRONT, BAND4_Z0, BAND4_Z1);
    doorX(SHOOT_FRONT, 124, "e", "SHOOT STUDIO");
    // The lobby's wall display hangs on the back of this shopfront.
    fill(SHOOT_FRONT, FLOOR + 2, 119, SHOOT_FRONT, FLOOR + 3, 122, B.tv);

    // Coved cyclorama corner, green screen, felt baffles, extra lighting.
    for (let d = 0; d <= 4; d++)
      fill(WX0 + d, FLOOR, BAND4_Z0, WX0 + d, CEIL - 1, BAND4_Z0 + (4 - d), B.drywall);
    fill(30, FLOOR, HZ1, 37, FLOOR + 4, HZ1, B.facade_green);
    sign("GREEN SCREEN", 33.5, FLOOR + 5.3, HZ1 - 0.05, "n", 0.8);
    for (let x = WX0 + 2; x <= SHOOT_X1 - 2; x += 4)
      for (let z = BAND4_Z0 + 2; z <= BAND4_Z1 - 2; z += 4)
        set(x, CEIL, z, B.ceiling_light);
    for (const z of [120, 126, 132]) {
      fill(WX0 - 1, FLOOR + 2, z, WX0 - 1, FLOOR + 4, z + 1, B.felt);
      fill(SHOOT_FRONT, FLOOR + 5, z, SHOOT_FRONT, FLOOR + 5, z + 1, B.felt);
    }

    // Camera rig: metal column, monitor at eye height.
    fill(34, FLOOR, 126, 34, FLOOR + 1, 126, B.metal);
    set(34, FLOOR + 2, 126, B.monitor);
    set(35, FLOOR, 126, B.metal);
    poi({
      id: "camera-rig",
      label: "Camera rig",
      sublabel: "this week's call sheet · indoor/outdoor",
      panel: "shoot",
      min: { x: 34, y: FLOOR + 2, z: 126 },
      max: { x: 35, y: FLOOR + 3, z: 127 },
    });
    workstation(44, 130, "n", {
      id: "shoot-pc",
      label: "Shoot desk",
      sublabel: "sit down and work · opens the call sheet",
      panel: "shoot",
    });
    deskCluster(48, 130, 3, "n", "x");
    fill(56, FLOOR + 1, BAND4_Z0 - 1, 59, FLOOR + 3, BAND4_Z0 - 1, B.corkboard);
    missionBoard(
      "shoot",
      name,
      { x: 56, y: FLOOR + 1, z: BAND4_Z0 - 1 },
      { x: 60, y: FLOOR + 4, z: BAND4_Z0 },
      "shoot",
      "creativity",
    );
    fill(64, FLOOR + 1, BAND4_Z0 - 1, 67, FLOOR + 3, BAND4_Z0 - 1, B.whiteboard);
    plantPair(SHOOT_X1 - 1, BAND4_Z1 - 1);
    plantPair(SHOOT_X1 - 1, BAND4_Z0 + 1);

    // The studio was one 59-block hall with a single rig in it. Split the east
    // third into a glazed control room and a kit store so the space has rooms
    // with jobs, and so the studio floor itself reads as a set rather than a
    // warehouse.
    const CTRL_X = 54; // partition between studio floor and control room
    fill(CTRL_X, FLOOR, BAND4_Z0, CTRL_X, CEIL - 1, BAND4_Z1, B.drywall);
    // Glazed observation strip looking onto the set, with a doorway.
    fill(CTRL_X, FLOOR + 1, BAND4_Z0 + 2, CTRL_X, FLOOR + 3, BAND4_Z0 + 6, B.glass);
    carve(CTRL_X, FLOOR, BAND4_Z0 + 9, CTRL_X, FLOOR + 2, BAND4_Z0 + 11);
    sign("CONTROL ROOM", CTRL_X + 1.05, FLOOR + 3.4, BAND4_Z0 + 10, "e", 0.7);

    // Control room: a desk wall of monitors that opens the call sheet.
    space(CTRL_X + 1, BAND4_Z0, 62, BAND4_Z1, B.carpet_gray);
    fill(CTRL_X + 2, FLOOR, BAND4_Z0 + 3, CTRL_X + 6, FLOOR, BAND4_Z0 + 3, B.desk_dark);
    for (let x = CTRL_X + 2; x <= CTRL_X + 6; x++) set(x, FLOOR + 1, BAND4_Z0 + 3, B.monitor);
    chair(CTRL_X + 3, BAND4_Z0 + 4);
    chair(CTRL_X + 5, BAND4_Z0 + 4);
    set(CTRL_X + 2, FLOOR, BAND4_Z0 + 5, B.cpu);
    set(CTRL_X + 6, FLOOR, BAND4_Z0 + 5, B.cpu);
    poi({
      id: "shoot-control",
      label: "Control desk",
      sublabel: "monitor the shoot · indoor/outdoor filters",
      panel: "shoot",
      min: { x: CTRL_X + 2, y: FLOOR + 1, z: BAND4_Z0 + 3 },
      max: { x: CTRL_X + 7, y: FLOOR + 2, z: BAND4_Z0 + 4 },
    });

    // Kit store: shelves of gear behind the control room.
    fill(63, FLOOR, BAND4_Z0, 63, CEIL - 1, BAND4_Z1, B.drywall);
    carve(63, FLOOR, BAND4_Z0 + 4, 63, FLOOR + 2, BAND4_Z0 + 6);
    sign("KIT STORE", 63 + 1.05, FLOOR + 3.4, BAND4_Z0 + 5, "e", 0.65);
    space(64, BAND4_Z0, SHOOT_X1, BAND4_Z1, B.concrete);
    for (let z = BAND4_Z0 + 1; z <= BAND4_Z1 - 1; z += 2) {
      fill(64, FLOOR, z, 64, FLOOR + 2, z, B.books);
      set(SHOOT_X1 - 1, FLOOR, z, B.book_stack);
    }
    set(66, FLOOR, BAND4_Z0 + 3, B.tripod);
    set(66, FLOOR + 1, BAND4_Z0 + 3, B.camera);
    set(68, FLOOR, BAND4_Z0 + 7, B.tripod);
    set(68, FLOOR + 1, BAND4_Z0 + 7, B.softbox);
    set(66, FLOOR, BAND4_Z0 + 10, B.mic);
    poi({
      id: "shoot-kit",
      label: "Kit shelf",
      sublabel: "cameras, lights and what's booked out",
      panel: "shoot",
      min: { x: 64, y: FLOOR, z: BAND4_Z0 + 1 },
      max: { x: 65, y: FLOOR + 3, z: BAND4_Z1 },
    });

    // Dress the set itself so the floor isn't bare concrete.
    set(28, FLOOR, 128, B.clapboard);
    set(40, FLOOR, 122, B.tripod);
    set(40, FLOOR + 1, 122, B.softbox);
    set(40, FLOOR, 131, B.tripod);
    set(40, FLOOR + 1, 131, B.softbox);
    set(45, FLOOR, 124, B.mic);
    plantPair(WX0 + 6, BAND4_Z1 - 1);
    plantPair(50, BAND4_Z0 + 1);
    region({
      key: "shoot",
      label: name,
      roomId: roomId("shoot", "creativity"),
      min: { x: WX0, y: FLOOR, z: BAND4_Z0 },
      max: { x: SHOOT_X1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });
  };

  // --- east side -----------------------------------------------------------

  const buildDevWing = (): void => {
    const name = roomName("Dev Wing", "developer");
    room({
      key: "dev-wing",
      label: name,
      x0: EX0,
      z0: BAND1_Z0,
      x1: EX1,
      z1: BAND1_Z1,
      floorId: B.marble,
      frontX: E_FRONT,
      reader: "w",
      doors: [{ z: 26, text: "DEV WING" }],
      roomId: roomId("developer"),
    });

    // Two lift banks on the east wall, one per tower, with floor directories.
    TOWERS.forEach((t, i) => {
      const z = 20 + i * 10;
      fill(EX1 + 1, FLOOR, z, EX1 + 1, FLOOR + 2, z + 1, B.elevator);
      fill(EX1 + 1, FLOOR + 3, z - 1, EX1 + 1, FLOOR + 3, z + 2, B.sign);
      fill(EX1 + 1, FLOOR + 1, z - 3, EX1 + 1, FLOOR + 3, z - 2, B.corkboard);
      sign(t.label.toUpperCase(), EX1 + 0.95, FLOOR + 3.5, z + 1, "w", 0.9);
      poi({
        id: `lift-${t.key}`,
        label: `${t.label} lift`,
        sublabel: "10 floors · one project per floor",
        panel: "rift",
        teleportTo: { x: t.arrival, y: floorPlate(1) + 1, z: 29.5 },
        teleportYaw: YAW[t.innerFace],
        min: { x: EX1 + 1, y: FLOOR, z },
        max: { x: EX1 + 2, y: FLOOR + 3, z: z + 2 },
      });
      plantPair(EX1 - 1, z + 4);
    });

    // Server room behind glass, with a walk-in gap.
    for (const x of [102, 105, 108, 111]) {
      fill(x, FLOOR, 16, x, FLOOR + 1, 16, B.server_rack);
      set(x, FLOOR, 17, B.metal);
    }
    fill(100, FLOOR, 19, 113, FLOOR + 3, 19, B.glass);
    carve(106, FLOOR, 19, 108, FLOOR + 2, 19);
    sign("SERVER ROOM", 106.5, FLOOR + 4.3, 19.05, "s", 0.8);

    // Internal tools desk.
    workstation(120, 34, "n", {
      id: "dev-pc",
      label: "Internal tools desk",
      sublabel: "sit down and work · opens the internal tools",
      panel: "city",
      refId: "tools",
    });
    set(122, FLOOR, 34, B.desk);
    set(122, FLOOR + 1, 34, B.monitor);
    poi({
      id: "tools-bungalow",
      label: "Internal tools desk",
      sublabel: "everything the crew built for itself",
      panel: "city",
      refId: "tools",
      min: { x: 122, y: FLOOR + 1, z: 34 },
      max: { x: 123, y: FLOOR + 2, z: 35 },
    });
    deskCluster(126, 34, 4, "n", "x", 3);
    deskCluster(104, 40, 6, "n", "x", 3);

    fill(140, FLOOR + 1, BAND1_Z1 + 1, 143, FLOOR + 3, BAND1_Z1 + 1, B.corkboard);
    missionBoard(
      "dev-wing",
      name,
      { x: 140, y: FLOOR + 1, z: BAND1_Z1 + 1 },
      { x: 144, y: FLOOR + 4, z: BAND1_Z1 + 2 },
      "developer",
    );
    fill(148, FLOOR + 1, BAND1_Z1 + 1, 152, FLOOR + 3, BAND1_Z1 + 1, B.whiteboard);
    fill(100, FLOOR + 1, BAND1_Z1 + 1, 104, FLOOR + 3, BAND1_Z1 + 1, B.felt_teal);
    plantPair(EX0 + 1, BAND1_Z0 + 1);
    plantPair(EX0 + 1, BAND1_Z1 - 1);
  };

  const buildTaskHall = (): void => {
    const name = roomName("Task Hall", "tasks");
    room({
      key: "tasks",
      label: name,
      x0: EX0,
      z0: BAND2_Z0,
      x1: EX1,
      z1: BAND2_Z1,
      floorId: B.carpet_gray,
      frontX: E_FRONT,
      reader: "w",
      doors: [{ z: 60, text: "TASK HALL" }],
      roomId: roomId("tasks"),
    });

    // Six workstations in two rows; two of them are live task terminals.
    workstation(104, 54, "s", {
      id: "task-pc-1",
      label: "Task terminal 1",
      sublabel: "sit down and work · opens your missions",
      panel: "tasks",
    });
    workstation(104, 64, "s", {
      id: "task-pc-2",
      label: "Task terminal 2",
      sublabel: "sit down and work · opens your missions",
      panel: "tasks",
    });
    deskCluster(110, 54, 2, "s", "x", 6);
    deskCluster(110, 64, 2, "s", "x", 6);

    // TO DO / DOING / DONE.
    const columns: [number, string][] = [
      [100, "TO DO"],
      [108, "DOING"],
      [116, "DONE"],
    ];
    for (const [x, text] of columns) {
      fill(x, FLOOR + 1, BAND2_Z0 - 1, x + 3, FLOOR + 3, BAND2_Z0 - 1, B.whiteboard);
      sign(text, x + 2, FLOOR + 4.3, BAND2_Z0 - 0.05, "s", 0.8);
    }
    poi({
      id: "task-wall",
      label: "Task wall",
      sublabel: "your missions & squad work",
      panel: "tasks",
      min: { x: 108, y: FLOOR + 1, z: BAND2_Z0 - 1 },
      max: { x: 112, y: FLOOR + 4, z: BAND2_Z0 },
    });
    fill(124, FLOOR + 1, BAND2_Z0 - 1, 127, FLOOR + 3, BAND2_Z0 - 1, B.corkboard);
    missionBoard(
      "tasks",
      name,
      { x: 124, y: FLOOR + 1, z: BAND2_Z0 - 1 },
      { x: 128, y: FLOOR + 4, z: BAND2_Z0 },
      "tasks",
    );

    // Client booths along the hall's east strip: one per client, first four.
    clients.slice(0, 4).forEach((client, i) => {
      const z0 = 50 + i * 6;
      fill(126, FLOOR, z0, 126, FLOOR + 2, z0 + 3, B.felt);
      fill(127, FLOOR, z0 + 1, 127, FLOOR, z0 + 2, B.desk);
      set(127, FLOOR + 1, z0 + 1, B.monitor);
      chair(128, z0 + 1);
      sign(client.name, 127.05, FLOOR + 3.2, z0 + 1.5, "e", 0.7);
      poi({
        id: `client-${client.id}`,
        label: client.name,
        sublabel: "client missions",
        panel: "client",
        refId: client.id,
        min: { x: 127, y: FLOOR + 1, z: z0 + 1 },
        max: { x: 128, y: FLOOR + 2, z: z0 + 2 },
      });
      region({
        key: `client-${client.id}`,
        label: client.name,
        roomId: client.id,
        min: { x: 126, y: FLOOR, z: z0 },
        max: { x: 131, y: CEIL + 1, z: z0 + 4 },
      });
    });

    deskCluster(140, 54, 4, "s", "x", 4);
    deskCluster(140, 64, 4, "s", "x", 4);
    deskCluster(104, 74, 6, "n", "x", 3);
    fill(160, FLOOR + 1, BAND2_Z1 + 1, 164, FLOOR + 3, BAND2_Z1 + 1, B.felt_teal);
    plantPair(EX0 + 1, BAND2_Z0 + 1);
    plantPair(EX1 - 1, BAND2_Z1 - 1);
    plantPair(134, 70);
  };

  const buildOutreach = (): void => {
    const name = roomName("Outreach Office", "outreach", "client");
    room({
      key: "outreach",
      label: name,
      x0: EX0,
      z0: BAND3_Z0,
      x1: EX1,
      z1: BAND3_Z1,
      floorId: B.carpet_red,
      frontX: E_FRONT,
      reader: "w",
      doors: [{ z: 94, text: "OUTREACH OFFICE" }],
      roomId: roomId("outreach", "client"),
    });

    // Sector map on the east wall, four call desks facing it.
    fill(EX1 + 1, FLOOR + 1, 92, EX1 + 1, FLOOR + 4, 99, B.tv);
    sign("SECTOR MAP", EX1 + 0.95, FLOOR + 5.3, 95.5, "w", 0.9);
    workstation(145, 90, "e", {
      id: "outreach-pc-1",
      label: "Outreach desk 1",
      sublabel: "sit down and work · opens the day plan",
      panel: "outreach",
    });
    workstation(145, 96, "e", {
      id: "outreach-pc-2",
      label: "Outreach desk 2",
      sublabel: "sit down and work · opens the day plan",
      panel: "outreach",
    });
    workstation(145, 102, "e");
    workstation(145, 108, "e");
    poi({
      id: "outreach-desks",
      label: "Outreach desk",
      sublabel: "day plan · sectors · lead OTP",
      panel: "outreach",
      min: { x: EX1 + 1, y: FLOOR + 1, z: 92 },
      max: { x: EX1 + 2, y: FLOOR + 5, z: 100 },
    });

    fill(110, FLOOR + 1, BAND3_Z0 - 1, 115, FLOOR + 3, BAND3_Z0 - 1, B.corkboard);
    sign("SECTORS", 112.5, FLOOR + 4.3, BAND3_Z0 - 0.05, "s", 0.8);
    fill(122, FLOOR + 1, BAND3_Z0 - 1, 125, FLOOR + 3, BAND3_Z0 - 1, B.corkboard);
    missionBoard(
      "outreach",
      name,
      { x: 122, y: FLOOR + 1, z: BAND3_Z0 - 1 },
      { x: 126, y: FLOOR + 4, z: BAND3_Z0 },
      "outreach",
      "client",
    );
    fill(100, FLOOR + 1, BAND3_Z1 + 1, 104, FLOOR + 3, BAND3_Z1 + 1, B.whiteboard);
    deskCluster(104, 90, 4, "n", "x", 3);
    deskCluster(104, 104, 6, "n", "x", 3);
    fill(130, FLOOR + 1, BAND3_Z1 + 1, 135, FLOOR + 3, BAND3_Z1 + 1, B.felt_orange);
    plantPair(EX0 + 1, BAND3_Z0 + 1);
    plantPair(EX0 + 1, BAND3_Z1 - 1);
    plantPair(160, 108);
  };

  const buildManagingHeads = (): void => {
    const name = roomName("Managing Heads", "managing-heads");
    space(MH_X0, BAND4_Z0, EX1, BAND4_Z1, B.carpet_blue);
    // Warm walls; a glazed front onto the lobby with the approvals door.
    fill(EX1 + 1, FLOOR, BAND4_Z0, EX1 + 1, CEIL - 1, BAND4_Z1, B.drywall_warm);
    fill(MH_X0, FLOOR, BAND4_Z0 - 1, EX1, CEIL - 1, BAND4_Z0 - 1, B.drywall_warm);
    // Glazed either side of the lobby's timetable alcove, which owns z120..128.
    glazedFrontX(MH_FRONT, BAND4_Z0, 119);
    glazedFrontX(MH_FRONT, 129, BAND4_Z1);
    doorX(MH_FRONT, 129, "w", "MANAGING HEADS");

    // Approvals counter with two terminals and visitor seating.
    fill(112, FLOOR, 124, 116, FLOOR, 124, B.desk);
    set(116, FLOOR + 1, 124, B.monitor);
    workstation(113, 124, "n", {
      id: "approvals-pc",
      label: "Approvals counter",
      sublabel: "sit down and work · opens leave & sign-offs",
      panel: "approvals",
    });
    chair(115, 123);
    chair(114, 126);
    chair(116, 126);
    set(115, FLOOR, 126, B.table);
    poi({
      id: "approvals-desk",
      label: "Approvals counter",
      sublabel: "leave · sign-offs · queries",
      panel: "approvals",
      min: { x: 116, y: FLOOR + 1, z: 124 },
      max: { x: 117, y: FLOOR + 2, z: 125 },
    });
    fill(118, FLOOR, BAND4_Z0 - 1, 121, FLOOR + 2, BAND4_Z0 - 1, B.books);
    fill(124, FLOOR + 1, BAND4_Z0 - 1, 127, FLOOR + 3, BAND4_Z0 - 1, B.corkboard);
    missionBoard(
      "managing-heads",
      name,
      { x: 124, y: FLOOR + 1, z: BAND4_Z0 - 1 },
      { x: 128, y: FLOOR + 4, z: BAND4_Z0 },
      "managing-heads",
    );
    deskCluster(132, 130, 4, "n", "x", 4);
    plantPair(MH_X0 + 1, BAND4_Z1 - 1);
    plantPair(150, BAND4_Z1 - 1);

    // The rift room: frosted glass, restricted, admin door to the Upside Down.
    fill(157, FLOOR, 119, 157, CEIL, 131, B.glass_frosted);
    fill(158, FLOOR, 119, EX1, CEIL, 119, B.glass_frosted);
    fill(158, FLOOR, 131, EX1, CEIL, 131, B.glass_frosted);
    carve(158, FLOOR, 120, EX1, CEIL - 1, 130);
    fill(158, SLAB, 120, EX1, SLAB, 130, B.obsidian);
    ceilingOver(158, 120, EX1, 130, CEIL);
    carve(157, FLOOR, 124, 157, FLOOR + 2, 126);
    fill(157, FLOOR + 3, 124, 157, FLOOR + 3, 126, B.sign);
    sign("B1 — RESTRICTED", 156.95, FLOOR + 3.5, 125.5, "w", 0.8, {
      color: "#ffd7d7",
      bg: "#3a1414",
    });

    // 5x5 obsidian ring, glowing 3x3 centre, vine columns.
    fill(EX1 + 1, FLOOR, 123, EX1 + 1, FLOOR + 4, 127, B.obsidian);
    fill(EX1 + 1, FLOOR + 1, 124, EX1 + 1, FLOOR + 3, 126, B.lair_glow);
    fill(EX1, FLOOR, 122, EX1, FLOOR + 4, 122, B.lair_vine);
    fill(EX1, FLOOR, 128, EX1, FLOOR + 4, 128, B.lair_vine);
    poi({
      id: "rift-in",
      label: "Enter the rift",
      sublabel: "The Upside Down — admins only",
      panel: "rift",
      adminOnly: true,
      teleportTo: { ...RIFT_LAIR },
      teleportYaw: YAW.s,
      min: { x: EX1 + 1, y: FLOOR + 1, z: 124 },
      max: { x: EX1 + 2, y: FLOOR + 4, z: 127 },
    });

    region({
      key: "managing-heads",
      label: name,
      roomId: roomId("managing-heads"),
      min: { x: MH_X0, y: FLOOR, z: BAND4_Z0 },
      max: { x: EX1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });
  };

  // --- the towers ----------------------------------------------------------

  const buildTower = (
    t: Tower,
    projects: { id: string; name: string }[],
  ): void => {
    const top = floorPlate(FLOORS) + 6;
    fill(t.x0, ROOF + 1, TZ0, t.x1, top, TZ1, t.facade);
    fill(t.x0, top + 1, TZ0, t.x1, top + 1, TZ1, B.roof);
    const ix0 = t.x0 + 1;
    const ix1 = t.x1 - 1;
    const iz0 = TZ0 + 1;
    const iz1 = TZ1 - 1;
    const outward = t.innerFace === "w" ? t.x0 : t.x1;

    for (let n = 1; n <= FLOORS; n++) {
      const plate = floorPlate(n);
      const project = projects[n - 1];
      const label = `${t.label} — Floor ${n} · ${project ? project.name : "Available"}`;
      carve(ix0, plate, iz0, ix1, plate + 5, iz1);
      fill(ix0, plate, iz0, ix1, plate, iz1, project ? t.carpet : B.concrete);
      // Trim border round the plate so the floor reads as a fitted deck.
      fill(ix0, plate, iz0, ix1, plate, iz0, B.trim);
      fill(ix0, plate, iz1, ix1, plate, iz1, B.trim);
      fill(ix0, plate, iz0, ix0, plate, iz1, B.trim);
      fill(ix1, plate, iz0, ix1, plate, iz1, B.trim);

      if (project) {
        ceilingOver(ix0, iz0, ix1, iz1, plate + 5);
      } else {
        // Fit-out in progress: open frame, lights hung off the studs.
        ceilingOver(ix0, iz0, ix1, iz1, plate + 5, false);
        for (let x = ix0 + 3; x <= ix1 - 3; x += 5)
          fill(x, plate + 1, iz0 + 3, x, plate + 4, iz0 + 3, B.metal);
        for (let z = iz0 + 3; z <= iz1 - 3; z += 6)
          fill(ix0 + 2, plate + 1, z, ix0 + 2, plate + 4, z, B.metal);
      }

      // Curtain wall on the outward face, so the floor has a view.
      for (let z = iz0 + 1; z <= iz1 - 1; z++)
        if (z % 6 !== 0)
          fill(outward, plate + 1, z, outward, plate + 3, z, B.curtain_wall);

      // Lift doors on the inner wall: up bank north, down bank south.
      fill(t.inner, plate + 1, 26, t.inner, plate + 3, 27, B.elevator);
      fill(t.inner, plate + 1, 30, t.inner, plate + 3, 31, B.elevator);
      fill(t.inner, plate + 4, 26, t.inner, plate + 4, 31, B.sign);
      const signX = t.innerFace === "w" ? t.inner - 0.05 : t.inner + 1.05;
      sign(`FLOOR ${n}`, signX, plate + 4.5, 28.5, t.innerFace, 1);

      const up: Vec3 =
        n < FLOORS
          ? { x: t.arrival, y: floorPlate(n + 1) + 1, z: 29.5 }
          : { ...LIFT_LOBBY };
      const down: Vec3 =
        n > 1
          ? { x: t.arrival, y: floorPlate(n - 1) + 1, z: 29.5 }
          : { ...LIFT_LOBBY };
      poi({
        id: `lift-${t.key}-${n}`,
        label: n < FLOORS ? `Lift — floor ${n + 1}` : "Lift — Dev Wing lobby",
        sublabel: `${t.label} · going up`,
        panel: "rift",
        teleportTo: up,
        teleportYaw: n < FLOORS ? YAW[t.innerFace] : YAW.w,
        min: { x: t.inner, y: plate + 1, z: 26 },
        max: { x: t.inner + 1, y: plate + 4, z: 28 },
      });
      poi({
        id: `lift-down-${t.key}-${n}`,
        label: n > 1 ? `Lift — floor ${n - 1}` : "Lift — Dev Wing lobby",
        sublabel: `${t.label} · going down`,
        panel: "rift",
        teleportTo: down,
        teleportYaw: n > 1 ? YAW[t.innerFace] : YAW.w,
        min: { x: t.inner, y: plate + 1, z: 30 },
        max: { x: t.inner + 1, y: plate + 4, z: 32 },
      });

      // The floor's own board, on the north wall.
      const bx = t.x0 + 6;
      fill(bx, plate + 2, TZ0, bx + 3, plate + 4, TZ0, project ? B.whiteboard : B.sign);
      sign(
        project ? `FLOOR ${n} — ${project.name}` : `FLOOR ${n} — FIT-OUT IN PROGRESS`,
        bx + 2,
        plate + 5.3,
        TZ0 + 1.05,
        "s",
        0.9,
      );
      poi({
        id: `city-${t.key}-${n}`,
        label: project ? project.name : `Floor ${n} — available`,
        sublabel: project ? `floor ${n} · project desk` : "no project assigned yet",
        panel: "city",
        refId: project?.id,
        min: { x: bx, y: plate + 2, z: TZ0 },
        max: { x: bx + 4, y: plate + 5, z: TZ0 + 1 },
      });

      if (project) {
        // Four desks with monitors. The ground-floor helpers all assume y1,
        // so the tower lays its own furniture out relative to the plate.
        for (const dx of [6, 12])
          for (const dz of [22, 34]) {
            for (const ox of [0, 1]) {
              set(t.x0 + dx + ox, plate + 1, dz, B.desk);
              set(t.x0 + dx + ox, plate + 2, dz, B.monitor);
            }
            set(t.x0 + dx, plate + 1, dz + 1, B.chair);
          }
        set(t.x0 + 4, plate + 1, iz1 - 1, B.planter);
        set(t.x0 + 4, plate + 2, iz1 - 1, B.plant);
      }

      region({
        key: `floor-${t.key}-${n}`,
        label,
        roomId: null,
        min: { x: ix0, y: plate + 1, z: iz0 },
        max: { x: ix1 + 1, y: plate + 6, z: iz1 + 1 },
      });
    }
  };

  // --- the Upside Down -----------------------------------------------------
  // A sealed box far above the office: only the rift ever puts you in it, so
  // its coordinates are arbitrary — what matters is that nothing connects.

  const buildUpsideDown = (): void => {
    fill(LX0, LY0, LZ0, LX1, LY1, LZ1, B.lair_stone);
    carve(LX0 + 2, LY0 + 1, LZ0 + 2, LX1 - 2, LY1 - 1, LZ1 - 2);
    const cx = (LX0 + LX1) >> 1;
    const cz = (LZ0 + LZ1) >> 1;
    const floorY = LY0;
    const feet = floorY + 1;

    // Vines climbing the shell, glow crystals in the rock.
    for (let x = LX0 + 3; x <= LX1 - 3; x += 4) {
      fill(x, feet, LZ0 + 2, x, feet + 3, LZ0 + 2, B.lair_vine);
      fill(x, feet, LZ1 - 2, x, feet + 3, LZ1 - 2, B.lair_vine);
      if (x % 8 === 3) set(x, feet + 4, LZ0 + 2, B.lair_glow);
    }
    for (let z = LZ0 + 3; z <= LZ1 - 3; z += 4) {
      fill(LX0 + 2, feet, z, LX0 + 2, feet + 3, z, B.lair_vine);
      fill(LX1 - 2, feet, z, LX1 - 2, feet + 3, z, B.lair_vine);
      if (z % 8 === 3) set(LX1 - 2, feet + 4, z, B.lair_glow);
    }
    for (let x = LX0 + 6; x <= LX1 - 6; x += 6)
      for (let z = LZ0 + 6; z <= LZ1 - 6; z += 6) set(x, LY1 - 1, z, B.lair_glow);

    // Vecna's throne on a raised obsidian dais.
    fill(cx - 4, floorY, cz + 8, cx + 4, floorY, cz + 14, B.obsidian);
    fill(cx - 3, feet, cz + 12, cx + 3, feet, cz + 14, B.step);
    fill(cx - 2, feet, cz + 13, cx + 2, feet + 3, cz + 14, B.vecna_flesh);
    fill(cx - 1, feet, cz + 13, cx + 1, feet + 1, cz + 13, B.obsidian);

    // A demogorgon, four blocks of it.
    fill(cx + 8, feet, cz - 4, cx + 8, feet + 3, cz - 4, B.vecna_flesh);
    fill(cx + 7, feet + 2, cz - 4, cx + 9, feet + 2, cz - 4, B.vecna_flesh);
    set(cx + 7, feet + 3, cz - 5, B.lair_vine);
    set(cx + 9, feet + 3, cz - 3, B.lair_vine);

    // Vecna's desk: he watches the floor from here.
    set(cx - 6, feet, cz + 4, B.desk_dark);
    set(cx - 5, feet, cz + 4, B.desk_dark);
    set(cx - 6, feet + 1, cz + 4, B.monitor);
    set(cx - 6, feet, cz + 5, B.chair);
    poi({
      id: "vecna-desk",
      label: "Vecna's Desk",
      sublabel: "watch the floor · send demogorgons",
      panel: "lair",
      min: { x: cx - 6, y: feet + 1, z: cz + 4 },
      max: { x: cx - 5, y: feet + 2, z: cz + 5 },
    });

    // The way back.
    fill(LX0 + 2, feet, cz - 1, LX0 + 2, feet + 4, cz + 1, B.obsidian);
    fill(LX0 + 2, feet + 1, cz, LX0 + 2, feet + 3, cz, B.lair_glow);
    sign("BACK THROUGH THE RIFT", LX0 + 3.05, feet + 5.3, cz + 0.5, "e", 0.9, {
      color: "#ffd7d7",
      bg: "#2a0f0f",
    });
    poi({
      id: "rift-out",
      label: "Back through the rift",
      sublabel: "return to the office",
      panel: "rift",
      teleportTo: { ...RIFT_OFFICE },
      teleportYaw: YAW.e,
      min: { x: LX0 + 2, y: feet + 1, z: cz - 1 },
      max: { x: LX0 + 3, y: feet + 4, z: cz + 2 },
    });

    region({
      key: "lair",
      label: "The Upside Down",
      roomId: null,
      lair: true,
      min: { x: LX0 + 2, y: LY0 + 1, z: LZ0 + 2 },
      max: { x: LX1 - 1, y: LY1, z: LZ1 - 1 },
    });
  };

  // --- forecourt -----------------------------------------------------------

  const buildForecourt = (): void => {
    for (const x of [78, 82, 98, 102]) {
      plantPair(x, HZ1 + 2);
      plantPair(x, HZ1 + 4);
    }
    fill(72, FLOOR, HZ1 + 3, 75, FLOOR + 1, HZ1 + 3, B.sign);
    sign("AUXA — A PLACE TO WORK", 73.5, FLOOR + 1.5, HZ1 + 4.05, "s", 1);
    fill(105, FLOOR, HZ1 + 3, 108, FLOOR + 1, HZ1 + 3, B.sign);
    sign("VISITORS · RECEPTION AHEAD", 106.5, FLOOR + 1.5, HZ1 + 4.05, "s", 1);
    // A marble apron carries the lobby floor out through the doors.
    fill(DOOR_X0 - 4, SLAB, HZ1 + 1, DOOR_X1 + 4, SLAB, HZ1 + 4, B.marble);
    region({
      key: "forecourt",
      label: "Forecourt",
      roomId: null,
      min: { x: 66, y: FLOOR, z: HZ1 + 1 },
      max: { x: 114, y: FLOOR + 4, z: SZ },
    });
  };

  /**
   * Staff and clients. The rooms read as abandoned without people in them —
   * this is what turns a furnished set into a workplace.
   */
  const populate = (): void => {
    // Reception
    npc("npc-reception", "Priya Raghavan", "Front of House", "staff", 86, 127, YAW.s, {
      seated: true,
    });
    npc("npc-lobby-visitor", "Dev Kapoor", "Waiting — 10:30", "staff", 80, 131, YAW.e);

    // Video Editing Bay — editors at the suites, always cutting.
    npc("npc-video-1", "Aarav Menon", "Senior Editor", "staff", 20, BAND2_Z0 + 3, YAW.n, {
      seated: true,
    });
    npc("npc-video-2", "Ishita Rao", "Motion Designer", "staff", 26, BAND2_Z0 + 3, YAW.n, {
      seated: true,
    });
    npc("npc-video-3", "Rohan Das", "Junior Editor", "staff", 32, BAND2_Z0 + 3, YAW.n, {
      seated: true,
    });

    // Task Hall
    npc("npc-task-1", "Neha Sharma", "Producer", "staff", EX0 + 6, BAND2_Z0 + 8, YAW.n, {
      seated: true,
    });
    npc("npc-task-2", "Yusuf Khan", "Coordinator", "staff", EX0 + 12, BAND2_Z0 + 8, YAW.n, {
      seated: true,
    });

    // Outreach — on the phones.
    npc("npc-outreach-1", "Sana Iqbal", "Outreach Lead", "staff", EX0 + 5, BAND3_Z0 + 5, YAW.s, {
      seated: true,
    });
    npc("npc-outreach-2", "Vikram Bose", "SDR", "staff", EX0 + 11, BAND3_Z0 + 5, YAW.s, {
      seated: true,
    });

    // Creative Studio
    npc("npc-creative-1", "Meera Pillai", "Art Director", "staff", WX0 + 8, BAND3_Z0 + 5, YAW.s, {
      seated: true,
    });
    npc("npc-creative-2", "Kabir Anand", "Copywriter", "staff", WX0 + 20, BAND3_Z0 + 5, YAW.s, {
      seated: true,
    });

    // Dev Wing
    npc("npc-dev-1", "Ananya Gupta", "Tech Lead", "staff", EX0 + 22, BAND1_Z0 + 18, YAW.w, {
      seated: true,
    });

    // Managing Heads
    npc("npc-approvals", "Rajat Verma", "Operations Head", "staff", MH_X0 + 6, BAND4_Z0 + 4, YAW.s, {
      seated: true,
    });

    // Conference — a couple of people already seated for the next meeting.
    npc("npc-conf-1", "Tara Nair", "Strategy", "staff", 35, 28, YAW.e, { seated: true });
    npc("npc-conf-2", "Imran Sheikh", "Finance", "staff", 37, 31, YAW.w, { seated: true });

    // Shoot Studio — a camera op on the floor.
    npc("npc-shoot", "Zoya Farooqui", "DOP", "staff", SHOOT_X1 - 14, BAND4_Z0 + 8, YAW.e);

    // Pantry
    npc("npc-pantry", "Arjun Sethi", "On a break", "staff", 90, PAN_Z0 + 3, YAW.s);

    // Client NPCs stand behind their existing booth in the Task Hall, facing
    // out. The booth's POI is already the interaction — the person just makes
    // it obvious there is someone to deal with.
    clients.slice(0, 4).forEach((room, i) => {
      const z0 = 50 + i * 6;
      npc(
        `npc-client-${room.id}`,
        room.name,
        `${room.name} — Client`,
        "client",
        129,
        z0 + 1,
        YAW.w,
        { poiId: `client-${room.id}` },
      );
    });
  };

  /**
   * Props. Empty carpet is what made the rooms feel like showrooms; this puts
   * the clutter of a working office on every surface.
   */
  const dressRooms = (): void => {
    const deskProp = (x: number, z: number, id: number) => {
      if (get(x, FLOOR, z) === B.desk) set(x, FLOOR + 1, z, id);
    };
    // Desk clutter across the floor: towers under desks, mugs and paper on top.
    for (let x = IX0; x <= IX1; x++) {
      for (let z = IZ0; z <= IZ1; z++) {
        if (get(x, FLOOR, z) !== B.desk) continue;
        const h = (x * 73856093) ^ (z * 19349663);
        const k = (h >>> 3) % 10;
        if (k === 0) deskProp(x, z, B.coffee);
        else if (k === 1) deskProp(x, z, B.papers);
        else if (k === 2) deskProp(x, z, B.phone);
        else if (k === 3) deskProp(x, z, B.book_stack);
        // A tower tucked beside the desk, where the floor is still clear.
        if (k === 4 && get(x, FLOOR, z + 1) === 0) set(x, FLOOR, z + 1, B.cpu);
      }
    }

    // Greenery + art in every room, against the walls and out of doorways.
    const potted = (x: number, z: number, tall: boolean) => {
      if (get(x, FLOOR, z) !== 0) return;
      set(x, FLOOR, z, tall ? B.pot : B.pot_white);
      set(x, FLOOR + 1, z, tall ? B.plant_tall : B.plant_fern);
    };
    const corners: [number, number][] = [
      [WX0 + 1, BAND1_Z0 + 1], [WX1 - 1, BAND1_Z1 - 1], [WX0 + 1, BAND1_Z1 - 1],
      [WX0 + 1, BAND2_Z0 + 1], [WX1 - 1, BAND2_Z1 - 1],
      [WX0 + 1, BAND3_Z0 + 1], [WX1 - 1, BAND3_Z1 - 1],
      [EX0 + 1, BAND1_Z0 + 1], [EX1 - 1, BAND1_Z1 - 1],
      [EX0 + 1, BAND2_Z0 + 1], [EX1 - 1, BAND2_Z1 - 1],
      [EX0 + 1, BAND3_Z0 + 1], [EX1 - 1, BAND3_Z1 - 1],
      [MH_X0 + 1, BAND4_Z0 + 1], [SHOOT_X1 - 1, BAND4_Z0 + 1],
      [LOB_X0 + 1, BAND4_Z1 - 2], [LOB_X1 - 1, BAND4_Z1 - 2],
    ];
    corners.forEach(([x, z], i) => potted(x, z, i % 2 === 0));

    // Framed art and exit signage on the corridor walls. Only ever replace an
    // existing solid block — dropping one into a door gap would wall a room off.
    const onWall = (x: number, y: number, z: number, id: number) => {
      if (get(x, y, z) !== 0) set(x, y, z, id);
    };
    for (const z of [26, 58, 96]) {
      onWall(W_FRONT, FLOOR + 2, z, B.art);
      onWall(E_FRONT, FLOOR + 2, z, B.art);
    }
    for (const z of [COR_Z0 + 1, COR_Z1 - 1]) {
      onWall(COR_X0, FLOOR + 3, z, B.exit_sign);
    }
    // Air handling overhead so the ceiling isn't a flat grid.
    for (let z = COR_Z0 + 6; z < COR_Z1; z += 16) {
      onWall(COR_X0 + 3, CEIL, z, B.vent);
      onWall(COR_X1 - 3, CEIL, z, B.vent);
    }

    // Breakout: sofas, a rug and a lamp in the pantry.
    fill(LOB_X0 + 4, FLOOR, PAN_Z0 + 1, LOB_X0 + 8, FLOOR, PAN_Z0 + 1, B.sofa);
    fill(LOB_X0 + 4, FLOOR, PAN_Z0 + 4, LOB_X0 + 8, FLOOR, PAN_Z0 + 4, B.sofa);
    fill(LOB_X0 + 4, FLOOR, PAN_Z0 + 2, LOB_X0 + 8, FLOOR, PAN_Z0 + 3, B.rug_pattern);
    set(LOB_X0 + 3, FLOOR, PAN_Z0 + 1, B.lamp);
    set(LOB_X0 + 10, FLOOR, PAN_Z0 + 2, B.cooler);
    set(LOB_X0 + 12, FLOOR, PAN_Z0 + 2, B.printer);

    // Lobby waiting area.
    fill(LOB_X0 + 2, FLOOR, BAND4_Z1 - 4, LOB_X0 + 5, FLOOR, BAND4_Z1 - 4, B.sofa);
    fill(LOB_X0 + 2, FLOOR, BAND4_Z1 - 3, LOB_X0 + 5, FLOOR, BAND4_Z1 - 3, B.rug_pattern);
    set(LOB_X0 + 1, FLOOR, BAND4_Z1 - 4, B.lamp);

    // Shoot Studio: real camera kit instead of one lonely rig.
    const sx0 = SHOOT_X1 - 20;
    set(sx0, FLOOR, BAND4_Z0 + 6, B.tripod);
    set(sx0, FLOOR + 1, BAND4_Z0 + 6, B.camera);
    set(sx0 + 4, FLOOR, BAND4_Z0 + 3, B.tripod);
    set(sx0 + 4, FLOOR + 1, BAND4_Z0 + 3, B.softbox);
    set(sx0 + 4, FLOOR, BAND4_Z0 + 10, B.tripod);
    set(sx0 + 4, FLOOR + 1, BAND4_Z0 + 10, B.softbox);
    set(sx0 + 2, FLOOR, BAND4_Z0 + 8, B.mic);
    set(sx0 - 2, FLOOR, BAND4_Z0 + 6, B.clapboard);

    // Video bay: a second camera and reference monitors.
    set(WX0 + 3, FLOOR, BAND2_Z1 - 3, B.tripod);
    set(WX0 + 3, FLOOR + 1, BAND2_Z1 - 3, B.camera);
    set(WX0 + 6, FLOOR, BAND2_Z1 - 3, B.book_stack);
  };

  // --- assemble ------------------------------------------------------------

  buildShell();
  buildCorridor();
  buildLobby();
  buildPantry();
  buildConferenceHall();
  buildVideoBay();
  buildCreativeStudio();
  buildShootStudio();
  buildDevWing();
  buildTaskHall();
  buildOutreach();
  buildManagingHeads();
  buildTower(TOWERS[0], pipelineProjects);
  buildTower(TOWERS[1], completedProjects);
  buildUpsideDown();
  buildForecourt();
  dressCorridor();
  populate();
  dressRooms();

  return {
    sx: SX,
    sy: SY,
    sz: SZ,
    blocks,
    spawn: { x: 89.5, y: FLOOR, z: 130.5 },
    spawnYaw: 0, // yaw 0 faces -z, straight up the corridor
    pois,
    regions,
    signs,
    npcs,
    lair: {
      min: { x: LX0 + 2, y: LY0 + 1, z: LZ0 + 2 },
      max: { x: LX1 - 1, y: LY1, z: LZ1 - 1 },
    },
  };
}
