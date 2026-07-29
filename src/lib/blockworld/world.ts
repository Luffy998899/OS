// The entire voxel campus, generated as pure data — no DOM, no three.js.
// Deterministic: no randomness, only coordinate hashes where speckle is
// wanted. Coordinates: x east, y up, z south. Fill ranges are inclusive and
// clamp to bounds. Yaw 0 faces -z (north); positive turns clockwise (east).

import { B } from "./blocks";
import type { Poi, Region, TextSign, World } from "./types";

export type WorldInput = {
  rooms: { id: string; key: string; name: string; kind: string }[];
  projects: { id: string; name: string; floor: number; buildingKey: string }[];
};

const SX = 240;
const SY = 48;
const SZ = 200;
const AIR = 0;

export function buildWorld(input: WorldInput): World {
  const blocks = new Uint8Array(SX * SY * SZ);
  const pois: Poi[] = [];
  const regions: Region[] = [];
  const signs: TextSign[] = [];

  const roomId = (...keys: string[]): string | null =>
    input.rooms.find((r) => keys.includes(r.key))?.id ?? null;
  const clientRooms = input.rooms.filter((r) => r.kind === "client");
  const devProjects = input.projects
    .filter((p) => p.buildingKey !== "tools")
    .sort((a, b) => a.floor - b.floor)
    .slice(0, 5);

  // --- primitives ----------------------------------------------------------

  const inBounds = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;

  const set = (x: number, y: number, z: number, id: number): void => {
    if (inBounds(x, y, z)) blocks[(y * SZ + z) * SX + x] = id;
  };

  const get = (x: number, y: number, z: number): number =>
    inBounds(x, y, z) ? blocks[(y * SZ + z) * SX + x] : B.stone;

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

  /** Perimeter walls of a footprint, no top or bottom. */
  const hollowBox = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    id: number,
  ): void => {
    fill(x0, y0, z0, x1, y1, z0, id);
    fill(x0, y0, z1, x1, y1, z1, id);
    fill(x0, y0, z0, x0, y1, z1, id);
    fill(x1, y0, z0, x1, y1, z1, id);
  };

  /** Walls plus a rhythm of glass windows (with optional sill row below). */
  const wallsWithWindows = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    mat: number,
    winY0: number,
    winY1: number,
    sill?: number,
  ): void => {
    hollowBox(x0, z0, x1, z1, y0, y1, mat);
    const punch = (x: number, z: number): void => {
      if (((x + z) & 3) >= 2) return;
      fill(x, winY0, z, x, winY1, z, B.glass);
      if (sill !== undefined) set(x, winY0 - 1, z, sill);
    };
    for (let x = x0 + 2; x <= x1 - 2; x++) {
      punch(x, z0);
      punch(x, z1);
    }
    for (let z = z0 + 2; z <= z1 - 2; z++) {
      punch(x0, z);
      punch(x1, z);
    }
  };

  /** Gabled roof, 1-in-1-up from both long (z) sides, ridge along x. */
  const pitchedRoof = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    yBase: number,
    roofId: number,
    gableId: number,
  ): void => {
    for (let i = 0; z0 + i <= z1 - i; i++) {
      const y = yBase + i;
      fill(x0, y, z0 + i, x1, y, z0 + i, roofId);
      fill(x0, y, z1 - i, x1, y, z1 - i, roofId);
      if (z0 + i + 1 <= z1 - i - 1) {
        fill(x0, y, z0 + i + 1, x0, y, z1 - i - 1, gableId);
        fill(x1, y, z0 + i + 1, x1, y, z1 - i - 1, gableId);
      }
    }
  };

  /** Recessed glowstone in an existing ceiling layer, roughly every 6 blocks. */
  const ceilingLights = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
  ): void => {
    for (let x = x0 + 2; x <= x1 - 2; x += 6)
      for (let z = z0 + 2; z <= z1 - 2; z += 6)
        if (get(x, y, z) !== AIR) set(x, y, z, B.glowstone);
  };

  const lampPost = (x: number, z: number, force = false): void => {
    if (!force) {
      const g = get(x, 8, z);
      if (g !== B.grass && g !== B.path) return;
      if (get(x, 9, z) !== AIR || get(x, 12, z) !== AIR) return;
    }
    fill(x, 9, z, x, 11, z, B.log);
    set(x, 12, z, B.glowstone);
  };

  const tree = (x: number, z: number): void => {
    if (get(x, 8, z) !== B.grass || get(x, 9, z) !== AIR) return;
    const top = 8 + 4 + ((x * 31 + z * 17) % 2);
    for (let y = top; y <= top + 1; y++)
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (get(x + dx, y, z + dz) === AIR) set(x + dx, y, z + dz, B.leaves);
        }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (get(x + dx, top + 2, z + dz) === AIR)
          set(x + dx, top + 2, z + dz, B.leaves);
    for (let y = 9; y <= top; y++) set(x, y, z, B.log);
  };

  const bench = (x: number, z: number, alongX: boolean): void => {
    fill(x, 9, z, alongX ? x + 1 : x, 9, alongX ? z : z + 1, B.slab_plank);
  };

  const deskCluster = (x: number, z: number): void => {
    fill(x, 9, z, x + 1, 9, z, B.desk);
    set(x, 10, z, B.screen);
    fill(x, 9, z + 1, x + 1, 9, z + 1, B.slab_dark);
  };

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

  // --- terrain --------------------------------------------------------------

  const buildTerrain = (): void => {
    fill(0, 0, 0, SX - 1, 5, SZ - 1, B.stone);
    fill(0, 6, 0, SX - 1, 7, SZ - 1, B.dirt);
    fill(0, 8, 0, SX - 1, 8, SZ - 1, B.grass);
  };

  // --- streets --------------------------------------------------------------

  const buildStreets = (): void => {
    fill(118, 8, 16, 122, 8, 184, B.path); // main avenue
    fill(24, 8, 98, 216, 8, 102, B.path); // cross street
    // Spur paths, 3 wide, street to each entrance.
    fill(63, 8, 43, 117, 8, 45, B.path); // dev city (east arch)
    fill(44, 8, 61, 46, 8, 65, B.path); // tools bungalow door
    fill(47, 8, 62, 117, 8, 64, B.path); // bungalow east to avenue
    fill(166, 8, 59, 168, 8, 97, B.path); // video bay to cross street
    fill(186, 8, 95, 189, 8, 98, B.path); // conference hall
    fill(109, 8, 122, 112, 8, 129, B.path); // managing heads from plaza
    fill(52, 8, 103, 54, 8, 129, B.path); // outreach office
    fill(155, 8, 103, 157, 8, 123, B.path); // creative internal door
    fill(171, 8, 103, 173, 8, 123, B.path); // creative clients door
    fill(110, 8, 157, 112, 8, 161, B.path); // shoot studio
    fill(113, 8, 158, 117, 8, 160, B.path); // shoot spur to avenue
  };

  // --- spawn plaza ----------------------------------------------------------

  const buildPlaza = (): void => {
    fill(104, 8, 92, 137, 8, 121, B.marble);
    // Fountain: sandstone rim ring (outer 9x9), water inside, glowing pillar.
    hollowBox(116, 102, 124, 110, 9, 9, B.sandstone);
    fill(117, 9, 103, 123, 9, 109, B.water);
    fill(120, 9, 106, 120, 10, 106, B.sandstone);
    set(120, 11, 106, B.glowstone);
    // Bounty stand on the north edge: whiteboard wall on log posts.
    fill(117, 9, 94, 117, 12, 94, B.log);
    fill(123, 9, 94, 123, 12, 94, B.log);
    fill(118, 10, 94, 122, 12, 94, B.whiteboard);
    poi({
      id: "bounty-board",
      label: "Bounty Board",
      sublabel: "open missions pay points",
      panel: "bounties",
      min: { x: 118, y: 10, z: 94 },
      max: { x: 123, y: 13, z: 95 },
    });
    // Skill stand on the south edge: a wall of books.
    fill(119, 9, 119, 121, 10, 119, B.books);
    poi({
      id: "skill-stand",
      label: "Skill Tree",
      sublabel: "level your craft",
      panel: "skills",
      min: { x: 119, y: 9, z: 119 },
      max: { x: 122, y: 11, z: 120 },
    });
    for (const [x, z] of [
      [105, 93],
      [136, 93],
      [105, 120],
      [136, 120],
    ] as const)
      lampPost(x, z, true);
    bench(116, 113, true);
    bench(123, 113, true);
    bench(113, 104, false);
    bench(127, 104, false);
    region({
      key: "plaza",
      label: "Fountain Plaza",
      roomId: null,
      min: { x: 100, y: 8, z: 88 },
      max: { x: 140, y: 16, z: 124 },
    });
  };

  // --- dev city tower -------------------------------------------------------
  // Footprint x 30..62, z 28..60. Ground floor + 5 storeys (plates at y13,
  // 18, 23, 28, 33), roof at y38. Switchback stairs in the NW corner.

  const STAIR_PLATES = [13, 18, 23, 28, 33, 38];

  /** One tread: slab on progressively taller stone. `h` is the top surface. */
  const tread = (x: number, z: number, h: number): void => {
    const fl = Math.floor(h);
    if (h > fl) {
      set(x, fl, z, B.slab_stone);
      set(x, fl - 1, z, B.stone);
    } else {
      set(x, h - 1, z, B.stone);
      set(x, h - 2, z, B.stone);
    }
  };

  /**
   * One switchback flight from plate surface `s` to `s + 5`: five half-step
   * treads north up the west lane (x33..34), a landing turn, four more south
   * up the east lane (x35..36), arriving on the next plate at z37. Cobble
   * balustrades ride beside every run. Max rise per step: 0.5.
   */
  const switchbackFlight = (s: number): void => {
    for (let i = 1; i <= 5; i++) {
      const z = 38 - i;
      const h = s + i * 0.5;
      tread(33, z, h);
      tread(34, z, h);
      fill(32, s, z, 32, Math.floor(h) + 1, z, B.cobble);
    }
    fill(33, s + 1, 31, 36, s + 2, 32, B.stone); // landing, top at s+3
    fill(33, s + 1, 30, 36, s + 3, 30, B.cobble);
    for (let i = 1; i <= 4; i++) {
      const z = 32 + i;
      const h = s + 3 + i * 0.5;
      tread(35, z, h);
      tread(36, z, h);
      fill(37, s, z, 37, Math.floor(h) + 1, z, B.cobble);
    }
  };

  const buildDevCity = (): void => {
    fill(30, 8, 28, 62, 8, 60, B.marble); // ground floor plate
    // Exterior: cobble corners, blue frame columns every 8, glass curtain
    // walls with blue sills; stone banding on the ground floor.
    for (let x = 30; x <= 62; x++)
      for (const z of [28, 60]) devCityWallCell(x, z);
    for (let z = 29; z <= 59; z++)
      for (const x of [30, 62]) devCityWallCell(x, z);
    // Upper floor plates: planks with a dark border.
    for (let n = 1; n <= 5; n++) {
      const y = 8 + 5 * n;
      fill(31, y, 29, 61, y, 59, B.planks);
      fill(31, y, 29, 61, y, 29, B.planks_dark);
      fill(31, y, 59, 61, y, 59, B.planks_dark);
      fill(31, y, 29, 31, y, 59, B.planks_dark);
      fill(61, y, 29, 61, y, 59, B.planks_dark);
    }
    fill(30, 38, 28, 62, 38, 60, B.roof);
    // Stairwell openings in every plate and the roof; the strip at z38 and
    // the east-lane arrival cell at z37 stay solid so each landing has floor.
    for (const y of STAIR_PLATES) {
      carve(33, y, 31, 34, y, 37);
      carve(35, y, 31, 36, y, 36);
    }
    carve(62, 9, 42, 62, 12, 45); // entrance arch, east face
    for (const s of [9, 14, 19, 24, 29, 34]) switchbackFlight(s);
    // Roof beacon.
    fill(45, 39, 43, 47, 39, 45, B.cobble);
    fill(46, 40, 44, 46, 42, 44, B.glowstone);
    // Lobby: reception desks flanking a red-carpet runner to the stairs.
    fill(56, 9, 41, 56, 9, 42, B.desk);
    fill(56, 9, 45, 56, 9, 46, B.desk);
    fill(37, 9, 43, 61, 9, 44, B.carpet_red);
    fill(33, 9, 39, 36, 9, 44, B.carpet_red);
    sign("DEV CITY", 63.1, 14.5, 44, "e", 2);
    sign("RECEPTION", 57.1, 11.5, 44, "e");
    for (const y of STAIR_PLATES) ceilingLights(33, 31, 59, 57, y);
    // Storeys: one project floor each, remainder under construction.
    for (let n = 1; n <= 5; n++) {
      const plate = 8 + 5 * n;
      const f = plate + 1;
      const proj = n <= devProjects.length ? devProjects[n - 1] : undefined;
      if (proj) {
        fill(44, f, 46, 45, f, 46, B.desk);
        fill(44, f, 45, 45, f + 1, 45, B.screen);
        fill(50, f, 46, 51, f, 46, B.desk);
        fill(50, f, 45, 51, f + 1, 45, B.screen);
        poi({
          id: `city-floor-${n}`,
          label: proj.name,
          sublabel: `floor ${n} — dev desk`,
          panel: "city",
          refId: proj.id,
          min: { x: 44, y: f, z: 45 },
          max: { x: 46, y: f + 2, z: 47 },
        });
        sign(`FLOOR ${n} — ${proj.name}`, 39, plate + 3, 29.1, "s");
      } else {
        for (let x = 31; x <= 61; x++)
          for (const z of [29, 59])
            if ((x + z) % 3 === 0) set(x, f, z, B.scaffold);
        for (let z = 31; z <= 57; z++)
          for (const x of [31, 61])
            if ((x + z) % 3 === 0) set(x, f, z, B.scaffold);
        fill(38, f, 32, 39, f + 1, 33, B.scaffold);
        fill(52, f, 50, 53, f, 51, B.scaffold);
        fill(31, f + 3, 44, 61, f + 3, 44, B.log);
        fill(46, f + 3, 29, 46, f + 3, 59, B.log);
        sign(`FLOOR ${n} — UNDER CONSTRUCTION`, 39, plate + 3, 29.1, "s");
      }
      region({
        key: `dev-city-floor-${n}`,
        label: `Dev City — Floor ${n} · ${proj ? proj.name : "Under construction"}`,
        min: { x: 31, y: plate, z: 29 },
        max: { x: 62, y: plate + 5, z: 60 },
      });
    }
    region({
      key: "dev-city",
      label: "Dev City",
      roomId: roomId("developer"),
      min: { x: 30, y: 8, z: 28 },
      max: { x: 63, y: 43, z: 61 },
    });
  };

  const devCityWallCell = (x: number, z: number): void => {
    const corner = (x === 30 || x === 62) && (z === 28 || z === 60);
    if (corner) {
      fill(x, 9, z, x, 37, z, B.cobble);
      return;
    }
    const column = x === 30 || x === 62 ? z % 8 === 4 : x % 8 === 6;
    if (column) {
      fill(x, 9, z, x, 37, z, B.concrete_blue);
      return;
    }
    fill(x, 9, z, x, 10, z, B.stone);
    fill(x, 11, z, x, 12, z, B.glass);
    for (let n = 1; n <= 5; n++) {
      const plate = 8 + 5 * n;
      set(x, plate, z, B.concrete_blue);
      if (n <= devProjects.length) {
        set(x, plate + 1, z, B.concrete_blue);
        fill(x, plate + 2, z, x, plate + 4, z, B.glass);
      } // else: open sides — the storey is under construction
    }
  };

  // --- internal tools bungalow ---------------------------------------------

  const buildBungalow = (): void => {
    fill(34, 8, 66, 58, 8, 82, B.planks);
    hollowBox(34, 66, 58, 82, 9, 12, B.planks);
    for (const [x, z] of [
      [34, 66],
      [58, 66],
      [34, 82],
      [58, 82],
    ] as const)
      fill(x, 9, z, x, 12, z, B.log);
    for (const [x0, x1] of [
      [38, 39],
      [52, 53],
    ] as const) {
      fill(x0, 10, 66, x1, 11, 66, B.glass);
    }
    for (const z of [70, 71, 76, 77]) {
      fill(34, 10, z, 34, 11, z, B.glass);
      fill(58, 10, z, 58, 11, z, B.glass);
    }
    pitchedRoof(34, 66, 58, 82, 13, B.roof, B.planks);
    carve(45, 9, 66, 46, 11, 66); // north door
    // Library wall, reading tables, fireplace with a brick chimney.
    fill(36, 9, 81, 56, 10, 81, B.books);
    fill(42, 9, 71, 43, 9, 72, B.desk);
    fill(41, 9, 71, 41, 9, 72, B.slab_plank);
    fill(44, 9, 71, 44, 9, 72, B.slab_plank);
    fill(50, 9, 74, 51, 9, 75, B.desk);
    fill(49, 9, 74, 49, 9, 75, B.slab_plank);
    fill(52, 9, 74, 52, 9, 75, B.slab_plank);
    fill(35, 9, 69, 35, 11, 71, B.brick);
    set(35, 9, 70, B.glowstone); // ember
    fill(35, 12, 70, 35, 19, 70, B.brick); // chimney through the roof
    for (const x of [40, 46, 52]) set(x, 13, 74, B.glowstone);
    poi({
      id: "writing-desk",
      label: "Writing desk",
      sublabel: "write scripts & notes",
      panel: "docs",
      min: { x: 42, y: 9, z: 71 },
      max: { x: 44, y: 10, z: 73 },
    });
    poi({
      id: "tools-library",
      label: "Tools library",
      sublabel: "internal tools",
      panel: "city",
      refId: "tools",
      min: { x: 36, y: 9, z: 81 },
      max: { x: 57, y: 11, z: 82 },
    });
    sign("INTERNAL TOOLS", 46, 12.5, 65.9, "n", 1.5);
    region({
      key: "tools-bungalow",
      label: "Tools Bungalow",
      roomId: null,
      min: { x: 34, y: 8, z: 66 },
      max: { x: 59, y: 22, z: 83 },
    });
  };

  // --- video editing bay ----------------------------------------------------

  const buildVideoBay = (): void => {
    fill(150, 8, 28, 184, 8, 58, B.planks);
    hollowBox(150, 28, 184, 58, 9, 13, B.planks_dark);
    fill(150, 14, 28, 184, 14, 58, B.roof);
    ceilingLights(151, 29, 183, 57, 14);
    fill(163, 13, 58, 171, 14, 58, B.concrete_yellow); // marquee band
    carve(166, 9, 58, 168, 12, 58); // south entrance
    fill(154, 9, 32, 180, 9, 52, B.carpet_red);
    fill(159, 9, 29, 166, 12, 29, B.screen); // 8x4 screen wall
    for (const zc of [36, 41, 46]) {
      set(182, 9, zc, B.desk);
      set(182, 10, zc, B.screen);
      set(181, 9, zc, B.slab_dark);
    }
    set(170, 9, 54, B.desk);
    set(170, 10, 54, B.screen);
    poi({
      id: "video-suites",
      label: "Edit bay",
      sublabel: "queue, timers & renders",
      panel: "video",
      min: { x: 181, y: 9, z: 35 },
      max: { x: 183, y: 11, z: 47 },
    });
    poi({
      id: "script-terminal",
      label: "Script terminal",
      sublabel: "write the reel script here",
      panel: "docs",
      min: { x: 170, y: 9, z: 54 },
      max: { x: 171, y: 11, z: 55 },
    });
    sign("VIDEO BAY", 167, 14, 59.1, "s", 2);
    region({
      key: "video-bay",
      label: "Video Editing Bay",
      roomId: roomId("video-editing"),
      min: { x: 150, y: 8, z: 28 },
      max: { x: 185, y: 16, z: 59 },
    });
  };

  // --- conference hall ------------------------------------------------------

  const buildConferenceHall = (): void => {
    fill(190, 8, 80, 224, 8, 112, B.planks);
    wallsWithWindows(190, 80, 224, 112, 9, 13, B.brick, 10, 12, B.sandstone);
    fill(190, 14, 80, 224, 14, 112, B.roof);
    ceilingLights(191, 81, 223, 111, 14);
    carve(190, 9, 95, 190, 12, 97); // west entrance
    fill(191, 9, 95, 199, 9, 97, B.carpet_red);
    fill(200, 9, 96, 209, 9, 96, B.planks_dark); // long table
    fill(200, 9, 95, 209, 9, 95, B.slab_dark);
    fill(200, 9, 97, 209, 9, 97, B.slab_dark);
    fill(215, 9, 88, 223, 9, 104, B.sandstone); // stage
    set(218, 10, 96, B.desk); // lectern
    set(217, 10, 96, B.whiteboard);
    fill(205, 10, 81, 207, 11, 81, B.whiteboard); // noticeboard
    poi({
      id: "lectern",
      label: "Speaker's lectern",
      sublabel: "meetings · post announcements",
      panel: "conference",
      // The engine opens the panel with the composer already up.
      refId: "compose",
      min: { x: 217, y: 10, z: 95 },
      max: { x: 219, y: 11, z: 97 },
    });
    poi({
      id: "announce-board",
      label: "Announcement board",
      sublabel: "read & acknowledge",
      panel: "conference",
      min: { x: 205, y: 10, z: 81 },
      max: { x: 208, y: 12, z: 82 },
    });
    sign("CONFERENCE HALL", 189.9, 13.5, 96, "w", 1.5);
    sign("TOWN HALL", 223.9, 13.5, 96, "w", 1.5);
    region({
      key: "conference-hall",
      label: "Conference Hall",
      roomId: roomId("common-board"),
      min: { x: 190, y: 8, z: 80 },
      max: { x: 225, y: 16, z: 113 },
    });
  };

  // --- task hall ------------------------------------------------------------

  const buildTaskHall = (): void => {
    fill(40, 8, 88, 70, 8, 112, B.planks);
    wallsWithWindows(40, 88, 70, 112, 9, 12, B.concrete_green, 11, 11);
    fill(40, 13, 88, 70, 13, 112, B.roof);
    ceilingLights(41, 89, 69, 111, 13);
    carve(70, 9, 99, 70, 11, 101); // east entrance
    // TO DO / DOING / DONE whiteboard segments on the north wall.
    for (const [x0, label] of [
      [44, "TO DO"],
      [50, "DOING"],
      [56, "DONE"],
    ] as const) {
      fill(x0, 9, 89, x0 + 3, 11, 89, B.whiteboard);
      sign(label, x0 + 2, 12.3, 90.1, "s");
    }
    poi({
      id: "task-wall",
      label: "Task wall",
      sublabel: "your missions & squad work",
      panel: "tasks",
      min: { x: 50, y: 9, z: 89 },
      max: { x: 54, y: 12, z: 90 },
    });
    deskCluster(48, 97);
    deskCluster(58, 97);
    deskCluster(48, 105);
    deskCluster(58, 105);
    sign("TASK HALL", 71.1, 12.5, 100, "e", 1.5);
    region({
      key: "task-hall",
      label: "Task Hall",
      roomId: roomId("tasks"),
      min: { x: 40, y: 8, z: 88 },
      max: { x: 71, y: 15, z: 113 },
    });
  };

  // --- managing heads + the rift room --------------------------------------

  const buildManagingHeads = (): void => {
    fill(96, 8, 130, 126, 8, 156, B.marble);
    wallsWithWindows(96, 130, 126, 156, 9, 13, B.concrete_white, 11, 12);
    fill(96, 14, 130, 126, 14, 156, B.roof);
    ceilingLights(97, 131, 125, 155, 14);
    carve(109, 9, 130, 112, 12, 130); // north entrance
    // Front office: approvals counter with a carpet from the door.
    fill(108, 9, 138, 111, 9, 138, B.desk);
    fill(110, 9, 131, 111, 9, 137, B.carpet_red);
    poi({
      id: "approvals-desk",
      label: "Approvals desk",
      sublabel: "leave & sign-offs",
      panel: "approvals",
      min: { x: 108, y: 9, z: 138 },
      max: { x: 112, y: 10, z: 139 },
    });
    // Back chamber, divided by an interior wall with a 2-wide doorway.
    fill(97, 9, 147, 125, 13, 147, B.concrete_white);
    carve(110, 9, 147, 111, 11, 147);
    hollowBox(104, 149, 118, 154, 8, 8, B.obsidian); // inlaid floor ring
    // The rift: obsidian ring, lair-glow core, vines to either side.
    fill(108, 9, 155, 112, 13, 155, B.obsidian);
    fill(109, 10, 155, 111, 12, 155, B.lair_glow);
    fill(107, 9, 155, 107, 12, 155, B.lair_vine);
    fill(113, 9, 155, 113, 12, 155, B.lair_vine);
    sign("THE RIFT", 110.5, 13.5, 154.85, "n", 1, {
      color: "#ff8f85",
      bg: "#1a060d",
    });
    poi({
      id: "rift-in",
      label: "Enter the rift",
      sublabel: "The Upside Down — admins only",
      panel: "rift",
      adminOnly: true,
      teleportTo: { x: 98.5, y: 1, z: 144.5 },
      teleportYaw: Math.PI / 2, // face east, into the lair
      min: { x: 107, y: 9, z: 154 },
      max: { x: 114, y: 14, z: 156 },
    });
    sign("MANAGING HEADS", 110.5, 13.5, 129.9, "n", 1.5);
    region({
      key: "managing-heads",
      label: "Managing Heads",
      roomId: roomId("managing-heads"),
      min: { x: 96, y: 8, z: 130 },
      max: { x: 127, y: 16, z: 157 },
    });
  };

  // --- the upside down ------------------------------------------------------
  // Carved out of the deep ground under the south campus; the only ways in
  // are the two rifts (teleports), so the cavern stays sealed from spawn.

  const buildUpsideDown = (): void => {
    fill(92, 0, 118, 152, 7, 172, B.lair_stone); // shell
    carve(93, 1, 119, 151, 6, 171);
    // Rough pillars, floor to ceiling.
    for (const [x, z] of [
      [100, 127],
      [108, 133],
      [102, 157],
      [112, 162],
      [122, 126],
      [126, 156],
      [134, 127],
      [138, 163],
      [128, 146],
      [106, 152],
    ] as const)
      fill(x, 1, z, x + 1, 6, z + 1, B.lair_stone);
    // Red vines climbing walls and pillars.
    for (const [x, z] of [
      [93, 124],
      [93, 130],
      [93, 136],
      [93, 152],
      [93, 158],
      [93, 164],
      [151, 126],
      [151, 134],
      [151, 156],
      [151, 162],
      [104, 119],
      [116, 119],
      [128, 119],
      [140, 119],
      [100, 171],
      [112, 171],
      [124, 171],
      [136, 171],
      [148, 171],
      [99, 127],
      [110, 133],
      [127, 147],
    ] as const)
      fill(x, 1, z, x, 2 + ((x + z) % 3), z, B.lair_vine);
    // Glow crystals embedded in the shell — the only light down here.
    for (const [x, z] of [
      [97, 125],
      [103, 150],
      [109, 128],
      [115, 158],
      [121, 131],
      [127, 150],
      [133, 124],
      [139, 157],
      [145, 127],
      [99, 163],
      [111, 143],
      [117, 124],
      [129, 166],
      [141, 135],
      [147, 152],
      [135, 143],
      [105, 137],
      [123, 159],
    ] as const)
      set(x, 0, z, B.lair_glow);
    set(92, 2, 128, B.lair_glow);
    set(92, 3, 148, B.lair_glow);
    set(152, 2, 132, B.lair_glow);
    set(152, 4, 160, B.lair_glow);
    set(122, 7, 140, B.lair_glow);
    set(134, 7, 152, B.lair_glow);
    // Vecna's throne on a flesh dais, his desk watching the floor.
    fill(144, 1, 141, 148, 1, 145, B.vecna_flesh);
    set(146, 2, 143, B.vecna_flesh);
    fill(146, 2, 142, 146, 2, 142, B.obsidian);
    fill(146, 2, 144, 146, 2, 144, B.obsidian);
    fill(147, 2, 142, 147, 4, 144, B.obsidian);
    set(147, 5, 143, B.vecna_flesh);
    fill(142, 1, 143, 142, 1, 144, B.desk);
    set(142, 2, 143, B.screen);
    poi({
      id: "vecna-desk",
      label: "Vecna's Desk",
      sublabel: "watch the floor · send demogorgons",
      panel: "lair",
      min: { x: 142, y: 1, z: 142 },
      max: { x: 143, y: 3, z: 145 },
    });
    // Demogorgon statue: flesh legs/torso/arms, petal-bloom head.
    for (const x of [117, 119]) fill(x, 1, 143, x, 2, 143, B.vecna_flesh);
    fill(117, 3, 143, 119, 4, 143, B.vecna_flesh);
    for (const x of [116, 120]) fill(x, 3, 143, x, 4, 143, B.vecna_flesh);
    set(118, 5, 143, B.lair_glow); // bloom core
    for (const [dx, dy, dz] of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ] as const)
      set(118 + dx, 5 + dy, 143 + dz, B.vecna_flesh);
    // Return rift on the west wall.
    fill(93, 1, 142, 93, 5, 146, B.obsidian);
    fill(93, 2, 143, 93, 4, 145, B.lair_glow);
    poi({
      id: "rift-out",
      label: "Back through the rift",
      sublabel: "return to the right side up",
      panel: "rift",
      teleportTo: { x: 110.5, y: 9, z: 152.5 },
      teleportYaw: 0, // face north, back into the office
      min: { x: 93, y: 1, z: 142 },
      max: { x: 94, y: 6, z: 147 },
    });
    sign("THE UPSIDE DOWN", 95.6, 4, 144.5, "e", 1.5, {
      color: "#ff8f85",
      bg: "#12040a",
    });
    region({
      key: "lair",
      label: "The Upside Down",
      roomId: null,
      lair: true,
      min: { x: 93, y: 0, z: 119 },
      max: { x: 152, y: 8, z: 172 },
    });
  };

  // --- outreach office ------------------------------------------------------

  const buildOutreach = (): void => {
    fill(40, 8, 130, 66, 8, 152, B.planks);
    wallsWithWindows(40, 130, 66, 152, 9, 12, B.concrete_teal, 11, 11);
    fill(40, 13, 130, 66, 13, 152, B.roof);
    ceilingLights(41, 131, 65, 151, 13);
    carve(52, 9, 130, 54, 11, 130); // north entrance
    for (const x of [46, 52, 58]) {
      set(x, 9, 138, B.desk);
      set(x, 10, 138, B.screen);
    }
    fill(44, 9, 151, 50, 11, 151, B.whiteboard);
    sign("SECTORS", 47.5, 11.7, 150.9, "n");
    poi({
      id: "outreach-desks",
      label: "Outreach desk",
      sublabel: "sectors, day plan, OTP",
      panel: "outreach",
      min: { x: 46, y: 9, z: 138 },
      max: { x: 59, y: 11, z: 139 },
    });
    sign("OUTREACH", 53, 12.5, 129.9, "n", 1.5);
    region({
      key: "outreach-office",
      label: "Outreach Office",
      roomId: roomId("outreach", "client"),
      min: { x: 40, y: 8, z: 130 },
      max: { x: 67, y: 15, z: 153 },
    });
  };

  // --- creative studio ------------------------------------------------------

  const buildCreativeStudio = (): void => {
    fill(150, 8, 124, 180, 8, 152, B.planks);
    wallsWithWindows(150, 124, 180, 152, 9, 12, B.concrete_green, 11, 11);
    fill(150, 13, 124, 180, 13, 152, B.roof);
    fill(151, 13, 136, 179, 13, 139, B.glass); // atrium roof band
    ceilingLights(151, 125, 179, 151, 13);
    fill(165, 9, 125, 165, 12, 151, B.planks); // partition into two wings
    carve(156, 9, 124, 157, 11, 124); // internal door
    carve(172, 9, 124, 173, 11, 124); // clients door
    fill(154, 9, 151, 157, 11, 151, B.whiteboard);
    fill(170, 9, 151, 173, 11, 151, B.whiteboard);
    // Paint splashes on interior walls.
    set(150, 10, 133, B.concrete_yellow);
    set(150, 11, 144, B.concrete_purple);
    set(180, 10, 138, B.concrete_teal);
    set(165, 10, 130, B.concrete_yellow);
    set(165, 11, 146, B.concrete_purple);
    poi({
      id: "creative-internal",
      label: "Internal studio",
      sublabel: "house boards & ideas",
      panel: "creative",
      refId: "internal",
      min: { x: 154, y: 9, z: 151 },
      max: { x: 158, y: 12, z: 152 },
    });
    poi({
      id: "creative-clients",
      label: "Client studio",
      sublabel: "client houses & boards",
      panel: "creative",
      refId: "clients",
      min: { x: 170, y: 9, z: 151 },
      max: { x: 174, y: 12, z: 152 },
    });
    sign("CREATIVE STUDIO", 165.5, 13.4, 123.9, "n", 1.6);
    sign("INTERNAL", 157, 12.3, 123.9, "n");
    sign("CLIENTS", 173, 12.3, 123.9, "n");
    region({
      key: "creative-studio",
      label: "Creative Studio",
      roomId: roomId("creative"),
      min: { x: 150, y: 8, z: 124 },
      max: { x: 181, y: 15, z: 153 },
    });
  };

  // --- shoot studio ---------------------------------------------------------

  const buildShootStudio = (): void => {
    fill(96, 8, 162, 126, 8, 188, B.concrete_white);
    hollowBox(96, 162, 126, 188, 9, 15, B.concrete_white);
    fill(96, 16, 162, 126, 16, 188, B.roof);
    ceilingLights(97, 163, 125, 187, 16);
    carve(110, 9, 162, 112, 12, 162); // north entrance
    fill(97, 9, 187, 125, 9, 187, B.slab_sandstone); // cyclorama junction
    fill(125, 9, 168, 125, 13, 175, B.concrete_green); // green screen 8x5
    // Camera rig: log tripod with a screen head, aimed at the green screen.
    set(101, 9, 172, B.log);
    set(103, 9, 172, B.log);
    set(102, 9, 170, B.log);
    fill(102, 9, 171, 102, 10, 171, B.log);
    set(102, 11, 171, B.screen);
    for (const [x, z] of [
      [98, 165],
      [124, 165],
      [98, 184],
      [124, 184],
    ] as const) {
      fill(x, 9, z, x, 12, z, B.log);
      set(x, 13, z, B.glowstone);
    }
    poi({
      id: "camera-rig",
      label: "Camera rig",
      sublabel: "this week's call sheet",
      panel: "shoot",
      min: { x: 101, y: 9, z: 170 },
      max: { x: 104, y: 12, z: 173 },
    });
    sign("SHOOT STUDIO", 111.5, 13.5, 161.9, "n", 2);
    region({
      key: "shoot-studio",
      label: "Shoot Studio",
      roomId: roomId("shoot", "creativity"),
      min: { x: 96, y: 8, z: 162 },
      max: { x: 127, y: 18, z: 189 },
    });
  };

  // --- clock tower ----------------------------------------------------------

  const buildClockTower = (): void => {
    fill(148, 8, 90, 160, 8, 102, B.sandstone); // paved lot
    hollowBox(150, 92, 157, 99, 9, 29, B.sandstone);
    fill(150, 30, 92, 157, 30, 99, B.sandstone);
    carve(153, 9, 99, 154, 11, 99); // south door onto the cross street
    // 3x3 clock faces on all four sides.
    fill(152, 24, 92, 154, 26, 92, B.clock);
    fill(152, 24, 99, 154, 26, 99, B.clock);
    fill(150, 24, 94, 150, 26, 96, B.clock);
    fill(157, 24, 94, 157, 26, 96, B.clock);
    // Bell chamber: open arches and a glowstone bell.
    carve(152, 27, 92, 153, 28, 92);
    carve(152, 27, 99, 153, 28, 99);
    carve(150, 27, 94, 150, 28, 95);
    carve(157, 27, 95, 157, 28, 96);
    set(153, 28, 95, B.glowstone);
    set(153, 9, 95, B.glowstone); // shaft light at the base
    fill(150, 10, 99, 152, 11, 99, B.whiteboard); // noticeboard
    poi({
      id: "timetable-board",
      label: "The bell schedule",
      sublabel: "school bell · check-ins",
      panel: "timetable",
      min: { x: 150, y: 10, z: 99 },
      max: { x: 153, y: 12, z: 100 },
    });
    sign("CLOCK TOWER", 154, 12.4, 100.1, "s", 1.6);
    region({
      key: "clock-tower",
      label: "Clock Tower",
      roomId: roomId("timetable"),
      min: { x: 148, y: 8, z: 90 },
      max: { x: 161, y: 31, z: 103 },
    });
  };

  // --- client shops row -----------------------------------------------------

  const AWNINGS = [
    B.concrete_red,
    B.concrete_yellow,
    B.concrete_purple,
    B.concrete_teal,
    B.concrete_blue,
  ];

  const buildClientShops = (): void => {
    clientRooms.forEach((room, i) => {
      const row = Math.floor(i / 4);
      const x0 = 172 + (i % 4) * 12;
      const x1 = x0 + 10;
      const z0 = row === 0 ? 104 : 116;
      const z1 = z0 + 7;
      fill(x0, 8, z0, x1, 8, z1, B.planks);
      carve(x0 + 1, 9, z0 + 1, x1 - 1, 12, z1 - 1); // clear any older walls
      hollowBox(x0, z0, x1, z1, 9, 12, B.planks);
      fill(x0, 12, z0, x1, 12, z0, AWNINGS[i % AWNINGS.length]);
      fill(x0, 13, z0, x1, 13, z1, B.planks_dark);
      set(x0 + 5, 13, z0 + 4, B.glowstone);
      carve(x0 + 4, 9, z0, x0 + 5, 11, z0); // 2-wide door, north face
      fill(x0 + 3, 9, z0 + 4, x0 + 7, 9, z0 + 4, B.desk); // counter
      fill(x0 + 4, 8, z0 - 1, x0 + 5, 8, z0 - 1, B.path);
      sign(room.name, x0 + 5.5, 12.5, z0 - 0.1, "n", 1.5);
      poi({
        id: `client-${room.id}`,
        label: room.name,
        sublabel: "client missions",
        panel: "client",
        refId: room.id,
        min: { x: x0 + 3, y: 9, z: z0 + 4 },
        max: { x: x0 + 8, y: 10, z: z0 + 5 },
      });
      region({
        key: `client-${room.id}`,
        label: room.name,
        roomId: room.id,
        min: { x: x0, y: 8, z: z0 },
        max: { x: x1 + 1, y: 14, z: z1 + 1 },
      });
    });
  };

  // --- park & landscape -----------------------------------------------------

  const buildLandscape = (): void => {
    // Pond in the south-west, sandstone rim, two trees beside it.
    hollowBox(30, 168, 44, 182, 8, 8, B.sandstone);
    fill(31, 8, 169, 43, 8, 181, B.water);
    for (const [x, z] of [
      [98, 88],
      [142, 88],
      [98, 124],
      [142, 124],
      [112, 20],
      [128, 24],
      [110, 64],
      [132, 64],
      [150, 66],
      [166, 64],
      [186, 66],
      [228, 90],
      [26, 40],
      [70, 20],
      [76, 74],
      [24, 90],
      [78, 140],
      [70, 166],
      [88, 178],
      [28, 166],
      [46, 184],
    ] as const)
      tree(x, z);
    bench(115, 40, false);
    bench(125, 66, false);
    bench(115, 84, false);
    // Street lamps roughly every 14 blocks; skipped where anything is built.
    for (let z = 20; z <= 180; z += 14) {
      lampPost(116, z);
      lampPost(124, z);
    }
    for (let x = 28; x <= 212; x += 14) {
      lampPost(x, 96);
      lampPost(x, 104);
    }
  };

  // --- assemble -------------------------------------------------------------

  buildTerrain();
  buildStreets();
  buildUpsideDown();
  buildPlaza();
  buildDevCity();
  buildBungalow();
  buildVideoBay();
  buildConferenceHall();
  buildTaskHall();
  buildManagingHeads();
  buildOutreach();
  buildCreativeStudio();
  buildShootStudio();
  buildClockTower();
  buildClientShops();
  buildLandscape();

  return {
    sx: SX,
    sy: SY,
    sz: SZ,
    blocks,
    spawn: { x: 120.5, y: 9, z: 112.5 },
    spawnYaw: 0, // yaw 0 faces -z, toward the fountain
    pois,
    regions,
    signs,
    lair: { min: { x: 93, y: 1, z: 119 }, max: { x: 152, y: 7, z: 172 } },
  };
}
