// AUXA HQ — the whole office, generated as pure data. No DOM, no three.js,
// no randomness. Coordinates: x east, y up, z south. y0 is the structural
// slab, the ground floor is WALKED AT y1 and capped by a suspended ceiling at
// y6. Fill ranges are inclusive and clamp to bounds. Yaw 0 faces -z (north).
//
// The shape of the place: one short spine corridor running north from the
// reception lobby, glass-fronted rooms hanging off both sides, a pantry at the
// far end, and two project towers standing on the roof above the Dev Wing,
// reached by the lifts inside them.
//
// This is a COMPACT floorplate on purpose. Every room is sized to the work it
// holds and nothing more, and the only things placed in them are things you
// can walk up to and use: workstations, boards, lifts, booths. Decoration is
// deliberately almost absent — an empty corner beats a corner full of props
// you can't interact with.

import { B } from "./blocks";
import type { Npc, PanelKind, Poi, Region, TextSign, Vec3, World } from "./types";

export type WorldInput = {
  rooms: { id: string; key: string; name: string; kind: string }[];
  projects: { id: string; name: string; floor: number; buildingKey: string }[];
};

const SX = 76;
const SY = 76;
const SZ = 72;
const AIR = 0;

/** Ground floor levels. */
const SLAB = 0;
const FLOOR = 1;
const CEIL = 6;
const ROOF = 7;

/** HQ envelope — the wall blocks themselves. */
const HX0 = 4;
const HX1 = 71;
const HZ0 = 4;
const HZ1 = 67;
/** Everything inside the envelope starts life as a solid drywall mass. */
const IX0 = 5;
const IX1 = 70;
const IZ0 = 5;
const IZ1 = 66;

/** The spine corridor. */
const COR_X0 = 34;
const COR_X1 = 39;
const COR_Z0 = 10;
const COR_Z1 = 61;

/** West rooms: interior x range, glass front on their east wall. */
const WX0 = 6;
const WX1 = 32;
const W_FRONT = 33;
/** East rooms: interior x range, glass front on their west wall. */
const EX0 = 41;
const EX1 = 70;
const E_FRONT = 40;

/** Room bands along z (interior, inclusive). */
const BAND1_Z0 = 12;
const BAND1_Z1 = 26;
const BAND2_Z0 = 30;
const BAND2_Z1 = 44;
const BAND3_Z0 = 48;
const BAND3_Z1 = 58;
const BAND4_Z0 = 62;
const BAND4_Z1 = 66;

/** The lobby band: reception in the middle, a studio west, the heads east. */
const LOB_X0 = 28;
const LOB_X1 = 45;
const SHOOT_X1 = 26;
const SHOOT_FRONT = 27;
const MH_X0 = 47;
const MH_FRONT = 46;

/** The pantry caps the north end of the corridor. */
const PAN_Z0 = 5;
const PAN_Z1 = 8;
const PAN_FRONT = 9;

/** The partition splitting the Creative Studio into its two wings. */
const CRE_SPLIT = 19;

/** Entrance gap in the south facade. */
const DOOR_X0 = 34;
const DOOR_X1 = 39;

/** Towers: both sit on the roof over the Dev Wing (east band 1). */
const TZ0 = BAND1_Z0;
const TZ1 = BAND1_Z1;
const FLOORS = 10;
const FLOOR_HEIGHT = 5;
const floorPlate = (n: number): number => ROOF + 1 + (n - 1) * FLOOR_HEIGHT;

/** The Upside Down: a sealed box no surface path can ever touch. */
const LX0 = 4;
const LX1 = 32;
const LY0 = 62;
const LY1 = 72;
const LZ0 = 4;
const LZ1 = 32;

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
    x0: 41,
    x1: 53,
    inner: 53,
    innerFace: "w",
    carpet: B.carpet_blue,
    facade: B.facade_blue,
    arrival: 51.5,
  },
  {
    key: "complete",
    label: "Completed Tower",
    x0: 57,
    x1: 70,
    inner: 57,
    innerFace: "e",
    carpet: B.carpet_green,
    facade: B.facade_warm,
    arrival: 58.5,
  },
];

/** Lift banks sit mid-tower on the inner wall: up north, down south. */
const LIFT_UP_Z = TZ0 + 4;
const LIFT_DOWN_Z = TZ0 + 8;
const LIFT_ARRIVAL_Z = TZ0 + 6.5;

/** Where the lifts drop you back out in the Dev Wing. */
const LIFT_LOBBY: Vec3 = { x: 68.5, y: FLOOR, z: 24.5 };
/** Arrival pads for the two rift ends. */
const RIFT_LAIR: Vec3 = { x: 18.5, y: LY0 + 1, z: 18.5 };
const RIFT_OFFICE: Vec3 = { x: 68.5, y: FLOOR, z: 64.5 };

export function buildWorld(input: WorldInput): World {
  const blocks = new Uint8Array(SX * SY * SZ);
  const pois: Poi[] = [];
  const regions: Region[] = [];
  const signs: TextSign[] = [];
  const npcs: Npc[] = [];

  const roomId = (...keys: string[]): string | null => {
    for (const k of keys) {
      const hit = input.rooms.find((r) => r.key === k);
      if (hit) return hit.id;
    }
    return null;
  };
  const roomName = (fallback: string, ...keys: string[]): string => {
    for (const k of keys) {
      const hit = input.rooms.find((r) => r.key === k);
      if (hit) return hit.name;
    }
    return fallback;
  };

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

  /** A 3 wide x 3 high doorway with a lit name strip over it. */
  const doorX = (xw: number, z0: number, reader: "e" | "w", text: string): void => {
    carve(xw, FLOOR, z0, xw, FLOOR + 2, z0 + 2);
    fill(xw, FLOOR + 3, z0, xw, FLOOR + 3, z0 + 2, B.sign);
    sign(text, reader === "e" ? xw + 1.05 : xw - 0.05, FLOOR + 3.5, z0 + 1.5, reader, 0.9);
  };

  const doorZ = (zw: number, x0: number, reader: "n" | "s", text: string): void => {
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
  // Only things you can walk up to and use. No scatter props.

  const chair = (x: number, z: number): void => {
    if (get(x, FLOOR, z) === AIR) set(x, FLOOR, z, B.chair);
  };

  type Tool = {
    id: string;
    label: string;
    sublabel: string;
    panel: PanelKind;
    refId?: string;
  };

  /** Desk + monitor + chair. With `tool`, the monitor is a usable computer. */
  const workstation = (x: number, z: number, seat: Facing, tool?: Tool): void => {
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
      workstation(axis === "x" ? x + i * gap : x, axis === "z" ? z + i * gap : z, seat);
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

  /**
   * Put a person on the nearest cell they actually fit in. Hand-placed people
   * drift inside a desk the moment a room's furniture moves; searching outward
   * from the intended spot keeps everyone standing on the floor.
   */
  const person = (
    id: string,
    name: string,
    role: string,
    kind: Npc["kind"],
    nearX: number,
    nearZ: number,
    yaw: number,
    extra?: Partial<Npc>,
  ): void => {
    const clear = (x: number, z: number): boolean =>
      get(x, FLOOR, z) === AIR &&
      get(x, FLOOR + 1, z) === AIR &&
      get(x, FLOOR - 1, z) !== AIR &&
      !npcs.some((n) => Math.floor(n.x) === x && Math.floor(n.z) === z);
    for (let r = 0; r <= 6; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = nearX + dx;
          const z = nearZ + dz;
          if (!clear(x, z)) continue;
          npcs.push({
            id,
            name,
            role,
            kind,
            x: x + 0.5,
            y: FLOOR,
            z: z + 0.5,
            yaw,
            hue: (id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360,
            ...extra,
          });
          return;
        }
    }
  };

  // --- shell ---------------------------------------------------------------

  const buildShell = (): void => {
    // Structural slab, then plaza paving everywhere outside the envelope.
    fill(0, SLAB, 0, SX - 1, SLAB, SZ - 1, B.concrete);
    fill(0, SLAB, 0, SX - 1, SLAB, HZ0 - 1, B.paving);
    fill(0, SLAB, HZ1 + 1, SX - 1, SLAB, SZ - 1, B.paving);
    fill(0, SLAB, HZ0, HX0 - 1, SLAB, HZ1, B.paving);
    fill(HX1 + 1, SLAB, HZ0, SX - 1, SLAB, HZ1, B.paving);

    // The envelope walls, then the roof deck over the whole plate.
    fill(HX0, FLOOR, HZ0, HX1, CEIL, HZ1, B.facade);
    fill(HX0, ROOF, HZ0, HX1, ROOF, HZ1, B.roof);
    // The interior starts as solid drywall; every space is carved out of it,
    // so anything not explicitly a room stays structure.
    fill(IX0, FLOOR, IZ0, IX1, CEIL - 1, IZ1, B.drywall);

    // Entrance: a 6-wide, 4-high opening in the south facade.
    carve(DOOR_X0, FLOOR, HZ1, DOOR_X1, FLOOR + 3, HZ1);
    sign("AUXA HQ", (DOOR_X0 + DOOR_X1) / 2 + 0.5, FLOOR + 4.6, HZ1 + 1.05, "s", 1.4);
  };

  // --- circulation ---------------------------------------------------------

  const buildCorridor = (): void => {
    space(COR_X0, COR_Z0, COR_X1, COR_Z1, B.carpet_gray);
    // Both side walls are the rooms' glass fronts; the room builders glaze
    // their own stretch, so anything left over stays drywall.
    fill(W_FRONT, FLOOR, COR_Z0, W_FRONT, CEIL, COR_Z1, B.drywall);
    fill(E_FRONT, FLOOR, COR_Z0, E_FRONT, CEIL, COR_Z1, B.drywall);
  };

  const buildLobby = (): void => {
    space(LOB_X0, BAND4_Z0, LOB_X1, BAND4_Z1, B.marble);
    // The corridor runs straight out of the lobby's north edge.
    carve(COR_X0, FLOOR, BAND4_Z0 - 1, COR_X1, CEIL - 1, BAND4_Z0 - 1);
    fill(COR_X0, SLAB, BAND4_Z0 - 1, COR_X1, SLAB, BAND4_Z0 - 1, B.marble);
    ceilingOver(COR_X0, BAND4_Z0 - 1, COR_X1, BAND4_Z0 - 1, CEIL);

    // Reception counter, facing whoever walks in.
    fill(LOB_X0 + 2, FLOOR, BAND4_Z1 - 1, LOB_X0 + 5, FLOOR, BAND4_Z1 - 1, B.desk);
    workstation(LOB_X0 + 3, BAND4_Z1 - 2, "s", {
      id: "reception-pc",
      label: "Reception terminal",
      sublabel: "sit down and work the board",
      panel: "bounties",
    });

    region({
      key: "lobby",
      label: "Reception",
      roomId: null,
      min: { x: LOB_X0, y: FLOOR, z: BAND4_Z0 },
      max: { x: LOB_X1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });

    // The bell schedule lives in an alcove off the lobby's east side. It is a
    // smaller volume than the lobby, so the HUD names it when you stand in it.
    const tz0 = E_FRONT;
    const tz1 = LOB_X1;
    fill(tz0, FLOOR + 2, BAND4_Z0 + 1, tz0, FLOOR + 4, BAND4_Z0 + 3, B.clock);
    sign("THE BELL SCHEDULE", tz0 + 1.05, FLOOR + 5.3, BAND4_Z0 + 2.5, "e", 0.7);
    poi({
      id: "timetable-board",
      label: "Daily timetable",
      sublabel: "today's blocks and the bell",
      panel: "timetable",
      min: { x: tz0, y: FLOOR + 2, z: BAND4_Z0 + 1 },
      max: { x: tz0 + 1, y: FLOOR + 5, z: BAND4_Z0 + 4 },
    });
    workstation(tz1 - 1, BAND4_Z1 - 1, "w", {
      id: "timetable-pc",
      label: "Attendance terminal",
      sublabel: "sit down and work your day",
      panel: "timetable",
    });
    region({
      key: "timetable",
      label: roomName("Timetable", "timetable"),
      roomId: roomId("timetable"),
      min: { x: tz0, y: FLOOR, z: BAND4_Z0 },
      max: { x: tz1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });
  };

  const buildPantry = (): void => {
    space(LOB_X0, PAN_Z0, LOB_X1, PAN_Z1, B.wood_floor);
    fill(LOB_X0, FLOOR, PAN_FRONT, LOB_X1, CEIL, PAN_FRONT, B.drywall);
    doorZ(PAN_FRONT, COR_X0 + 1, "s", "PANTRY");

    // A counter run along the north wall, and the break-room board over it.
    fill(LOB_X0 + 2, FLOOR, PAN_Z0, LOB_X0 + 7, FLOOR, PAN_Z0, B.pantry);
    fill(LOB_X0 + 9, FLOOR + 2, PAN_Z0 - 1, LOB_X0 + 12, FLOOR + 4, PAN_Z0 - 1, B.corkboard);
    poi({
      id: "pantry-board",
      label: "Break room board",
      sublabel: "the bell schedule, in the room people take breaks in",
      panel: "timetable",
      min: { x: LOB_X0 + 9, y: FLOOR + 2, z: PAN_Z0 - 1 },
      max: { x: LOB_X0 + 13, y: FLOOR + 5, z: PAN_Z0 },
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
      doors: [{ z: BAND1_Z0 + 6, text: "CONFERENCE HALL" }],
      roomId: roomId("common-board"),
    });

    meetingTable(WX0 + 6, BAND1_Z0 + 5, WX0 + 16, BAND1_Z0 + 8);

    // The lectern faces the table; the announcement board is behind it.
    set(WX0 + 3, FLOOR, BAND1_Z0 + 6, B.desk_dark);
    poi({
      id: "lectern",
      label: "Speaker's lectern",
      sublabel: "call the room together",
      panel: "conference",
      refId: "compose",
      min: { x: WX0 + 3, y: FLOOR, z: BAND1_Z0 + 6 },
      max: { x: WX0 + 4, y: FLOOR + 1, z: BAND1_Z0 + 7 },
    });
    fill(WX0 - 1, FLOOR + 2, BAND1_Z0 + 4, WX0 - 1, FLOOR + 4, BAND1_Z0 + 9, B.whiteboard);
    poi({
      id: "announce-board",
      label: "Announcement board",
      sublabel: "what the whole floor needs to know",
      panel: "conference",
      min: { x: WX0 - 1, y: FLOOR + 2, z: BAND1_Z0 + 4 },
      max: { x: WX0, y: FLOOR + 5, z: BAND1_Z0 + 10 },
    });
    workstation(WX0 + 20, BAND1_Z0 + 3, "s", {
      id: "conference-pc",
      label: "Conference terminal",
      sublabel: "sit down and work the agenda",
      panel: "conference",
    });
    missionBoard(
      "conference",
      name,
      { x: W_FRONT, y: FLOOR + 1, z: BAND1_Z1 - 3 },
      { x: W_FRONT + 1, y: FLOOR + 4, z: BAND1_Z1 - 1 },
      "common-board",
    );
    fill(W_FRONT, FLOOR + 1, BAND1_Z1 - 3, W_FRONT, FLOOR + 3, BAND1_Z1 - 2, B.corkboard);

    person("npc-conf-1", "Nancy", "Operations Lead", "staff", WX0 + 8, BAND1_Z0 + 4, YAW.s);
    person("npc-conf-2", "Jonathan", "Account Manager", "staff", WX0 + 14, BAND1_Z0 + 10, YAW.n);
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
      doors: [{ z: BAND2_Z0 + 6, text: "VIDEO EDITING BAY" }],
      roomId: roomId("video-editing"),
    });

    // Three edit bays in a row, each one a real workstation.
    const bays: [string, string][] = [
      ["video-pc-1", "Edit bay workstation 1"],
      ["video-pc-2", "Edit bay workstation 2"],
      ["video-pc-3", "Edit bay workstation 3"],
    ];
    bays.forEach(([id, label], i) => {
      workstation(WX0 + 4 + i * 5, BAND2_Z0 + 4, "s", {
        id,
        label,
        sublabel: "sit down and work the queue",
        panel: "video",
      });
    });

    // The writing desk shares the room — scripts live next to the edits.
    workstation(WX0 + 4, BAND2_Z1 - 4, "n", {
      id: "script-pc",
      label: "Script terminal",
      sublabel: "sit down and work on scripts",
      panel: "docs",
    });
    sign("SCRIPTS", WX0 + 4.5, FLOOR + 3.2, BAND2_Z1 - 5.05, "s", 0.6);

    missionBoard(
      "video",
      name,
      { x: W_FRONT, y: FLOOR + 1, z: BAND2_Z1 - 3 },
      { x: W_FRONT + 1, y: FLOOR + 4, z: BAND2_Z1 - 1 },
      "video-editing",
    );
    fill(W_FRONT, FLOOR + 1, BAND2_Z1 - 3, W_FRONT, FLOOR + 3, BAND2_Z1 - 2, B.corkboard);

    person("npc-video-1", "Robin", "Video Editor", "staff", WX0 + 4, BAND2_Z0 + 5, YAW.n, {
      seated: true,
    });
    person("npc-video-2", "Argyle", "Motion Designer", "staff", WX0 + 9, BAND2_Z0 + 5, YAW.n, {
      seated: true,
    });
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
      doors: [{ z: BAND3_Z0 + 4, text: "CREATIVE — CLIENTS" }],
      roomId: roomId("creative"),
    });

    // A partition splits the studio into two wings; the internal wing is
    // reached through the clients wing, which is what keeps it quiet.
    fill(CRE_SPLIT, FLOOR, BAND3_Z0, CRE_SPLIT, CEIL, BAND3_Z1, B.drywall_accent);
    doorX(CRE_SPLIT, BAND3_Z0 + 4, "e", "CREATIVE — INTERNAL");

    workstation(WX0 + 4, BAND3_Z0 + 3, "s", {
      id: "creative-pc-internal",
      label: "Internal creative desk",
      sublabel: "sit down and work internal boards",
      panel: "creative",
      refId: "internal",
    });
    workstation(CRE_SPLIT + 4, BAND3_Z0 + 3, "s", {
      id: "creative-pc-clients",
      label: "Client creative desk",
      sublabel: "sit down and work client boards",
      panel: "creative",
      refId: "clients",
    });

    region({
      key: "creative-internal",
      label: "Creative — Internal",
      roomId: null,
      min: { x: WX0, y: FLOOR, z: BAND3_Z0 },
      max: { x: CRE_SPLIT, y: CEIL + 1, z: BAND3_Z1 + 1 },
    });
    region({
      key: "creative-clients",
      label: "Creative — Clients",
      roomId: null,
      min: { x: CRE_SPLIT + 1, y: FLOOR, z: BAND3_Z0 },
      max: { x: WX1 + 1, y: CEIL + 1, z: BAND3_Z1 + 1 },
    });

    missionBoard(
      "creative",
      name,
      { x: W_FRONT, y: FLOOR + 1, z: BAND3_Z1 - 3 },
      { x: W_FRONT + 1, y: FLOOR + 4, z: BAND3_Z1 - 1 },
      "creative",
    );
    fill(W_FRONT, FLOOR + 1, BAND3_Z1 - 3, W_FRONT, FLOOR + 3, BAND3_Z1 - 2, B.corkboard);

    person("npc-creative-1", "Max", "Art Director", "staff", CRE_SPLIT + 4, BAND3_Z0 + 4, YAW.n, {
      seated: true,
    });
    person("npc-creative-2", "Erica", "Designer", "staff", WX0 + 4, BAND3_Z0 + 4, YAW.n, {
      seated: true,
    });
  };

  const buildShootStudio = (): void => {
    const name = roomName("Shoot Studio", "shoot");
    space(WX0, BAND4_Z0, SHOOT_X1, BAND4_Z1, B.concrete);
    fill(SHOOT_FRONT, FLOOR, BAND4_Z0, SHOOT_FRONT, CEIL, BAND4_Z1, B.drywall);
    doorX(SHOOT_FRONT, BAND4_Z0 + 1, "e", "SHOOT STUDIO");

    // The rig is the set; the desk is the call sheet.
    set(WX0 + 4, FLOOR, BAND4_Z0 + 2, B.tripod);
    set(WX0 + 4, FLOOR + 1, BAND4_Z0 + 2, B.camera);
    poi({
      id: "camera-rig",
      label: "Camera rig",
      sublabel: "this week's call sheet",
      panel: "shoot",
      min: { x: WX0 + 4, y: FLOOR + 1, z: BAND4_Z0 + 2 },
      max: { x: WX0 + 5, y: FLOOR + 2, z: BAND4_Z0 + 3 },
    });
    workstation(WX0 + 10, BAND4_Z1 - 1, "n", {
      id: "shoot-pc",
      label: "Shoot desk",
      sublabel: "sit down and work the shoot",
      panel: "shoot",
    });

    // The lobby band is only as deep as its doorway, so this room's board goes
    // on the back wall rather than the front — the front is all door.
    fill(WX0 + 2, FLOOR + 2, BAND4_Z0 - 1, WX0 + 5, FLOOR + 4, BAND4_Z0 - 1, B.corkboard);
    missionBoard(
      "shoot",
      name,
      { x: WX0 + 2, y: FLOOR + 2, z: BAND4_Z0 - 1 },
      { x: WX0 + 6, y: FLOOR + 5, z: BAND4_Z0 },
      "shoot",
    );

    region({
      key: "shoot",
      label: name,
      roomId: roomId("shoot"),
      min: { x: WX0, y: FLOOR, z: BAND4_Z0 },
      max: { x: SHOOT_X1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });

    person("npc-shoot-1", "Steve", "Camera Operator", "staff", WX0 + 6, BAND4_Z0 + 2, YAW.w);
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
      floorId: B.carpet_blue,
      frontX: E_FRONT,
      reader: "w",
      doors: [{ z: BAND1_Z0 + 6, text: "DEV WING" }],
      roomId: roomId("developer"),
    });

    // Bench seating for the team, plus the internal-tools desk.
    deskCluster(EX0 + 3, BAND1_Z0 + 4, 4, "s", "x", 3);
    workstation(EX0 + 3, BAND1_Z1 - 4, "n", {
      id: "dev-pc",
      label: "Internal tools desk",
      sublabel: "sit down and work internal tools",
      panel: "city",
      refId: "tools",
    });

    // Two racks by the far wall — the room's reason for the raised floor.
    fill(EX1 - 1, FLOOR, BAND1_Z0 + 2, EX1 - 1, FLOOR + 2, BAND1_Z0 + 3, B.server_rack);

    // The lift core sits between the two towers, reached from this floor.
    const shaftX0 = TOWERS[0].inner + 1;
    const shaftX1 = TOWERS[1].inner - 1;
    fill(shaftX0, FLOOR, LIFT_UP_Z, shaftX1, FLOOR + 3, LIFT_DOWN_Z, B.elevator);
    for (const t of TOWERS) {
      const doorX0 = t.innerFace === "w" ? shaftX0 - 1 : shaftX1 + 1;
      poi({
        id: `lift-lobby-${t.key}`,
        label: `Lift — ${t.label}`,
        sublabel: "ride up to the project floors",
        panel: "rift",
        teleportTo: { x: t.arrival, y: floorPlate(1) + 1, z: LIFT_ARRIVAL_Z },
        teleportYaw: YAW[t.innerFace],
        min: { x: doorX0, y: FLOOR + 1, z: LIFT_UP_Z },
        max: { x: doorX0 + 1, y: FLOOR + 4, z: LIFT_UP_Z + 2 },
      });
      sign(
        t.label.toUpperCase(),
        t.innerFace === "w" ? doorX0 - 0.05 : doorX0 + 1.05,
        FLOOR + 4.4,
        LIFT_UP_Z + 1,
        t.innerFace === "w" ? "w" : "e",
        0.7,
      );
    }

    missionBoard(
      "dev-wing",
      name,
      { x: E_FRONT, y: FLOOR + 1, z: BAND1_Z1 - 3 },
      { x: E_FRONT + 1, y: FLOOR + 4, z: BAND1_Z1 - 1 },
      "developer",
    );
    fill(E_FRONT, FLOOR + 1, BAND1_Z1 - 3, E_FRONT, FLOOR + 3, BAND1_Z1 - 2, B.corkboard);

    person("npc-dev-1", "Dustin", "Engineer", "staff", EX0 + 3, BAND1_Z0 + 5, YAW.n, {
      seated: true,
    });
    person("npc-dev-2", "Lucas", "Engineer", "staff", EX0 + 6, BAND1_Z0 + 5, YAW.n, {
      seated: true,
    });
    person("npc-dev-3", "Suzie", "Platform Engineer", "staff", EX0 + 9, BAND1_Z0 + 5, YAW.n, {
      seated: true,
    });
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
      doors: [{ z: BAND2_Z0 + 6, text: "TASK HALL" }],
      roomId: roomId("tasks"),
    });

    workstation(EX0 + 3, BAND2_Z0 + 4, "s", {
      id: "task-pc-1",
      label: "Task terminal 1",
      sublabel: "sit down and work your wall",
      panel: "tasks",
    });
    workstation(EX0 + 6, BAND2_Z0 + 4, "s", {
      id: "task-pc-2",
      label: "Task terminal 2",
      sublabel: "sit down and work the squad's wall",
      panel: "tasks",
    });

    // The wall itself: everyone's work, in one place.
    fill(EX0 + 1, FLOOR + 2, BAND2_Z0 - 1, EX0 + 6, FLOOR + 4, BAND2_Z0 - 1, B.whiteboard);
    sign("THE TASK WALL", EX0 + 4, FLOOR + 5.3, BAND2_Z0 - 0.95, "s", 0.8);
    poi({
      id: "task-wall",
      label: "Task wall",
      sublabel: "every open card on the floor",
      panel: "tasks",
      min: { x: EX0 + 1, y: FLOOR + 2, z: BAND2_Z0 - 1 },
      max: { x: EX0 + 7, y: FLOOR + 5, z: BAND2_Z0 },
    });

    // Client booths down the east wall. Each is a real desk you walk up to,
    // with the client standing behind it.
    clients.forEach((c, i) => {
      const z0 = BAND2_Z0 + 2 + i * 4;
      if (z0 + 2 > BAND2_Z1) return;
      fill(EX1 - 2, FLOOR, z0, EX1 - 1, FLOOR, z0 + 1, B.desk);
      set(EX1 - 2, FLOOR + 1, z0, B.monitor);
      sign(c.name.toUpperCase(), EX1 - 2.55, FLOOR + 2.6, z0 + 0.5, "w", 0.55);
      poi({
        id: `client-${c.id}`,
        label: c.name,
        sublabel: "their open work",
        panel: "client",
        refId: c.id,
        min: { x: EX1 - 2, y: FLOOR + 1, z: z0 },
        max: { x: EX1 - 1, y: FLOOR + 2, z: z0 + 2 },
      });
      region({
        key: `client-${c.id}`,
        label: c.name,
        roomId: c.id,
        min: { x: EX1 - 4, y: FLOOR, z: z0 },
        max: { x: EX1 + 1, y: CEIL + 1, z: z0 + 2 },
      });
      person(
        `npc-client-${c.id}`,
        c.name,
        `${c.name} — Client`,
        "client",
        EX1 - 1,
        z0 + 2,
        YAW.w,
        { poiId: `client-${c.id}` },
      );
    });

    missionBoard(
      "tasks",
      name,
      { x: E_FRONT, y: FLOOR + 1, z: BAND2_Z1 - 3 },
      { x: E_FRONT + 1, y: FLOOR + 4, z: BAND2_Z1 - 1 },
      "tasks",
    );
    fill(E_FRONT, FLOOR + 1, BAND2_Z1 - 3, E_FRONT, FLOOR + 3, BAND2_Z1 - 2, B.corkboard);

    person("npc-task-1", "Mike", "Delivery Lead", "staff", EX0 + 3, BAND2_Z0 + 5, YAW.n, {
      seated: true,
    });
    person("npc-task-2", "Will", "Coordinator", "staff", EX0 + 6, BAND2_Z0 + 5, YAW.n, {
      seated: true,
    });
  };

  const buildOutreach = (): void => {
    const name = roomName("Outreach Office", "outreach");
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
      doors: [{ z: BAND3_Z0 + 4, text: "OUTREACH OFFICE" }],
      roomId: roomId("outreach"),
    });

    workstation(EX0 + 3, BAND3_Z0 + 3, "s", {
      id: "outreach-pc-1",
      label: "Outreach desk 1",
      sublabel: "sit down and work the sectors",
      panel: "outreach",
    });
    workstation(EX0 + 6, BAND3_Z0 + 3, "s", {
      id: "outreach-pc-2",
      label: "Outreach desk 2",
      sublabel: "sit down and work the day plan",
      panel: "outreach",
    });

    missionBoard(
      "outreach",
      name,
      { x: E_FRONT, y: FLOOR + 1, z: BAND3_Z1 - 3 },
      { x: E_FRONT + 1, y: FLOOR + 4, z: BAND3_Z1 - 1 },
      "outreach",
    );
    fill(E_FRONT, FLOOR + 1, BAND3_Z1 - 3, E_FRONT, FLOOR + 3, BAND3_Z1 - 2, B.corkboard);

    person("npc-outreach-1", "Karen", "Outreach Lead", "staff", EX0 + 3, BAND3_Z0 + 4, YAW.n, {
      seated: true,
    });
    person("npc-outreach-2", "Murray", "Researcher", "staff", EX0 + 6, BAND3_Z0 + 4, YAW.n, {
      seated: true,
    });
  };

  const buildManagingHeads = (): void => {
    const name = roomName("Managing Heads", "managing-heads");
    space(MH_X0, BAND4_Z0, EX1, BAND4_Z1, B.wood_floor);
    fill(MH_FRONT, FLOOR, BAND4_Z0, MH_FRONT, CEIL, BAND4_Z1, B.drywall_warm);
    doorX(MH_FRONT, BAND4_Z0 + 1, "w", "MANAGING HEADS");

    workstation(MH_X0 + 3, BAND4_Z0 + 2, "s", {
      id: "approvals-pc",
      label: "Approvals counter",
      sublabel: "sit down and work leave and sign-offs",
      panel: "approvals",
    });

    // Back wall, for the same reason the Shoot Studio's board is on one.
    fill(MH_X0 + 2, FLOOR + 2, BAND4_Z0 - 1, MH_X0 + 5, FLOOR + 4, BAND4_Z0 - 1, B.corkboard);
    missionBoard(
      "managing-heads",
      name,
      { x: MH_X0 + 2, y: FLOOR + 2, z: BAND4_Z0 - 1 },
      { x: MH_X0 + 6, y: FLOOR + 5, z: BAND4_Z0 },
      "managing-heads",
    );

    // The rift: an obsidian ring in the far corner, admins only.
    fill(EX1, FLOOR, BAND4_Z1 - 3, EX1, FLOOR + 4, BAND4_Z1 - 1, B.obsidian);
    fill(EX1, FLOOR + 1, BAND4_Z1 - 3, EX1, FLOOR + 3, BAND4_Z1 - 2, B.lair_glow);
    poi({
      id: "rift-in",
      label: "Enter the rift",
      sublabel: "The Upside Down — admins only",
      panel: "rift",
      adminOnly: true,
      teleportTo: { ...RIFT_LAIR },
      teleportYaw: YAW.s,
      min: { x: EX1, y: FLOOR + 1, z: BAND4_Z1 - 3 },
      max: { x: EX1 + 1, y: FLOOR + 4, z: BAND4_Z1 - 1 },
    });

    region({
      key: "managing-heads",
      label: name,
      roomId: roomId("managing-heads"),
      min: { x: MH_X0, y: FLOOR, z: BAND4_Z0 },
      max: { x: EX1 + 1, y: CEIL + 1, z: BAND4_Z1 + 1 },
    });

    person("npc-approvals", "Joyce", "Managing Head", "staff", MH_X0 + 3, BAND4_Z0 + 3, YAW.n, {
      seated: true,
    });
    person("npc-reception", "Holly", "Reception", "staff", LOB_X0 + 3, BAND4_Z1 - 3, YAW.s);
  };

  // --- the towers ----------------------------------------------------------

  const buildTower = (t: Tower, projects: { id: string; name: string }[]): void => {
    const top = floorPlate(FLOORS) + FLOOR_HEIGHT;
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
      carve(ix0, plate, iz0, ix1, plate + FLOOR_HEIGHT - 1, iz1);
      fill(ix0, plate, iz0, ix1, plate, iz1, project ? t.carpet : B.concrete);

      if (project) {
        ceilingOver(ix0, iz0, ix1, iz1, plate + FLOOR_HEIGHT - 1);
      } else {
        // Fit-out in progress: open frame, lights hung off the studs.
        ceilingOver(ix0, iz0, ix1, iz1, plate + FLOOR_HEIGHT - 1, false);
        for (let x = ix0 + 2; x <= ix1 - 2; x += 4)
          fill(x, plate + 1, iz0 + 2, x, plate + 3, iz0 + 2, B.metal);
      }

      // Curtain wall on the outward face, so the floor has a view.
      for (let z = iz0 + 1; z <= iz1 - 1; z++)
        if (z % 4 !== 0) fill(outward, plate + 1, z, outward, plate + 3, z, B.curtain_wall);

      // Lift doors on the inner wall: up bank north, down bank south.
      fill(t.inner, plate + 1, LIFT_UP_Z, t.inner, plate + 3, LIFT_UP_Z + 1, B.elevator);
      fill(t.inner, plate + 1, LIFT_DOWN_Z, t.inner, plate + 3, LIFT_DOWN_Z + 1, B.elevator);
      const signX = t.innerFace === "w" ? t.inner - 0.05 : t.inner + 1.05;
      sign(`FLOOR ${n}`, signX, plate + 3.6, LIFT_ARRIVAL_Z, t.innerFace, 0.8);

      const up: Vec3 =
        n < FLOORS
          ? { x: t.arrival, y: floorPlate(n + 1) + 1, z: LIFT_ARRIVAL_Z }
          : { ...LIFT_LOBBY };
      const down: Vec3 =
        n > 1
          ? { x: t.arrival, y: floorPlate(n - 1) + 1, z: LIFT_ARRIVAL_Z }
          : { ...LIFT_LOBBY };
      poi({
        id: `lift-${t.key}-${n}`,
        label: n < FLOORS ? `Lift — floor ${n + 1}` : "Lift — Dev Wing lobby",
        sublabel: `${t.label} · going up`,
        panel: "rift",
        teleportTo: up,
        teleportYaw: n < FLOORS ? YAW[t.innerFace] : YAW.w,
        min: { x: t.inner, y: plate + 1, z: LIFT_UP_Z },
        max: { x: t.inner + 1, y: plate + 4, z: LIFT_UP_Z + 2 },
      });
      poi({
        id: `lift-down-${t.key}-${n}`,
        label: n > 1 ? `Lift — floor ${n - 1}` : "Lift — Dev Wing lobby",
        sublabel: `${t.label} · going down`,
        panel: "rift",
        teleportTo: down,
        teleportYaw: n > 1 ? YAW[t.innerFace] : YAW.w,
        min: { x: t.inner, y: plate + 1, z: LIFT_DOWN_Z },
        max: { x: t.inner + 1, y: plate + 4, z: LIFT_DOWN_Z + 2 },
      });

      // The floor's own board, on the north wall.
      const bx = t.x0 + 3;
      fill(bx, plate + 2, TZ0, bx + 3, plate + 3, TZ0, project ? B.whiteboard : B.sign);
      poi({
        id: `city-${t.key}-${n}`,
        label: project ? project.name : `Floor ${n} — available`,
        sublabel: project ? `floor ${n} · project desk` : "no project assigned yet",
        panel: "city",
        refId: project?.id,
        min: { x: bx, y: plate + 2, z: TZ0 },
        max: { x: bx + 4, y: plate + 4, z: TZ0 + 1 },
      });

      if (project) {
        // Two desk pairs. The ground-floor helpers all assume y1, so the tower
        // lays its own furniture out relative to the plate.
        for (const dx of [3, 7])
          for (const dz of [iz0 + 4, iz0 + 8]) {
            set(t.x0 + dx, plate + 1, dz, B.desk);
            set(t.x0 + dx, plate + 2, dz, B.monitor);
            set(t.x0 + dx, plate + 1, dz + 1, B.chair);
          }
      }

      region({
        key: `floor-${t.key}-${n}`,
        label,
        roomId: null,
        min: { x: ix0, y: plate + 1, z: iz0 },
        max: { x: ix1 + 1, y: plate + FLOOR_HEIGHT, z: iz1 + 1 },
      });
    }
  };

  // --- the Upside Down -----------------------------------------------------
  // A sealed box far above the office: only the rift ever puts you in it, so
  // its coordinates are arbitrary — what matters is that nothing connects.

  const buildUpsideDown = (): void => {
    fill(LX0, LY0, LZ0, LX1, LY1, LZ1, B.lair_stone);
    carve(LX0 + 1, LY0 + 1, LZ0 + 1, LX1 - 1, LY1 - 1, LZ1 - 1);
    fill(LX0 + 1, LY0, LZ0 + 1, LX1 - 1, LY0, LZ1 - 1, B.lair_stone);

    // Vines hanging off the shell, and a few glowing pockets for orientation.
    for (let x = LX0 + 3; x < LX1 - 2; x += 5)
      for (let z = LZ0 + 3; z < LZ1 - 2; z += 5) {
        fill(x, LY1 - 3, z, x, LY1 - 1, z, B.lair_vine);
        if ((x + z) % 3 === 0) set(x, LY0 + 1, z, B.lair_glow);
      }

    // Vecna's desk, and the way back.
    const vx = Math.floor((LX0 + LX1) / 2);
    const vz = Math.floor((LZ0 + LZ1) / 2) + 4;
    set(vx, LY0 + 1, vz, B.vecna_flesh);
    set(vx, LY0 + 2, vz, B.monitor);
    sign("B1 — RESTRICTED", vx + 0.5, LY0 + 3.4, vz - 0.95, "s", 0.7, {
      color: "#ffb3a7",
      bg: "#1a0508",
    });
    poi({
      id: "vecna-desk",
      label: "Vecna's Desk",
      sublabel: "the overwatch nobody asked for",
      panel: "lair",
      adminOnly: true,
      min: { x: vx, y: LY0 + 2, z: vz },
      max: { x: vx + 1, y: LY0 + 3, z: vz + 1 },
    });

    const rx = Math.floor(RIFT_LAIR.x);
    const rz = Math.floor(RIFT_LAIR.z);
    fill(rx - 1, LY0 + 1, rz - 2, rx - 1, LY0 + 3, rz, B.obsidian);
    poi({
      id: "rift-out",
      label: "Back through the rift",
      sublabel: "return to the office",
      panel: "rift",
      teleportTo: { ...RIFT_OFFICE },
      teleportYaw: YAW.w,
      min: { x: rx - 1, y: LY0 + 1, z: rz - 2 },
      max: { x: rx, y: LY0 + 4, z: rz + 1 },
    });

    region({
      key: "lair",
      label: "The Upside Down",
      roomId: null,
      lair: true,
      min: { x: LX0 + 1, y: LY0 + 1, z: LZ0 + 1 },
      max: { x: LX1, y: LY1, z: LZ1 },
    });
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

  return {
    sx: SX,
    sy: SY,
    sz: SZ,
    blocks,
    spawn: { x: (DOOR_X0 + DOOR_X1) / 2 + 0.5, y: FLOOR, z: BAND4_Z1 - 0.5 },
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
