"use client";

// Full-window first-person view of the office floor.
//
// The floor is stored as axis-aligned rectangles in top-down world space, which
// is exactly what a raycaster wants — so this renders it the way somebody
// standing in the room would see it. Walls, floor and ceiling are cast into a
// pixel buffer with a depth value per pixel; crew and props are blitted over it
// as depth-tested billboards. There is no third-person camera anywhere: the eye
// is at 1.5m, inside the player.
//
// The maths all lives in @/lib/fps so it can be tested without a canvas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crosshair,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import {
  buildLayout,
  resolveCollision,
  roomIdAt,
  type Layout,
  type RoomGeom,
} from "@/lib/workspace-map";
import {
  CEILING_HEIGHT,
  DESK_HEIGHT,
  MAX_PITCH,
  VIEW_DISTANCE,
  buildCastGrid,
  buildFloorIndex,
  buildSolids,
  castRay,
  clamp,
  columnRay,
  facingBucket,
  makeCamera,
  moveVector,
  pickTarget,
  projectHeight,
  projectSprite,
  type CastGrid,
  type FloorIndex,
  type Hit,
  type Solid,
} from "@/lib/fps";
import { characterFor, type Character } from "@/lib/characters";
import { SKILL_META } from "@/lib/skills";
import { levelInfo } from "@/lib/xp";
import { cn } from "@/lib/utils";
import {
  bountyBoardSprite,
  coolerSprite,
  crewSprite,
  missionBoardSprite,
  monitorSprite,
  plantSprite,
  type Orientation,
  type SpriteBitmap,
} from "./sprites";
import { BountyBoardPanel } from "./bounty-board";
import { SkillTreePanel } from "./skill-tree";
import { RoomMissionsPanel } from "./room-missions-panel";
import { CrewRosterPanel } from "./crew-roster";

const WALK_SPEED = 1.55;
const SPRINT_SPEED = 2.55;
const LOOK_SENSITIVITY = 0.0023;
const TURN_KEY_SPEED = 0.035;
const INTERACT_RANGE = 115;
const SAVE_INTERVAL_MS = 900;
const RENDER_SCALE = 0.44;
const FLOOR_TILE = 50;
const CEILING_PANEL = 200;

type OverlayKind = "missions" | "bounties" | "skills" | "roster" | "help" | null;

type Interactable = {
  kind: "room" | "bounty";
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
};

type Prop = {
  x: number;
  y: number;
  baseZ: number;
  worldW: number;
  worldH: number;
  bitmap: SpriteBitmap;
  glow: string | null;
};

type RemotePlayer = {
  userId: string;
  name: string;
  x: number;
  y: number;
  facing: number;
  status: string;
  character: Character;
};

// Real-world sizes for the billboards, in the same units as the floor plan
// (~2.3cm each — a person's collision radius is 11). Each pair keeps the
// sprite's own pixel aspect so nothing renders stretched: a whiteboard is 1.2m
// across and 1.8m tall because that's what a whiteboard is.
const PROP_SIZE = {
  missionBoard: { worldW: 51, worldH: 76 },
  bountyBoard: { worldW: 61, worldH: 78 },
  plant: { worldW: 33, worldH: 46 },
  monitor: { worldW: 26, worldH: 22 },
  cooler: { worldW: 31, worldH: 58 },
} as const;

/** Crew sprites are 52x64; 70 units tall works out at about 1.65m. */
const CREW_SIZE = { worldW: 57, worldH: 70 };

/**
 * Packed little-endian RGBA, which is what a Uint32 view of ImageData wants.
 * Channels are clamped, not masked — a lit surface can compute past 255 and
 * wrapping it turns a highlight into a completely different colour.
 */
function pack(r: number, g: number, b: number): number {
  return (
    (255 << 24) |
    ((b > 255 ? 255 : b < 0 ? 0 : b) << 16) |
    ((g > 255 ? 255 : g < 0 ? 0 : g) << 8) |
    (r > 255 ? 255 : r < 0 ? 0 : r)
  );
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const FOG: [number, number, number] = [198, 192, 178];
const CORRIDOR: [number, number, number] = [172, 165, 148];
const CEIL_BASE: [number, number, number] = [228, 224, 214];
const CEIL_PANEL: [number, number, number] = [250, 248, 242];

/** Mix a colour toward the fog by `f` (0 near, 1 far) and scale by `light`. */
function fogged(
  rgb: [number, number, number],
  light: number,
  f: number,
): number {
  const r = rgb[0] * light * (1 - f) + FOG[0] * f;
  const g = rgb[1] * light * (1 - f) + FOG[1] * f;
  const b = rgb[2] * light * (1 - f) + FOG[2] * f;
  return pack(r, g, b);
}

/**
 * Aerial haze. Gentle enough that the far side of the floor stays legible —
 * this is a bright office, not a dungeon — but strong enough to give depth.
 */
function fogAmount(depth: number): number {
  const t = depth / VIEW_DISTANCE;
  return t <= 0 ? 0 : t >= 1 ? 0.86 : Math.pow(t, 1.15) * 0.86;
}

export function FirstPersonFloor({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 3500 });
  const enter = trpc.workspace.enter.useMutation();
  const move = trpc.workspace.move.useMutation();

  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [locked, setLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [prompt, setPrompt] = useState<Interactable | null>(null);
  const [activeRoom, setActiveRoom] = useState<{ id: string; name: string } | null>(null);
  const [hud, setHud] = useState({ fps: 0, room: "Corridor" });
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
  const [bob, setBob] = useState(true);

  const layout: Layout = useMemo(
    () => buildLayout((state.data?.rooms ?? []).map((r) => ({ ...r }))),
    [state.data?.rooms],
  );

  const R = useEngine();
  R.layout = layout;

  const overlayRef = useRef<OverlayKind>(null);
  overlayRef.current = overlay;

  const myCharacter = useMemo(
    () => characterFor(myCharacterId, currentUser.id),
    [myCharacterId, currentUser.id],
  );

  // Claim a crew slot the moment the player steps onto the floor.
  useEffect(() => {
    let cancelled = false;
    enter.mutate(undefined, {
      onSuccess: (res) => {
        if (cancelled) return;
        setMyCharacterId(res.characterId ?? null);
        if (!R.spawned && (res.x || res.y)) {
          R.x = res.x;
          R.y = res.y;
          R.spawned = true;
        }
      },
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geometry — rebuilt only when the floor plan itself changes.
  useEffect(() => {
    if (layout.rooms.length === 0) return;
    R.solids = buildSolids(layout);
    R.grid = buildCastGrid(R.solids, layout.world);
    R.floorIndex = buildFloorIndex(layout);
    R.floorPalette = [
      CORRIDOR,
      ...layout.rooms.map((room) => {
        const [r, g, b] = hexRgb(room.accent);
        // Carpet: the room's accent knocked back into a muted office weave —
        // enough colour to tell rooms apart underfoot, dark enough that the
        // pale partitions and desks stand out against it.
        return [
          r * 0.38 + 150 * 0.62,
          g * 0.38 + 144 * 0.62,
          b * 0.38 + 128 * 0.62,
        ] as [number, number, number];
      }),
    ];
    if (!R.spawned) {
      R.x = layout.spawn.x;
      R.y = layout.spawn.y;
      R.yaw = Math.PI / 2;
      R.spawned = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Props and interaction targets follow the live mission counts.
  const interactables = useMemo<Interactable[]>(() => {
    if (layout.rooms.length === 0) return [];
    const out: Interactable[] = layout.rooms.map((room) => ({
      kind: "room" as const,
      id: room.id,
      name: room.name,
      subtitle:
        room.missionCount > 0
          ? `${room.missionCount} open mission${room.missionCount === 1 ? "" : "s"}`
          : "No open missions",
      x: room.board.x,
      y: room.board.y,
    }));
    const hub = hubRoom(layout);
    if (hub) {
      const spot = bountyBoardSpot(hub);
      out.push({
        kind: "bounty",
        id: "bounty-board",
        name: "Bounty Board",
        subtitle: `${state.data?.totalBounties ?? 0} unclaimed`,
        ...spot,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, state.data?.totalBounties]);

  R.interactables = interactables;

  useEffect(() => {
    if (layout.rooms.length === 0) return;
    const rooms = state.data?.rooms ?? [];
    const props: Prop[] = [];
    for (const room of layout.rooms) {
      const live = rooms.find((r) => r.id === room.id);
      const bounties = live?.bountyCount ?? 0;
      props.push({
        x: room.board.x,
        y: room.board.y,
        baseZ: 0,
        ...PROP_SIZE.missionBoard,
        bitmap: missionBoardSprite({
          accent: room.accent,
          missions: room.missionCount,
          bounties,
          highlighted: room.missionCount > 0,
        }),
        glow: room.missionCount > 0 ? room.accent : null,
      });
      // Plants tucked into the far corners, monitors on the desks.
      props.push({
        x: room.rect.x + 26,
        y: room.rect.y + 26,
        baseZ: 0,
        ...PROP_SIZE.plant,
        bitmap: plantSprite(room.posX + room.posY),
        glow: null,
      });
      props.push({
        x: room.rect.x + room.rect.w - 26,
        y: room.rect.y + 26,
        baseZ: 0,
        ...PROP_SIZE.plant,
        bitmap: plantSprite(room.posX + room.posY + 1),
        glow: null,
      });
      for (const desk of room.desks) {
        props.push({
          x: desk.x + desk.w / 2,
          y: desk.y + desk.h / 2,
          baseZ: DESK_HEIGHT,
          ...PROP_SIZE.monitor,
          bitmap: monitorSprite(room.accent),
          glow: null,
        });
      }
    }
    const hub = hubRoom(layout);
    if (hub) {
      const spot = bountyBoardSpot(hub);
      const open = state.data?.totalBounties ?? 0;
      props.push({
        ...spot,
        baseZ: 0,
        ...PROP_SIZE.bountyBoard,
        bitmap: bountyBoardSprite(open, open > 0),
        glow: open > 0 ? "#e0574f" : null,
      });
      props.push({
        x: hub.rect.x + 34,
        y: hub.rect.y + hub.rect.h - 34,
        baseZ: 0,
        ...PROP_SIZE.cooler,
        bitmap: coolerSprite(),
        glow: null,
      });
    }
    R.props = props;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, state.data?.rooms, state.data?.totalBounties]);

  // Remote crew.
  useEffect(() => {
    R.others = (state.data?.players ?? [])
      .filter((p) => !p.isMe)
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        x: p.x || layout.spawn.x,
        y: p.y || layout.spawn.y,
        facing: p.facing ?? 0,
        status: p.status,
        character: characterFor(p.characterId, p.userId),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.players, layout]);

  useEffect(() => {
    R.myCharacter = myCharacter;
    R.myStatus = state.data?.me?.status ?? "online";
  }, [myCharacter, state.data?.me?.status, R]);

  const openInteraction = useCallback(() => {
    const target = R.nearTarget;
    if (!target) return;
    if (target.kind === "bounty") {
      setOverlay("bounties");
    } else {
      setActiveRoom({ id: target.id, name: target.name });
      setOverlay("missions");
    }
  }, [R]);

  const requestLock = useCallback(() => {
    if (overlayRef.current) return;
    canvasEl?.requestPointerLock?.();
  }, [canvasEl]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be refused (permissions policy, iOS); the fixed overlay
      // already fills the window, so this is a nicety rather than a requirement.
    }
  }, []);

  // Enter fullscreen off the click that mounted us, and hand it back on exit.
  useEffect(() => {
    void toggleFullscreen();
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer lock — the mouse becomes the head.
  useEffect(() => {
    if (!canvasEl) return;
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === canvasEl;
      setLocked(isLocked);
      if (!isLocked) R.keys.clear();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasEl) return;
      R.yaw += e.movementX * LOOK_SENSITIVITY;
      R.pitch = clamp(R.pitch - e.movementY * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [canvasEl, R]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (overlayRef.current) {
          setOverlay(null);
          e.preventDefault();
        } else if (document.pointerLockElement) {
          // Let the browser release the pointer; a second Escape leaves.
        } else {
          onExit();
        }
        return;
      }
      if (overlayRef.current) return;
      if (["tab", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
      }
      switch (k) {
        case "e":
          openInteraction();
          return;
        case "b":
          setOverlay("bounties");
          return;
        case "t":
          setOverlay("skills");
          return;
        case "tab":
          setOverlay("roster");
          return;
        case "h":
        case "?":
          setOverlay("help");
          return;
        case "f":
          void toggleFullscreen();
          return;
        default:
          R.keys.add(k);
      }
    };
    const up = (e: KeyboardEvent) => R.keys.delete(e.key.toLowerCase());
    const blur = () => R.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [R, onExit, openInteraction, toggleFullscreen]);

  useEffect(() => {
    if (overlay) {
      R.keys.clear();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }, [overlay, R]);

  // ---- render loop -------------------------------------------------------
  useEffect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsAt = last;
    let bufW = 0;
    let bufH = 0;
    let image: ImageData | null = null;
    let colors: Uint32Array = new Uint32Array(0);
    let depth: Float32Array = new Float32Array(0);
    const hits: Hit[] = [];
    // Row palettes: [roomIndex * 2 + parity] resolved once per scanline.
    let rowPalette = new Uint32Array(0);

    const resize = () => {
      const cssW = Math.max(320, canvasEl.clientWidth);
      const cssH = Math.max(240, canvasEl.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvasEl.width = Math.round(cssW * dpr);
      canvasEl.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = Math.round(clamp(cssW * RENDER_SCALE, 340, 760));
      const h = Math.max(200, Math.round((w * cssH) / cssW));
      if (w === bufW && h === bufH) return;
      bufW = w;
      bufH = h;
      off.width = w;
      off.height = h;
      image = offCtx.createImageData(w, h);
      colors = new Uint32Array(image.data.buffer);
      depth = new Float32Array(w * h);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const update = (dt: number, now: number) => {
      const grid = R.grid;
      if (!grid) return;
      const keys = R.keys;
      let forward = 0;
      let strafe = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("d")) strafe += 1;
      if (keys.has("a")) strafe -= 1;
      // Arrow left/right turn the head for anyone not using the mouse.
      if (keys.has("arrowleft")) R.yaw -= TURN_KEY_SPEED * dt;
      if (keys.has("arrowright")) R.yaw += TURN_KEY_SPEED * dt;

      const sprinting = keys.has("shift");
      const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * dt;
      const step = moveVector(R.yaw, forward, strafe, speed);
      let moving = false;
      if (step.dx !== 0 || step.dy !== 0) {
        const next = resolveCollision(
          R.solids as unknown as Solid[],
          R.x,
          R.y,
          R.x + step.dx,
          R.y + step.dy,
          R.layout.world,
        );
        if (Math.abs(next.x - R.x) > 0.01 || Math.abs(next.y - R.y) > 0.01) {
          moving = true;
          R.moved = true;
        }
        R.x = next.x;
        R.y = next.y;
      }
      R.bobPhase += moving ? speed * 0.32 : 0;
      R.bobTarget = moving ? (sprinting ? 1 : 0.65) : 0;
      R.bobAmount += (R.bobTarget - R.bobAmount) * Math.min(1, 0.15 * dt);

      const dirX = Math.cos(R.yaw);
      const dirY = Math.sin(R.yaw);
      const target = pickTarget(
        { x: R.x, y: R.y, dirX, dirY },
        R.interactables,
        INTERACT_RANGE,
        0.1,
      );
      if (target?.id !== R.nearTarget?.id) {
        R.nearTarget = target;
        setPrompt(target ?? null);
      }

      if (R.moved && now - R.lastSave > SAVE_INTERVAL_MS) {
        R.lastSave = now;
        R.moved = false;
        move.mutate({
          x: Math.round(R.x),
          y: Math.round(R.y),
          facing: Number(R.yaw.toFixed(3)),
          roomId: roomIdAt(R.layout.rooms, R.x, R.y),
        });
      }
    };

    const drawWorld = () => {
      const grid = R.grid;
      const index = R.floorIndex;
      if (!grid || !index || !image) return;

      const bobPx =
        bob && R.bobAmount > 0.01
          ? Math.sin(R.bobPhase) * 2.6 * R.bobAmount * (bufH / 360)
          : 0;
      const cam = makeCamera({
        x: R.x,
        y: R.y,
        yaw: R.yaw,
        pitch: R.pitch,
        width: bufW,
        height: bufH,
        bob: bobPx,
      });
      R.cam = cam;

      const palette = R.floorPalette;
      const paletteSize = palette.length * 2;
      if (rowPalette.length < paletteSize) rowPalette = new Uint32Array(paletteSize);

      const leftX = cam.dirX - cam.planeX;
      const leftY = cam.dirY - cam.planeY;
      const rightX = cam.dirX + cam.planeX;
      const rightY = cam.dirY + cam.planeY;
      const invCell = 1 / index.cell;
      const invTile = 1 / FLOOR_TILE;
      const invPanel = 1 / CEILING_PANEL;
      const horizon = cam.horizon;

      // ---- floor ----
      const floorStart = Math.max(0, Math.ceil(horizon + 0.5));
      for (let y = floorStart; y < bufH; y++) {
        const p = y - horizon;
        if (p <= 0.0001) continue;
        const rowDist = (cam.eye * cam.projDist) / p;
        const f = fogAmount(rowDist);
        for (let i = 0; i < palette.length; i++) {
          rowPalette[i * 2] = fogged(palette[i], 1.04, f);
          rowPalette[i * 2 + 1] = fogged(palette[i], 0.9, f);
        }
        const stepX = (rowDist * (rightX - leftX)) / bufW;
        const stepY = (rowDist * (rightY - leftY)) / bufW;
        let wx = cam.x + rowDist * leftX;
        let wy = cam.y + rowDist * leftY;
        let o = y * bufW;
        for (let x = 0; x < bufW; x++, o++) {
          const cx = (wx * invCell) | 0;
          const cy = (wy * invCell) | 0;
          const room =
            cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows
              ? 0
              : index.ids[cy * index.cols + cx];
          const parity = (((wx * invTile) | 0) ^ ((wy * invTile) | 0)) & 1;
          colors[o] = rowPalette[room * 2 + parity];
          depth[o] = rowDist;
          wx += stepX;
          wy += stepY;
        }
      }

      // ---- ceiling ----
      const ceilHeight = CEILING_HEIGHT - cam.eye;
      const ceilEnd = Math.min(bufH, Math.floor(horizon - 0.5));
      for (let y = 0; y < ceilEnd; y++) {
        const p = horizon - y;
        if (p <= 0.0001) continue;
        const rowDist = (ceilHeight * cam.projDist) / p;
        const f = fogAmount(rowDist);
        const base = fogged(CEIL_BASE, 0.86, f);
        const panel = fogged(CEIL_PANEL, 1.02, f);
        const stepX = (rowDist * (rightX - leftX)) / bufW;
        const stepY = (rowDist * (rightY - leftY)) / bufW;
        let wx = cam.x + rowDist * leftX;
        let wy = cam.y + rowDist * leftY;
        let o = y * bufW;
        for (let x = 0; x < bufW; x++, o++) {
          const lit = ((((wx * invPanel) | 0) + ((wy * invPanel) | 0)) & 1) === 0;
          colors[o] = lit ? panel : base;
          depth[o] = rowDist;
          wx += stepX;
          wy += stepY;
        }
      }

      // ---- walls, painted far to near so low solids don't hide what's behind ----
      for (let x = 0; x < bufW; x++) {
        const ray = columnRay(cam, x + 0.5);
        const n = castRay(grid, cam.x, cam.y, ray.dx, ray.dy, VIEW_DISTANCE, hits);
        for (let i = n - 1; i >= 0; i--) {
          const hit = hits[i];
          drawSlice(x, hit, cam);
        }
      }

      // ---- crew and props ----
      drawSprites(cam);

      offCtx.putImageData(image, 0, 0);
    };

    const drawSlice = (x: number, hit: Hit, cam: ReturnType<typeof makeCamera>) => {
      const s = hit.solid;
      const d = hit.dist;
      if (d <= 0.05) return;
      const f = fogAmount(d);
      const [r, g, b] = hexRgb(s.tint);

      // Faces pointing along x catch less light than those facing the windows.
      let light = hit.axis === 0 ? 0.72 : 0.97;
      // Panel seams every quarter of a face.
      const seam = hit.u % 0.25;
      if (seam < 0.012 || seam > 0.238) light *= 0.86;
      const body = fogged([r, g, b], light, f);
      // Top surfaces face the ceiling lights, so they read brightest.
      const capColor = fogged([r, g, b], 1.06, f);
      const baseShadow = fogged([r, g, b], light * 0.6, f);

      const yBottom = projectHeight(cam, 0, d);
      const yTop = projectHeight(cam, s.height, d);
      let y0 = Math.max(0, Math.ceil(yTop));
      const y1 = Math.min(bufH - 1, Math.floor(yBottom));
      if (y1 < 0 || y0 > bufH - 1) return;

      // Anything shorter than the eye shows its top surface — that's what makes
      // a desk read as a box and not a poster stuck to the floor.
      if (s.height < cam.eye) {
        const yTopBack = projectHeight(cam, s.height, Math.max(hit.exit, d + 0.01));
        const capTop = Math.max(0, Math.ceil(yTopBack));
        const capBottom = Math.min(bufH - 1, Math.floor(yTop));
        for (let y = capTop; y <= capBottom; y++) {
          const o = y * bufW + x;
          if (d >= depth[o]) continue;
          colors[o] = capColor;
          depth[o] = d;
        }
        y0 = Math.max(y0, capTop);
      }

      const contact = Math.max(y0, y1 - 1);
      for (let y = y0; y <= y1; y++) {
        const o = y * bufW + x;
        if (d >= depth[o]) continue;
        colors[o] = y >= contact ? baseShadow : body;
        depth[o] = d;
      }
    };

    const blit = (
      bitmap: SpriteBitmap,
      screenX: number,
      yTop: number,
      yBottom: number,
      worldW: number,
      d: number,
      glow: string | null,
    ) => {
      const cam = R.cam;
      if (!cam) return;
      const screenW = (worldW / d) * cam.projDist;
      const x0 = Math.round(screenX - screenW / 2);
      const x1 = Math.round(screenX + screenW / 2);
      const spanX = x1 - x0;
      const spanY = yBottom - yTop;
      if (spanX <= 0 || spanY <= 0) return;
      if (x1 < 0 || x0 > bufW - 1 || yBottom < 0 || yTop > bufH - 1) return;

      const glowRgb = glow ? hexRgb(glow) : null;
      const pulse = glowRgb ? 0.2 + 0.1 * Math.sin(performance.now() / 320) : 0;
      const f = fogAmount(d);
      const px0 = Math.max(0, x0);
      const px1 = Math.min(bufW - 1, x1);
      const py0 = Math.max(0, Math.floor(yTop));
      const py1 = Math.min(bufH - 1, Math.ceil(yBottom));
      const sx = bitmap.w / spanX;
      const sy = bitmap.h / spanY;

      for (let x = px0; x <= px1; x++) {
        const tx = ((x - x0) * sx) | 0;
        if (tx < 0 || tx >= bitmap.w) continue;
        for (let y = py0; y <= py1; y++) {
          const o = y * bufW + x;
          if (d >= depth[o]) continue;
          const ty = ((y - yTop) * sy) | 0;
          if (ty < 0 || ty >= bitmap.h) continue;
          const texel = bitmap.px[ty * bitmap.w + tx];
          const a = texel >>> 24;
          if (a < 24) continue;
          let sr = texel & 255;
          let sg = (texel >>> 8) & 255;
          let sb = (texel >>> 16) & 255;
          if (glowRgb) {
            sr = sr * (1 - pulse) + glowRgb[0] * pulse;
            sg = sg * (1 - pulse) + glowRgb[1] * pulse;
            sb = sb * (1 - pulse) + glowRgb[2] * pulse;
          }
          if (a < 250) {
            // Soft edges blend with what's already there instead of hard-cutting.
            const prev = colors[o];
            const t = a / 255;
            sr = sr * t + (prev & 255) * (1 - t);
            sg = sg * t + ((prev >>> 8) & 255) * (1 - t);
            sb = sb * t + ((prev >>> 16) & 255) * (1 - t);
          }
          colors[o] = pack(
            sr * (1 - f) + FOG[0] * f,
            sg * (1 - f) + FOG[1] * f,
            sb * (1 - f) + FOG[2] * f,
          );
          depth[o] = d;
        }
      }
    };

    const drawSprites = (cam: ReturnType<typeof makeCamera>) => {
      type Entry = {
        d: number;
        draw: () => void;
        label?: { x: number; y: number; d: number; player: RemotePlayer };
      };
      const entries: Entry[] = [];

      for (const p of R.props) {
        const proj = projectSprite(cam, p.x, p.y);
        if (!proj) continue;
        const yBottom = projectHeight(cam, p.baseZ, proj.depth);
        const yTop = projectHeight(cam, p.baseZ + p.worldH, proj.depth);
        entries.push({
          d: proj.depth,
          draw: () =>
            blit(p.bitmap, proj.screenX, yTop, yBottom, p.worldW, proj.depth, p.glow),
        });
      }

      for (const other of R.others) {
        const proj = projectSprite(cam, other.x, other.y);
        if (!proj) continue;
        const orientation = facingBucket(
          other.facing,
          cam.x,
          cam.y,
          other.x,
          other.y,
        ) as Orientation;
        const bitmap = crewSprite(other.character, orientation, other.status);
        const yBottom = projectHeight(cam, 0, proj.depth);
        const yTop = projectHeight(cam, CREW_SIZE.worldH, proj.depth);
        entries.push({
          d: proj.depth,
          draw: () =>
            blit(bitmap, proj.screenX, yTop, yBottom, CREW_SIZE.worldW, proj.depth, null),
          label: { x: proj.screenX, y: yTop, d: proj.depth, player: other },
        });
      }

      entries.sort((a, b) => b.d - a.d);
      R.labels = [];
      for (const e of entries) {
        e.draw();
        if (e.label) R.labels.push(e.label);
      }
    };

    /** Nameplates and the minimap go on the crisp 2D layer, not the pixel buffer. */
    const drawOverlayLayer = () => {
      const cssW = canvasEl.clientWidth;
      const cssH = canvasEl.clientHeight;
      const scaleX = cssW / bufW;
      const scaleY = cssH / bufH;

      for (const label of R.labels) {
        if (label.d > 900) continue;
        const idx =
          Math.min(bufH - 1, Math.max(0, Math.round(label.y + 4))) * bufW +
          Math.min(bufW - 1, Math.max(0, Math.round(label.x)));
        if (depth.length > idx && depth[idx] < label.d - 1) continue;
        const x = label.x * scaleX;
        const y = label.y * scaleY - 8;
        const alpha = clamp(1.25 - label.d / 900, 0.15, 1);
        const name = label.player.name.split(" ")[0];
        const sub = label.player.character.name;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        const w = Math.max(ctx.measureText(name).width, ctx.measureText(sub).width) + 18;
        ctx.fillStyle = "rgba(20,19,16,0.72)";
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 30, w, 30, 6);
        ctx.fill();
        ctx.fillStyle = label.player.character.suit;
        ctx.fillRect(x - w / 2, y - 30, 3, 30);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f7f2e6";
        ctx.fillText(name, x, y - 21);
        ctx.font = "500 9px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(247,242,230,0.65)";
        ctx.fillText(sub.toUpperCase(), x, y - 9);
        ctx.restore();
      }

      drawMinimap(cssW, cssH);
      drawCrosshair(cssW, cssH);
    };

    const drawMinimap = (cssW: number, cssH: number) => {
      const L = R.layout;
      if (!L || L.rooms.length === 0) return;
      const size = Math.min(190, Math.max(130, cssW * 0.13));
      const pad = 18;
      const x0 = pad;
      const y0 = cssH - size - pad;
      const scale = Math.min(size / L.world.w, size / L.world.h) * 0.92;
      const ox = x0 + (size - L.world.w * scale) / 2;
      const oy = y0 + (size - L.world.h * scale) / 2;

      ctx.save();
      ctx.fillStyle = "rgba(18,17,15,0.68)";
      ctx.beginPath();
      ctx.roundRect(x0, y0, size, size, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(247,242,230,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.clip();

      for (const room of L.rooms) {
        ctx.fillStyle = `${room.accent}55`;
        ctx.fillRect(
          ox + room.rect.x * scale,
          oy + room.rect.y * scale,
          room.rect.w * scale,
          room.rect.h * scale,
        );
        if (room.missionCount > 0) {
          ctx.fillStyle = "#ffd166";
          ctx.beginPath();
          ctx.arc(ox + room.board.x * scale, oy + room.board.y * scale, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const other of R.others) {
        ctx.fillStyle = other.character.suit;
        ctx.beginPath();
        ctx.arc(ox + other.x * scale, oy + other.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Field of view wedge, so the map reads as "where am I looking".
      const px = ox + R.x * scale;
      const py = oy + R.y * scale;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 26, R.yaw - Math.PI / 6, R.yaw + Math.PI / 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f7f2e6";
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawCrosshair = (cssW: number, cssH: number) => {
      const cx = cssW / 2;
      const cy = cssH / 2;
      const hot = !!R.nearTarget;
      ctx.save();
      ctx.strokeStyle = hot ? "rgba(255,209,102,0.95)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = hot ? 2 : 1.5;
      const r = hot ? 9 : 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 1.5);
      ctx.lineTo(cx, cy + 1.5);
      ctx.stroke();
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(3.5, (now - last) / 16.67);
      last = now;
      if (!overlayRef.current) update(dt, now);
      if (R.grid && image) {
        drawWorld();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, 0, 0, canvasEl.clientWidth, canvasEl.clientHeight);
        drawOverlayLayer();
      }
      frames++;
      if (now - fpsAt > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
        const room = R.layout?.rooms.find(
          (r) =>
            R.x >= r.rect.x &&
            R.x <= r.rect.x + r.rect.w &&
            R.y >= r.rect.y &&
            R.y <= r.rect.y + r.rect.h,
        );
        setHud({ fps, room: room?.name ?? "Corridor" });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl, bob]);

  const levels = state.data?.levels;
  const lvl = levelInfo(state.data?.me?.points ?? currentUser.points);
  const loading = state.isLoading || layout.rooms.length === 0;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#12110f] text-[#f7f2e6] select-none">
      <canvas
        ref={setCanvasEl}
        onClick={requestLock}
        className="absolute inset-0 h-full w-full cursor-none"
        aria-label="First-person view of the office floor"
      />

      {loading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#12110f]">
          <Loader2 className="size-6 animate-spin opacity-70" />
          <p className="font-mono text-xs tracking-widest uppercase opacity-70">
            Entering the floor…
          </p>
        </div>
      ) : null}

      {/* ---- HUD ---- */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Top left: who you are down here */}
        <div className="absolute top-4 left-4 flex items-center gap-2.5 rounded-xl bg-black/45 px-3 py-2 backdrop-blur-sm">
          <span
            className="flex size-9 items-center justify-center rounded-lg text-[0.6rem] font-bold"
            style={{ background: myCharacter.suit, color: "#12110f" }}
          >
            {myCharacter.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold">{currentUser.name.split(" ")[0]}</p>
            <p className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
              {myCharacter.name} · lvl {lvl.level}
            </p>
          </div>
          <div className="ml-1 h-8 w-px bg-white/15" />
          <div className="flex items-center gap-1">
            {levels
              ? (Object.keys(SKILL_META) as (keyof typeof SKILL_META)[]).map((key) => (
                  <span
                    key={key}
                    title={`${SKILL_META[key].label} — level ${levels[key] ?? 0}`}
                    className="flex size-6 items-center justify-center rounded font-mono text-[0.6rem] font-bold"
                    style={{
                      background: `${SKILL_META[key].color}30`,
                      color: SKILL_META[key].color,
                    }}
                  >
                    {levels[key] ?? 0}
                  </span>
                ))
              : null}
          </div>
        </div>

        {/* Top right: floor status */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-black/45 px-3 py-2 text-xs backdrop-blur-sm">
            <Compass className="size-3.5 opacity-60" />
            <span className="font-medium">{hud.room}</span>
            <span className="opacity-40">·</span>
            <Users className="size-3.5 opacity-60" />
            <span className="tabular-nums">{state.data?.online ?? 0}</span>
            <span className="opacity-40">·</span>
            <span className="font-mono tabular-nums opacity-50">{hud.fps} fps</span>
          </div>
          <button
            onClick={() => setBob((b) => !b)}
            title={bob ? "Head bob on" : "Head bob off"}
            className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <Waves className={cn("size-4", !bob && "opacity-40")} />
          </button>
          <button
            onClick={toggleFullscreen}
            title="Fullscreen (F)"
            className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            onClick={onExit}
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/45 px-3 py-2 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <LogOut className="size-3.5" />
            Leave
          </button>
        </div>

        {/* Centre: interaction prompt */}
        {prompt && !overlay ? (
          <div className="absolute inset-x-0 top-[58%] flex justify-center">
            <div className="flex items-center gap-2.5 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
              <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]">
                E
              </kbd>
              <span className="text-sm font-medium">{prompt.name}</span>
              <span className="text-xs opacity-60">{prompt.subtitle}</span>
            </div>
          </div>
        ) : null}

        {/* Bottom right: controls */}
        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1.5 text-[0.65rem]">
          <div className="flex gap-1.5">
            {[
              ["B", "Bounties"],
              ["T", "Skills"],
              ["Tab", "Crew"],
              ["H", "Help"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() =>
                  setOverlay(
                    key === "B"
                      ? "bounties"
                      : key === "T"
                        ? "skills"
                        : key === "Tab"
                          ? "roster"
                          : "help",
                  )
                }
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-black/65"
              >
                <kbd className="font-mono opacity-60">{key}</kbd>
                {label}
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-black/35 px-2.5 py-1.5 font-mono tracking-wide opacity-55 backdrop-blur-sm">
            WASD move · mouse look · shift sprint · E interact
          </p>
        </div>

        {/* Click-to-look veil */}
        {!locked && !overlay && !loading ? (
          <button
            onClick={requestLock}
            className="pointer-events-auto absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]"
          >
            <Crosshair className="size-7 opacity-70" />
            <p className="text-sm font-medium">Click to look around</p>
            <p className="font-mono text-[0.65rem] tracking-widest uppercase opacity-55">
              Esc releases the mouse · Esc again leaves the floor
            </p>
          </button>
        ) : null}
      </div>

      {/* ---- Overlays ---- */}
      {overlay ? (
        <GameOverlay
          title={
            overlay === "bounties"
              ? "Bounty Board"
              : overlay === "skills"
                ? "Skill Tree"
                : overlay === "roster"
                  ? "Crew"
                  : overlay === "missions"
                    ? (activeRoom?.name ?? "Missions")
                    : "How to play"
          }
          onClose={() => setOverlay(null)}
        >
          {overlay === "bounties" ? (
            <BountyBoardPanel
              onChanged={() => {
                utils.workspace.state.invalidate();
                utils.skill.tree.invalidate();
              }}
            />
          ) : null}
          {overlay === "skills" ? <SkillTreePanel /> : null}
          {overlay === "roster" ? <CrewRosterPanel /> : null}
          {overlay === "missions" && activeRoom ? (
            <RoomMissionsPanel
              roomId={activeRoom.id}
              onChanged={() => {
                utils.workspace.state.invalidate();
                utils.task.myWork.invalidate();
                utils.dashboard.overview.invalidate();
                utils.skill.tree.invalidate();
                utils.me.invalidate();
              }}
            />
          ) : null}
          {overlay === "help" ? <HelpPanel /> : null}
        </GameOverlay>
      ) : null}
    </div>
  );
}

function GameOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      {/* The panel drops back to app colours so the boards look the same in the
          game as they do on the page — one design, two contexts. */}
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/10">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-heading text-sm font-semibold tracking-wide">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            Esc
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function HelpPanel() {
  const rows: [string, string][] = [
    ["W A S D", "Walk and strafe"],
    ["Mouse", "Look — click the floor to capture, Esc to release"],
    ["← →", "Turn without a mouse"],
    ["Shift", "Sprint"],
    ["E", "Interact with the board you're facing"],
    ["B", "Bounty board — unclaimed missions anyone can grab"],
    ["T", "Skill tree — your craft levels and what they unlock"],
    ["Tab", "Crew roster"],
    ["F", "Toggle fullscreen"],
    ["Esc", "Close a panel, release the mouse, then leave the floor"],
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You are standing on the office floor in first person. Walk to a room&apos;s board to
        see its missions, or head to the bounty board in the common area to grab
        unclaimed work — the urgent ones pay a bonus.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {rows.map(([key, label]) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
          >
            <kbd className="min-w-16 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[0.65rem]">
              {key}
            </kbd>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Every teammate is a distinct crewmate — suit, visor and headgear are claimed
        one per person, so you can tell who is across the room before you can read
        the nameplate.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function hubRoom(layout: Layout): RoomGeom | null {
  return layout.rooms.find((r) => r.key === "common-board") ?? layout.rooms[0] ?? null;
}

/** Against the hub's far wall, straight ahead of where you spawn. */
function bountyBoardSpot(hub: RoomGeom): { x: number; y: number } {
  return { x: hub.rect.x + hub.rect.w / 2, y: hub.rect.y + hub.rect.h - 22 };
}

function useEngine() {
  const [bag] = useState(() => ({
    x: 0,
    y: 0,
    yaw: Math.PI / 2,
    pitch: 0,
    spawned: false,
    keys: new Set<string>(),
    bobPhase: 0,
    bobAmount: 0,
    bobTarget: 0,
    moved: false,
    lastSave: 0,
    layout: null as unknown as Layout,
    solids: [] as Solid[],
    grid: null as CastGrid | null,
    floorIndex: null as FloorIndex | null,
    floorPalette: [CORRIDOR] as [number, number, number][],
    props: [] as Prop[],
    others: [] as RemotePlayer[],
    interactables: [] as Interactable[],
    nearTarget: null as Interactable | null,
    cam: null as ReturnType<typeof makeCamera> | null,
    labels: [] as { x: number; y: number; d: number; player: RemotePlayer }[],
    myCharacter: null as Character | null,
    myStatus: "online",
  }));
  return bag;
}
