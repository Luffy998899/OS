"use client";

// The Blockworld engine: a real voxel campus rendered with Three.js. First
// person, gravity, jumping, buildings you physically walk into, POIs you aim
// at and press E. The world itself is pure data (lib/blockworld); this file
// owns the scene, the loop, the HUD and the overlay panels.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { characterFor } from "@/lib/characters";
import {
  blockAt,
  inLair,
  regionAt,
  type Poi,
  type World,
} from "@/lib/blockworld/types";
import { ATLAS_COLS, BLOCKS, TILE_PX } from "@/lib/blockworld/blocks";
import {
  buildChunkMeshData,
  chunkKey,
  allChunks,
  dirtyChunksFor,
  type MeshArrays,
} from "@/lib/blockworld/meshing";
import {
  overlapsPlayer,
  paletteIds,
  raycastVoxel,
  setBlock,
  worldFromData,
  BLOCK_GROUPS,
  type VoxelHit,
} from "@/lib/blockworld/edit";
import {
  EYE_HEIGHT,
  stepPlayer,
  groundHeightAt,
  type MoveInput,
  type PlayerState,
} from "@/lib/blockworld/physics";
import { poiIdAt } from "@/lib/blockworld/panels";
import {
  boxVolume,
  clampBox,
  faceFromNormal,
  fillEdits,
  inverseEdits,
  normaliseBox,
  type Box,
  type Cell,
  type FillMode,
} from "@/lib/blockworld/build-ops";
import { paintAtlas, paintNormalAtlas } from "./textures";
import { WireDialog, type WireCell } from "./wire-dialog";
import { DistrictPicker } from "./district-picker";
import {
  FillDialog,
  RegionDialog,
  SignDialog,
  type RegionDraft,
  type SignDraft,
} from "./design-dialogs";
import { createPlayerRig, type PlayerRig } from "./player-model";
import { BountyBoardPanel } from "../bounty-board";
import { SkillTreePanel } from "../skill-tree";
import { CrewRosterPanel } from "../crew-roster";
import { RoomMissionsPanel } from "../room-missions-panel";
import { VideoBayPanel } from "../rooms/video-bay-panel";
import { DevCityPanel } from "../rooms/dev-city-panel";
import { ConferencePanel } from "../rooms/conference-panel";
import { TasksRoomPanel } from "../rooms/tasks-room-panel";
import { ApprovalsPanel } from "../rooms/approvals-panel";
import { OutreachPanel } from "../rooms/outreach-panel";
import { CreativePanel } from "../rooms/creative-panel";
import { ShootPanel } from "../rooms/shoot-panel";
import { TimetablePanel } from "../rooms/timetable-panel";
import { DocsPanel } from "../rooms/docs-panel";
import { LairPanel } from "../rooms/lair-panel";
import { ChatPanel } from "@/components/chat/chat-panel";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

type ViewSettings = {
  fovDeg: number;
  sensitivity: number;
  quality: "auto" | "low" | "high";
};

const DEFAULT_SETTINGS: ViewSettings = { fovDeg: 75, sensitivity: 1, quality: "auto" };
const SETTINGS_KEY = "auxa-blockworld-settings";

function loadSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw);
    return {
      fovDeg: Math.min(110, Math.max(60, Number(p.fovDeg) || 75)),
      sensitivity: Math.min(2.5, Math.max(0.3, Number(p.sensitivity) || 1)),
      quality: ["auto", "low", "high"].includes(p.quality) ? p.quality : "auto",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: ViewSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

type OverlayKind =
  | "bounties"
  | "skills"
  | "roster"
  | "help"
  | "map"
  | "settings"
  | "video"
  | "city"
  | "conference"
  | "tasks"
  | "approvals"
  | "outreach"
  | "creative"
  | "shoot"
  | "timetable"
  | "docs"
  | "lair"
  | "missions"
  | "chat";

type Overlay = { kind: OverlayKind; refId?: string; name?: string } | null;

const OVERLAY_TITLES: Record<OverlayKind, string> = {
  bounties: "Bounty Board",
  skills: "Skill Tree",
  roster: "Crew",
  help: "How to play",
  map: "Floor Plan",
  settings: "View Settings",
  video: "Video Editing Bay",
  city: "Dev City",
  conference: "Conference Hall",
  tasks: "Task Hall",
  approvals: "Managing Heads",
  outreach: "Outreach Office",
  creative: "Creative Studio",
  shoot: "Shoot Studio",
  timetable: "The Bell Schedule",
  docs: "Writing Desk",
  lair: "The Upside Down — Vecna's Desk",
  missions: "Missions",
  chat: "Chat",
};

// ---------------------------------------------------------------------------
// Small audio: the school bell
// ---------------------------------------------------------------------------

let bellCtx: AudioContext | null = null;
function ringBell() {
  try {
    bellCtx = bellCtx ?? new AudioContext();
    const t = bellCtx.currentTime;
    for (const [freq, at, dur] of [
      [1318.5, 0, 0.28],
      [1046.5, 0.18, 0.42],
    ] as const) {
      const osc = bellCtx.createOscillator();
      const gain = bellCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      osc.connect(gain).connect(bellCtx.destination);
      osc.start(t + at);
      osc.stop(t + at + dur + 0.05);
    }
  } catch {
    /* silence is fine */
  }
}

// ---------------------------------------------------------------------------
// Colors for the top-down map
// ---------------------------------------------------------------------------

const MAP_FALLBACK: Record<string, string> = {
  carpet_gray: "#8b8d91",
  carpet_blue: "#6b7f9e",
  carpet_green: "#6f9177",
  carpet_red: "#a06a68",
  concrete: "#9a9a97",
  marble: "#e2ddd2",
  paving: "#a8a49c",
  wood_floor: "#b08a54",
  drywall: "#e8e6e1",
  drywall_accent: "#4a6d8c",
  drywall_warm: "#d8c9b0",
  trim: "#d5d2cc",
  glass: "#cfe0e8",
  glass_frosted: "#dbe6ea",
  curtain_wall: "#8fb0c8",
  facade: "#b9bcc0",
  facade_blue: "#7f95c8",
  facade_green: "#79b07c",
  facade_warm: "#d0a878",
  metal: "#9aa0a6",
  elevator: "#b6bcc2",
  stone: "#8d8d8d",
  roof: "#4a5058",
  ceiling: "#eceae5",
  ceiling_light: "#fff6d8",
  desk: "#b08a54",
  desk_dark: "#6d4f33",
  chair: "#4b4e54",
  monitor: "#2a2f38",
  table: "#a67c4e",
  whiteboard: "#f0efe8",
  corkboard: "#c2a072",
  tv: "#20242e",
  books: "#8a5a3a",
  server_rack: "#2c3138",
  pantry: "#c9c3b6",
  felt: "#9a9691",
  felt_orange: "#e0a13a",
  felt_teal: "#4fae9c",
  clock: "#f2f0ea",
  sign: "#2f333a",
  plant: "#5da944",
  planter: "#a8785c",
  rug: "#a03a34",
  step: "#9a9a97",
  step_marble: "#e2ddd2",
  water: "#6f8fa8",
  lair_stone: "#241c26",
  lair_vine: "#7d1e30",
  vecna_flesh: "#5a1f26",
  obsidian: "#2a2036",
  lair_glow: "#e05a3a",
  cpu: "#2f333a",
  coffee: "#5c3a24",
  papers: "#eceae4",
  phone: "#22262b",
  book_stack: "#6b4a7a",
  printer: "#3a3f46",
  cooler: "#cfd3d7",
  art: "#8a6a45",
  vent: "#c9ccd0",
  exit_sign: "#12331f",
  lamp: "#ffd98f",
  sofa: "#4a5560",
  rug_pattern: "#7d5a63",
  plant_fern: "#4f9b46",
  plant_tall: "#57a84d",
  pot: "#b1653f",
  pot_white: "#d9d5cd",
  camera: "#26292e",
  tripod: "#3c4148",
  softbox: "#fff6e0",
  clapboard: "#1c1f24",
  mic: "#43484f",
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function hueOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 210;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return Math.round(h);
}

// ---------------------------------------------------------------------------
// The engine component
// ---------------------------------------------------------------------------

const SAVE_INTERVAL_MS = 900;
const INTERACT_RANGE = 4.4;

export function BlockWorld({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.roleName === "Admin";
  const router = useRouter();
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 3500 });
  const enter = trpc.workspace.enter.useMutation();
  const move = trpc.workspace.move.useMutation();
  const relogin = trpc.timetable.relogin.useMutation({
    onSuccess: () => {
      toast.success("Logged back in — afternoon tracked.");
      utils.workspace.state.invalidate();
    },
  });
  const openCreative = trpc.creative.open.useMutation();

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [prompt, setPrompt] = useState<Poi | null>(null);
  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState({ fps: 0, place: "Auxa Campus" });
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_SETTINGS);
  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;
  /**
   * True while any modal surface owns the keyboard — an overlay, the block
   * picker or the wiring dialog. Without it, typing in a search box also walks
   * the player and Escape drops you out of the office entirely.
   */
  const modalRef = useRef(false);
  const pickerRef = useRef(false);
  const wiringRef = useRef(false);
  const designRef = useRef(false);

  // Opening any overlay must free the mouse and hand the keyboard to the
  // panel — nobody should have to press Escape before they can type.
  const openOverlay = useCallback((o: NonNullable<Overlay>) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setOverlay(o);
  }, []);

  // Once the panel has rendered, put the caret in its first typeable field so
  // interacting with a computer or opening chat means you can type instantly.
  const overlayContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!overlay) return;
    const id = window.setTimeout(() => {
      const el = overlayContentRef.current;
      if (!el || el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>(
        "textarea, input:not([type=hidden]):not([disabled]), [contenteditable='true']",
      )?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [overlay]);

  // The world is whatever people have built. It is loaded, not generated, and
  // only reassembled when the stored revision actually moves — rebuilding it on
  // every poll would throw away the meshes mid-edit.
  const loaded = trpc.world.load.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const remoteRevision = trpc.world.revision.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const projects = state.data?.projects;
  const [worldEpoch, setWorldEpoch] = useState(0);
  const world: World | null = useMemo(() => {
    if (!loaded.data) return null;
    return worldFromData(loaded.data);
    // worldEpoch forces a rebuild after someone else's edits land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded.data, worldEpoch]);
  const canBuild = loaded.data?.canBuild ?? false;

  // Engine bag — everything the rAF loop touches lives here, not in React state.
  const E = useRef({
    st: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, onGround: false } as PlayerState,
    pending: null as { x: number; y: number; z: number } | null,
    yaw: 0,
    pitch: 0,
    keys: new Set<string>(),
    settings: DEFAULT_SETTINGS as ViewSettings,
    spawned: false,
    moved: false,
    lastSave: 0,
    walkTime: 0,
    aimed: null as Poi | null,
    world: null as World | null,
    isAdmin: false,
    rigs: new Map<
      string,
      { rig: PlayerRig; tx: number; ty: number; tz: number; tyaw: number; phase: number }
    >(),
    players: [] as {
      userId: string;
      name: string;
      characterId: string | null;
      x: number;
      y: number;
      alt: number;
      facing: number;
      status: string;
      isMe: boolean;
    }[],
    scene: null as THREE.Scene | null,
    /** QA hook: sweep normalScale, or prove the normal map is not a no-op. */
    debugTex: null as { atlas: THREE.Texture; normalAtlas: THREE.Texture } | null,
    lairT: 0,
    // ---- creative mode ----
    build: false,
    flying: false,
    lastSpace: 0,
    held: 1,
    aimedVoxel: null as VoxelHit | null,
    /** Set by the scene effect: draw the design selection box. */
    drawSelection: null as ((a: Cell | null, b: Cell | null) => void) | null,
    /** Set by the scene effect: re-mesh the chunks a block edit dirties. */
    remesh: null as ((x: number, y: number, z: number) => void) | null,
    /** Edits made locally but not yet flushed to the server. */
    edits: [] as number[],
    /** Debug/QA entry point for a single block edit. */
    editAt: null as ((x: number, y: number, z: number, id: number) => void) | null,
  }).current;
  E.world = world;
  E.isAdmin = isAdmin;

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    E.settings = s;
  }, [E]);

  // Debug/QA hook: lets tooling read position and steer deterministically.
  useEffect(() => {
    (window as unknown as { __bw?: unknown }).__bw = E;
    // The block table, so tooling can name a material instead of guessing ids.
    (window as unknown as { __bwBlocks?: unknown }).__bwBlocks = BLOCKS;
    return () => {
      delete (window as unknown as { __bw?: unknown }).__bw;
      delete (window as unknown as { __bwBlocks?: unknown }).__bwBlocks;
    };
  }, [E]);

  /** Stable reader so the minimap effect isn't torn down every render. */
  const readPose = useCallback(
    () => ({ x: E.st.pos.x, y: E.st.pos.y, z: E.st.pos.z, yaw: E.yaw }),
    [E],
  );

  const applySettings = useCallback(
    (patch: Partial<ViewSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        E.settings = next;
        saveSettings(next);
        return next;
      });
    },
    [E],
  );

  // Claim a character + starting position.
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
  useEffect(() => {
    enter.mutate(undefined, {
      onSuccess: (res) => {
        setMyCharacterId(res.characterId ?? null);
        E.pending = { x: res.x, y: res.alt, z: res.y };
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spawn once the world exists: use the saved position when it is inside the
  // new world, otherwise the plaza spawn (old-map coordinates get retired).
  useEffect(() => {
    if (!world || E.spawned) return;
    const p = E.pending;
    let px = world.spawn.x;
    let py = world.spawn.y;
    let pz = world.spawn.z;
    let yaw = world.spawnYaw;
    if (p && p.x > 1 && p.z > 1 && p.x < world.sx - 1 && p.z < world.sz - 1) {
      px = p.x;
      pz = p.z;
      py = Math.max(groundHeightAt(world, px, pz), 1);
      yaw = 0;
    }
    E.st.pos = { x: px, y: py, z: pz };
    E.st.vel = { x: 0, y: 0, z: 0 };
    E.yaw = yaw;
    E.pitch = 0;
    E.spawned = true;
  }, [world, E]);

  // Keep the live player list in the bag.
  useEffect(() => {
    if (!state.data) return;
    E.players = state.data.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      characterId: p.characterId,
      x: p.x,
      y: p.y,
      alt: p.alt,
      facing: p.facing,
      status: p.status,
      isMe: p.isMe,
    }));
  }, [state.data, E]);

  // School bell on period change.
  const slotLabel = state.data?.timeslot?.current?.label ?? null;
  const prevSlot = useRef<string | null>(null);
  useEffect(() => {
    if (prevSlot.current !== null && slotLabel !== prevSlot.current) {
      ringBell();
      toast(slotLabel ? `🔔 Period change: ${slotLabel}` : "🔔 Period over", {
        description: slotLabel ? "The bell rang — next block starts now." : "That block is done.",
      });
    }
    prevSlot.current = slotLabel;
  }, [slotLabel]);

  // ---- creative mode ----
  const [buildMode, setBuildMode] = useState(false);
  const [flying, setFlying] = useState(false);
  const [hotbar, setHotbar] = useState<number[]>(() => paletteIds().slice(0, 9));
  const [slot, setSlot] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aimLabel, setAimLabel] = useState<string | null>(null);

  const [wiring, setWiring] = useState<WireCell | null>(null);
  const [placing, setPlacing] = useState(false);
  // ---- map design: a two-corner selection, and what you do with it ----
  const [corners, setCorners] = useState<{ a: Cell | null; b: Cell | null }>({ a: null, b: null });
  const [filling, setFilling] = useState<Box | null>(null);
  const [signing, setSigning] = useState<SignDraft | null>(null);
  const [naming, setNaming] = useState<RegionDraft | null>(null);
  const designOpen = filling !== null || signing !== null || naming !== null || placing;
  /** The keyboard effect is built once per world; the selection changes often. */
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  /** Drop a block into the live hotbar slot — used by the eyedropper. */
  const pickBlock = useCallback(
    (id: number) => {
      setHotbar((h) => {
        if (h[slot] === id) return h;
        const next = [...h];
        next[slot] = id;
        return next;
      });
      toast(BLOCKS[id]?.label ?? "Block", { description: "Picked into your hand." });
    },
    [slot],
  );
  const pickBlockRef = useRef(pickBlock);
  pickBlockRef.current = pickBlock;
  useEffect(() => {
    E.drawSelection?.(buildMode ? corners.a : null, buildMode ? corners.b : null);
  }, [E, corners, buildMode, worldEpoch]);
  pickerRef.current = pickerOpen;
  wiringRef.current = wiring !== null;
  designRef.current = designOpen;
  modalRef.current = overlay !== null || pickerOpen || wiring !== null || designOpen;

  const placeMutation = trpc.world.place.useMutation();
  const clearWorld = trpc.world.clear.useMutation();
  const setSpawn = trpc.world.setSpawn.useMutation();
  const districts = trpc.world.districts.useQuery(undefined, { enabled: canBuild });
  const stamp = trpc.world.stampDistrict.useMutation({ onError: (e) => toast.error(e.message) });
  const setPoi = trpc.world.setPoi.useMutation({ onError: (e) => toast.error(e.message) });
  const deletePoi = trpc.world.deletePoi.useMutation({ onError: (e) => toast.error(e.message) });
  const setSign = trpc.world.setSign.useMutation({ onError: (e) => toast.error(e.message) });
  const deleteSign = trpc.world.deleteSign.useMutation({ onError: (e) => toast.error(e.message) });
  const setRegion = trpc.world.setRegion.useMutation({ onError: (e) => toast.error(e.message) });
  const deleteRegion = trpc.world.deleteRegion.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const appliedRevision = useRef(0);
  /** Batches applied this session, newest last, each stored as its inverse. */
  const undoStack = useRef<{ label: string; edits: number[] }[]>([]);
  useEffect(() => {
    if (loaded.data) appliedRevision.current = loaded.data.revision;
  }, [loaded.data]);

  // Somebody else built something: pull it in and rebuild.
  useEffect(() => {
    const remote = remoteRevision.data;
    if (remote === undefined || remote === appliedRevision.current) return;
    appliedRevision.current = remote;
    void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
    // loaded is a stable query handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteRevision.data]);

  E.build = buildMode;
  E.held = hotbar[slot] ?? 1;

  /**
   * Take a binding off a cell in the world we are holding. Breaking a block
   * server-side already deletes the POI on it, so a bulk edit only needs this
   * half; a deliberate unwire calls dropPoiAt below, which does both.
   */
  const dropPoiLocally = useCallback(
    (x: number, y: number, z: number): boolean => {
      const w = E.world;
      if (!w) return false;
      const at = w.pois.findIndex((p) => p.min.x === x && p.min.y === y && p.min.z === z);
      if (at < 0) return false;
      const [gone] = w.pois.splice(at, 1);
      if (E.aimed?.id === gone.id) {
        E.aimed = null;
        setPrompt(null);
      }
      return true;
    },
    [E],
  );

  /** Forget a block's binding, locally and on the server. */
  const dropPoiAt = useCallback(
    (x: number, y: number, z: number) => {
      if (!dropPoiLocally(x, y, z)) return;
      deletePoi.mutate({ x, y, z });
    },
    // deletePoi is a stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropPoiLocally],
  );

  /** Write one block locally, re-mesh what it touched, and queue the save. */
  const editBlock = useCallback(
    (x: number, y: number, z: number, id: number) => {
      const w = E.world;
      if (!w) return;
      if (id !== 0 && overlapsPlayer(x, y, z, E.st.pos.x, E.st.pos.y, E.st.pos.z)) return;
      if (blockAt(w, x, y, z) === id) return;
      setBlock(w, x, y, z, id);
      E.remesh?.(x, y, z);
      E.edits.push(x, y, z, id);
      // A binding belongs to the block, not the cell: break the block and the
      // interaction goes with it, or the office keeps prompts for thin air.
      if (id === 0) dropPoiAt(x, y, z);
    },
    [E, dropPoiAt],
  );

  /**
   * Apply a whole batch at once: write it locally, re-mesh what it touched,
   * push it, and remember how to put it back. This is what the fill tool and
   * undo both go through, so one code path owns bulk edits.
   */
  const applyBatch = useCallback(
    (edits: number[], label: string, recordUndo = true) => {
      const w = E.world;
      if (!w || edits.length === 0) return 0;
      const at = (x: number, y: number, z: number) => blockAt(w, x, y, z);
      // Taken BEFORE the write, or the inverse would describe the new world.
      if (recordUndo) {
        undoStack.current.push({ label, edits: inverseEdits(edits, at) });
        if (undoStack.current.length > 24) undoStack.current.shift();
      }
      for (let i = 0; i < edits.length; i += 4) {
        const x = edits[i];
        const y = edits[i + 1];
        const z = edits[i + 2];
        setBlock(w, x, y, z, edits[i + 3]);
        E.remesh?.(x, y, z);
        if (edits[i + 3] === 0) dropPoiLocally(x, y, z);
      }
      placeMutation.mutate(
        { blocks: edits },
        {
          onSuccess: (res) => {
            appliedRevision.current = res.revision;
          },
          onError: (err) => toast.error(err.message),
        },
      );
      return edits.length / 4;
    },
    // placeMutation is a stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [E, dropPoiLocally],
  );

  /** Put the last batch back. */
  const undoLast = useCallback(() => {
    const last = undoStack.current.pop();
    if (!last) {
      toast("Nothing to undo.");
      return;
    }
    const n = applyBatch(last.edits, last.label, false);
    toast(`Undid ${last.label}`, { description: `${n.toLocaleString()} blocks restored.` });
  }, [applyBatch]);

  /** Build the selected box, then drop the selection so it can't fire twice. */
  const runFill = useCallback(
    (box: Box, mode: FillMode, id: number, raise = 0) => {
      const w = E.world;
      if (!w) return;
      const grown = clampBox(
        { min: box.min, max: { ...box.max, y: box.max.y + raise } },
        w.sx,
        w.sy,
        w.sz,
      );
      const edits = fillEdits(grown, mode, id, (x, y, z) => blockAt(w, x, y, z));
      setFilling(null);
      setCorners({ a: null, b: null });
      if (edits.length === 0) {
        toast("Nothing to change there.");
        return;
      }
      const n = applyBatch(edits, mode);
      toast.success(`${n.toLocaleString()} blocks`, { description: "Z puts it back." });
    },
    [E, applyBatch],
  );

  /** Attach a Work OS panel to the block the builder is aiming at. */
  const wireBlock = useCallback(
    (poi: {
      x: number;
      y: number;
      z: number;
      panel: string;
      refId: string | null;
      label: string;
      sublabel: string | null;
      adminOnly: boolean;
    }) => {
      const w = E.world;
      if (!w) return;
      const at = w.pois.findIndex(
        (p) => p.min.x === poi.x && p.min.y === poi.y && p.min.z === poi.z,
      );
      const next: Poi = {
        id: poiIdAt(poi.x, poi.y, poi.z),
        label: poi.label,
        sublabel: poi.sublabel ?? undefined,
        panel: poi.panel as Poi["panel"],
        refId: poi.refId ?? undefined,
        adminOnly: poi.adminOnly,
        min: { x: poi.x, y: poi.y, z: poi.z },
        max: { x: poi.x + 1, y: poi.y + 1, z: poi.z + 1 },
      };
      if (at >= 0) w.pois[at] = next;
      else w.pois.push(next);
      setPoi.mutate(poi, {
        onSuccess: (res) => {
          appliedRevision.current = res.revision;
        },
      });
      setWiring(null);
      toast.success(`${poi.label} is live`, {
        description: "Walk up to it and press E.",
      });
    },
    // setPoi is a stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [E],
  );

  // Stable handles for the scene effect, which is built once per world and must
  // not be torn down every time a hotbar slot changes.
  const editRef = useRef(editBlock);
  editRef.current = editBlock;
  // Same debug/QA hook the rest of the engine uses: lets tooling place a block
  // without synthesising a pointer-locked mouse.
  E.editAt = editBlock;
  const canBuildRef = useRef(canBuild);
  canBuildRef.current = canBuild;

  // Edits are flushed on a short timer so holding the button down is one
  // request per burst instead of one per block.
  useEffect(() => {
    if (!buildMode) return;
    const timer = window.setInterval(() => {
      if (E.edits.length === 0) return;
      const batch = E.edits.splice(0, E.edits.length);
      placeMutation.mutate(
        { blocks: batch },
        {
          onSuccess: (res) => {
            // Our own write moved the revision; don't treat it as someone else's.
            appliedRevision.current = res.revision;
          },
          onError: (err) => toast.error(err.message),
        },
      );
    }, 400);
    return () => window.clearInterval(timer);
    // placeMutation is a stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMode, E]);

  // ---- interactions ----
  const openInteraction = useCallback(
    (poi: Poi | null) => {
      if (!poi) return;
      if (poi.adminOnly && !E.isAdmin) {
        toast("The rift ignores you.", { description: "Only admins can pass this way." });
        return;
      }
      if (poi.panel === "rift") {
        if (!poi.teleportTo) return;
        E.st.pos = { x: poi.teleportTo.x, y: poi.teleportTo.y, z: poi.teleportTo.z };
        E.st.vel = { x: 0, y: 0, z: 0 };
        if (poi.teleportYaw !== undefined) E.yaw = poi.teleportYaw;
        E.moved = true;
        toast(poi.label, { description: poi.sublabel });
        return;
      }
      if (poi.panel === "creative") {
        const door = poi.refId === "internal" ? "internal" : "clients";
        if (door === "internal") openCreative.mutate({ key: "internal" });
        openOverlay({ kind: "creative", refId: door, name: poi.label });
        return;
      }
      if (poi.panel === "client") {
        openOverlay({ kind: "missions", refId: poi.refId, name: poi.label });
        return;
      }
      const kind = poi.panel as OverlayKind;
      openOverlay({ kind, refId: poi.refId, name: poi.label });
    },
    [E, openCreative, openOverlay],
  );

  // ---- the Three.js scene ----
  useEffect(() => {
    if (!container || !world) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(pixelRatio);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.tabIndex = 0;

    const scene = new THREE.Scene();
    E.scene = scene;
    const SKY = new THREE.Color("#7fb2e8");
    const LAIR_SKY = new THREE.Color("#12040c");
    scene.background = SKY.clone();
    scene.fog = new THREE.Fog(new THREE.Color("#c9dcee"), 60, 160);

    const camera = new THREE.PerspectiveCamera(
      E.settings.fovDeg,
      container.clientWidth / container.clientHeight,
      0.08,
      320,
    );
    camera.rotation.order = "YXZ";

    // Light: sun + sky bounce; the lair dims these live.
    // Dimmer than they used to be, deliberately. The mesher used to bake a
    // second copy of the sun into vertex colours; with that gone the same
    // lights land about a quarter brighter, so they come down to match.
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7f6a, 0.66);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d8, 1.0);
    sun.position.set(0.6, 1, 0.35).multiplyScalar(120);
    scene.add(sun);
    const lairLight = new THREE.PointLight(0xff4030, 0, 18, 1.8);
    scene.add(lairLight);

    // Terrain meshes.
    const atlas = new THREE.CanvasTexture(paintAtlas());
    // Crisp up close, filtered at distance. Point-sampling the whole range is
    // what makes a floor shimmer into static when you look across it: every
    // pixel picks one texel out of a material far finer than the pixel is.
    // Mipmaps plus anisotropy sample the whole footprint instead, which is the
    // difference between a floor and a field of noise.
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.generateMipmaps = true;
    atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    atlas.colorSpace = THREE.SRGBColorSpace;

    // The surface itself. Where a material was photographed we have its real
    // relief; everywhere else this is flat and changes nothing. Linear rather
    // than Nearest on purpose — point-sampled normals light in visible facets,
    // and the crisp pixel edges come from the albedo anyway. NoColorSpace
    // because a normal map is a direction, not a colour: sRGB-decoding it would
    // bend every vector.
    const normalAtlas = new THREE.CanvasTexture(paintNormalAtlas());
    normalAtlas.magFilter = THREE.LinearFilter;
    normalAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    normalAtlas.generateMipmaps = true;
    normalAtlas.anisotropy = atlas.anisotropy;
    normalAtlas.colorSpace = THREE.NoColorSpace;
    E.debugTex = { atlas, normalAtlas };

    const toGeometry = (m: MeshArrays) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
      g.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      return g;
    };
    // MeshLambertMaterial takes a normalMap and shades per fragment, so there
    // is no reason to pay for Standard or Phong here. Cut-outs stay flat: thin
    // double-sided cards with derived tangents are where normal-map artifacts
    // live, and a leaf gains nothing from relief.
    const matOpaque = new THREE.MeshLambertMaterial({
      map: atlas,
      normalMap: normalAtlas,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
    });
    const matCutout = new THREE.MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const matEmissive = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });

    // The world is meshed in chunks so placing a block re-meshes a few thousand
    // voxels instead of the whole map.
    const chunkMeshes = new Map<string, THREE.Mesh[]>();
    const rebuildChunk = (cx: number, cy: number, cz: number) => {
      const key = chunkKey(cx, cy, cz);
      const existing = chunkMeshes.get(key);
      if (existing) {
        for (const m of existing) {
          scene.remove(m);
          m.geometry.dispose();
        }
        chunkMeshes.delete(key);
      }
      const data = buildChunkMeshData(world, cx, cy, cz);
      const made: THREE.Mesh[] = [];
      for (const [arr, mat] of [
        [data.opaque, matOpaque],
        [data.cutout, matCutout],
        [data.emissive, matEmissive],
      ] as const) {
        if (arr.indices.length === 0) continue;
        const mesh = new THREE.Mesh(toGeometry(arr), mat);
        scene.add(mesh);
        made.push(mesh);
      }
      if (made.length > 0) chunkMeshes.set(key, made);
    };
    for (const [cx, cy, cz] of allChunks(world)) rebuildChunk(cx, cy, cz);

    E.remesh = (x: number, y: number, z: number) => {
      for (const [cx, cy, cz] of dirtyChunksFor(x, y, z)) rebuildChunk(cx, cy, cz);
    };

    // Door signs. Every sign gets a solid dark plate with light lettering —
    // dark text floating on a pale wall was unreadable at any distance.
    const signMeshes: THREE.Mesh[] = [];
    for (const s of world.signs) {
      const padX = 22;
      const padY = 14;
      const fontPx = 46;
      const font = `700 ${fontPx}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
      const cv = document.createElement("canvas");
      const cx = cv.getContext("2d")!;
      cx.font = font;
      const textW = Math.ceil(cx.measureText(s.text).width);
      cv.width = Math.max(2, textW + padX * 2);
      cv.height = fontPx + padY * 2;
      const c2 = cv.getContext("2d")!;
      const plate = s.bg ?? "#10151c";
      const ink = s.color ?? "#f6f9fd";
      // Plate with a soft inner border so it reads as signage, not floating text.
      c2.fillStyle = plate;
      c2.fillRect(0, 0, cv.width, cv.height);
      c2.strokeStyle = "rgba(255,255,255,0.22)";
      c2.lineWidth = 3;
      c2.strokeRect(4.5, 4.5, cv.width - 9, cv.height - 9);
      c2.font = font;
      c2.textAlign = "center";
      c2.textBaseline = "middle";
      // Slight shadow keeps the lettering crisp against the plate.
      c2.fillStyle = "rgba(0,0,0,0.55)";
      c2.fillText(s.text, cv.width / 2 + 2, cv.height / 2 + 3);
      c2.fillStyle = ink;
      c2.fillText(s.text, cv.width / 2, cv.height / 2 + 1);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const h = s.size ?? 0.85;
      const wWorld = (h * cv.width) / cv.height;
      const geo = new THREE.PlaneGeometry(wWorld, h);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const off = 0.03;
      // A sign names the block it is fixed to, so it hangs on that block's
      // face — centred across it and pushed just clear of the surface. Placing
      // it at the raw block coordinate would bury it in the corner, inside
      // whatever stands next door.
      mesh.position.set(s.x + 0.5, s.y + 0.5, s.z + 0.5);
      if (s.face === "n") {
        mesh.rotation.y = Math.PI;
        mesh.position.z = s.z - off;
      } else if (s.face === "s") {
        mesh.position.z = s.z + 1 + off;
      } else if (s.face === "e") {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.x = s.x + 1 + off;
      } else {
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.x = s.x - off;
      }
      scene.add(mesh);
      signMeshes.push(mesh);
    }

    // Drifting blocky clouds.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const w = 14 + ((i * 37) % 22);
      const d = 8 + ((i * 53) % 14);
      const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), cloudMat);
      cloud.position.set(((i * 61) % world.sx) - 10, 44 + ((i * 13) % 5), ((i * 97) % world.sz));
      scene.add(cloud);
      clouds.push(cloud);
    }

    // Lair spores.
    const lairSize = {
      x: world.lair.max.x - world.lair.min.x,
      y: world.lair.max.y - world.lair.min.y,
      z: world.lair.max.z - world.lair.min.z,
    };
    const sporeCount = 420;
    const sporePos = new Float32Array(sporeCount * 3);
    for (let i = 0; i < sporeCount; i++) {
      sporePos[i * 3] = world.lair.min.x + ((i * 733) % 1000) / 1000 * lairSize.x;
      sporePos[i * 3 + 1] = world.lair.min.y + ((i * 389) % 1000) / 1000 * lairSize.y;
      sporePos[i * 3 + 2] = world.lair.min.z + ((i * 547) % 1000) / 1000 * lairSize.z;
    }
    const sporeGeo = new THREE.BufferGeometry();
    sporeGeo.setAttribute("position", new THREE.BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: 0xc9a6a0,
      size: 0.06,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const spores = new THREE.Points(sporeGeo, sporeMat);
    spores.visible = false;
    scene.add(spores);

    // The people. Staff are scenery that makes the floor feel worked-in;
    // client NPCs stand at their booth so the interaction has a face.
    const npcRigs: { rig: PlayerRig; seated: boolean }[] = [];
    for (const person of world.npcs) {
      const rig = createPlayerRig({
        name: person.kind === "client" ? `${person.name} · client` : person.name,
        hue: person.hue,
        showName: true,
      });
      // Seated figures drop onto the chair; standing ones sit on the floor.
      rig.group.position.set(person.x, person.y + (person.seated ? 0.42 : 0), person.z);
      rig.setHeading(person.yaw);
      rig.setSeated(!!person.seated);
      rig.setStatus(person.kind === "client" ? "busy" : "online");
      scene.add(rig.group);
      npcRigs.push({ rig, seated: !!person.seated });
    }

    // POI highlight box.
    const hlGeo = new THREE.BoxGeometry(1, 1, 1);
    const hlEdges = new THREE.EdgesGeometry(hlGeo);
    const hlMat = new THREE.LineBasicMaterial({ color: 0xffd166 });
    const highlight = new THREE.LineSegments(hlEdges, hlMat);
    highlight.visible = false;
    scene.add(highlight);

    // The design selection: a first-corner marker and, once both corners are
    // down, the box a fill would write. Drawn so you can see what you marked
    // from across the floorplate before committing to it.
    const markMat = new THREE.LineBasicMaterial({ color: 0x7cc4ff });
    const mark = new THREE.LineSegments(new THREE.EdgesGeometry(hlGeo), markMat);
    mark.visible = false;
    scene.add(mark);
    const selMat = new THREE.LineBasicMaterial({ color: 0x7cc4ff });
    const selection = new THREE.LineSegments(new THREE.EdgesGeometry(hlGeo), selMat);
    selection.visible = false;
    scene.add(selection);
    E.drawSelection = (a, b) => {
      mark.visible = Boolean(a) && !b;
      if (a && !b) mark.position.set(a.x + 0.5, a.y + 0.5, a.z + 0.5);
      selection.visible = Boolean(a && b);
      if (a && b) {
        const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
        const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
        selection.scale.set(hi.x - lo.x + 1, hi.y - lo.y + 1, hi.z - lo.z + 1);
        selection.position.set(
          (lo.x + hi.x + 1) / 2,
          (lo.y + hi.y + 1) / 2,
          (lo.z + hi.z + 1) / 2,
        );
      }
    };

    // ---- input ----
    const dom = renderer.domElement;
    const onLockChange = () => setLocked(document.pointerLockElement === dom);
    document.addEventListener("pointerlockchange", onLockChange);

    let dragging = false;
    let lastPX = 0;
    let lastPY = 0;
    let dragMoved = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === dom) {
        const s = 0.0023 * E.settings.sensitivity;
        E.yaw += e.movementX * s;
        E.pitch = Math.max(-1.45, Math.min(1.45, E.pitch - e.movementY * s));
      } else if (dragging) {
        const s = 0.0032 * E.settings.sensitivity;
        E.yaw += (e.clientX - lastPX) * s;
        E.pitch = Math.max(-1.45, Math.min(1.45, E.pitch - (e.clientY - lastPY) * s));
        dragMoved += Math.abs(e.clientX - lastPX) + Math.abs(e.clientY - lastPY);
        lastPX = e.clientX;
        lastPY = e.clientY;
      }
    };
    // In build mode the mouse buttons are the tools: left breaks, right places.
    // Holding either repeats, the way a creative-mode brush does.
    let holdTimer = 0;
    const applyTool = (button: number) => {
      const hit = E.aimedVoxel;
      if (!hit) return;
      if (button === 0) editRef.current(hit.x, hit.y, hit.z, 0);
      else if (button === 2) editRef.current(hit.px, hit.py, hit.pz, E.held);
    };
    const startHold = (button: number) => {
      applyTool(button);
      window.clearInterval(holdTimer);
      holdTimer = window.setInterval(() => applyTool(button), 140);
    };
    const stopHold = () => window.clearInterval(holdTimer);

    const onPointerDown = (e: PointerEvent) => {
      if (modalRef.current) return;
      if (E.build && document.pointerLockElement === dom) {
        e.preventDefault();
        // Middle click is the eyedropper: take the block you are looking at
        // instead of hunting for it in the picker.
        if (e.button === 1) {
          const hit = E.aimedVoxel;
          const id = hit && E.world ? blockAt(E.world, hit.x, hit.y, hit.z) : 0;
          if (id) pickBlockRef.current(id);
          return;
        }
        startHold(e.button);
        return;
      }
      if (document.pointerLockElement !== dom) {
        dragging = true;
        dragMoved = 0;
        lastPX = e.clientX;
        lastPY = e.clientY;
      }
    };
    const onPointerUp = () => {
      stopHold();
      if (modalRef.current) {
        dragging = false;
        return;
      }
      if (document.pointerLockElement === dom) {
        // Building consumes the click; interaction is E only while in build mode.
        if (!E.build) openInteraction(E.aimed);
      } else if (dragging) {
        dragging = false;
        if (dragMoved < 6) {
          if (!E.build && E.aimed) openInteraction(E.aimed);
          else dom.requestPointerLock?.();
        }
      }
    };
    const onContextMenu = (e: Event) => {
      if (E.build) e.preventDefault();
    };
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", stopHold);
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsAt = last;
    let frameEma = 16;
    // Fixed-timestep physics so movement speed never depends on framerate.
    const FIXED_STEP = 1 / 60;
    const MAX_STEPS = 20;
    let physicsAcc = 0;
    const ray = new THREE.Ray();
    const box = new THREE.Box3();
    const camDir = new THREE.Vector3();
    const hitScratch = new THREE.Vector3();

    const loop = (now: number) => {
      // Real elapsed time, capped only to stop a huge stall from exploding the
      // catch-up loop. dt is NOT the physics step.
      const dt = Math.min(0.25, Math.max(0.0005, (now - last) / 1000));
      last = now;

      // Input → physics, on a FIXED timestep. Walking used to be clamped to a
      // single 50ms step per frame, so a machine rendering at 5fps moved at a
      // quarter speed — "sprint feels slow" was really "your GPU is slow".
      // Accumulating real time and running whole fixed steps decouples the two.
      if (!modalRef.current) {
        const k = E.keys;
        const crouch = k.has("ShiftLeft") || k.has("ShiftRight");
        const input: MoveInput = {
          forward: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
          strafe: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
          jump: k.has("Space"),
          // Flying uses Shift to descend; on foot it is still sprint.
          sprint: E.flying ? k.has("ControlLeft") || k.has("ControlRight") : crouch,
          fly: E.flying,
          descend: crouch,
        };
        if (k.has("ArrowLeft")) E.yaw -= 2.2 * dt * E.settings.sensitivity;
        if (k.has("ArrowRight")) E.yaw += 2.2 * dt * E.settings.sensitivity;

        physicsAcc += dt;
        let steps = 0;
        while (physicsAcc >= FIXED_STEP && steps < MAX_STEPS) {
          stepPlayer(world, E.st, input, E.yaw, FIXED_STEP);
          physicsAcc -= FIXED_STEP;
          steps++;
        }
        // Never let the backlog grow without bound on a very slow frame.
        if (physicsAcc > FIXED_STEP * MAX_STEPS) physicsAcc = 0;

        const moving =
          Math.abs(E.st.vel.x) + Math.abs(E.st.vel.z) > 0.4 && E.st.onGround;
        if (input.forward !== 0 || input.strafe !== 0) E.moved = true;
        E.walkTime += moving ? dt * (input.sprint ? 11 : 8) : 0;
      }

      // Camera.
      camera.fov = E.settings.fovDeg;
      camera.updateProjectionMatrix();
      const bob = E.st.onGround ? Math.sin(E.walkTime) * 0.045 : 0;
      camera.position.set(E.st.pos.x, E.st.pos.y + EYE_HEIGHT + bob, E.st.pos.z);
      camera.rotation.y = -E.yaw;
      camera.rotation.x = E.pitch;

      // Aim at POIs.
      camera.getWorldDirection(camDir);
      ray.origin.copy(camera.position);
      ray.direction.copy(camDir);
      let best: Poi | null = null;
      let bestT = INTERACT_RANGE;
      for (const poi of world.pois) {
        if (poi.adminOnly && !E.isAdmin) continue;
        box.min.set(poi.min.x, poi.min.y, poi.min.z);
        box.max.set(poi.max.x, poi.max.y, poi.max.z);
        const hit = ray.intersectBox(box, hitScratch);
        if (hit) {
          const t = hit.distanceTo(camera.position);
          if (t < bestT) {
            bestT = t;
            best = poi;
          }
        }
      }
      if (best?.id !== E.aimed?.id) {
        E.aimed = best;
        setPrompt(best);
      }

      // Build mode aims at blocks, not points of interest: the highlight box
      // follows the voxel under the crosshair and the POI outline stands down.
      if (E.build) {
        const hit = raycastVoxel(
          world,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          camDir.x,
          camDir.y,
          camDir.z,
          7.5,
        );
        const changed =
          hit?.x !== E.aimedVoxel?.x ||
          hit?.y !== E.aimedVoxel?.y ||
          hit?.z !== E.aimedVoxel?.z;
        E.aimedVoxel = hit;
        if (changed) {
          const id = hit ? blockAt(world, hit.x, hit.y, hit.z) : 0;
          setAimLabel(hit ? (BLOCKS[id]?.label ?? null) : null);
        }
        if (hit) {
          highlight.visible = true;
          highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
          highlight.scale.set(1.02, 1.02, 1.02);
          (highlight.material as THREE.LineBasicMaterial).color.setHex(0xffffff);
        } else {
          highlight.visible = false;
        }
      } else if (best) {
        highlight.visible = true;
        highlight.position.set(
          (best.min.x + best.max.x) / 2,
          (best.min.y + best.max.y) / 2,
          (best.min.z + best.max.z) / 2,
        );
        highlight.scale.set(
          best.max.x - best.min.x + 0.06,
          best.max.y - best.min.y + 0.06,
          best.max.z - best.min.z + 0.06,
        );
        (highlight.material as THREE.LineBasicMaterial).color.setHSL(
          0.12,
          0.9,
          0.6 + Math.sin(now / 180) * 0.12,
        );
      } else {
        highlight.visible = false;
      }

      // Ambience: the Upside Down.
      const lairNow = inLair(world, Math.floor(E.st.pos.x), Math.floor(E.st.pos.y), Math.floor(E.st.pos.z));
      E.lairT += ((lairNow ? 1 : 0) - E.lairT) * Math.min(1, dt * 3.2);
      const lt = E.lairT;
      (scene.background as THREE.Color).copy(SKY).lerp(LAIR_SKY, lt);
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(new THREE.Color("#c9dcee")).lerp(new THREE.Color("#2a080f"), lt);
      fog.near = 60 - 56 * lt;
      fog.far = 160 - 132 * lt;
      hemi.intensity = 0.66 - 0.53 * lt;
      sun.intensity = 1.0 - 0.87 * lt;
      const flicker = lt > 0.5 ? 1 + Math.max(0, Math.sin(now / 90) * Math.sin(now / 251) - 0.72) * 5 : 1;
      lairLight.intensity = 2.4 * lt * flicker;
      lairLight.position.set(E.st.pos.x, E.st.pos.y + 2.2, E.st.pos.z);
      spores.visible = lt > 0.35;
      if (spores.visible) spores.rotation.y = Math.sin(now / 5000) * 0.02;

      // Clouds drift.
      for (const c of clouds) {
        c.position.x += dt * 0.7;
        if (c.position.x > world.sx + 30) c.position.x = -30;
      }

      // Remote players.
      const seen = new Set<string>();
      for (const p of E.players) {
        if (p.isMe) continue;
        const px = p.x;
        const pz = p.y; // server stores z in the legacy "y" column
        if (px < 1 || pz < 1 || px > world.sx - 1 || pz > world.sz - 1) continue;
        seen.add(p.userId);
        let entry = E.rigs.get(p.userId);
        if (!entry) {
          const ch = characterFor(p.characterId, p.userId);
          const rig = createPlayerRig({ name: p.name, hue: hueOf(ch.suit), showName: true });
          scene.add(rig.group);
          entry = { rig, tx: px, ty: p.alt || groundHeightAt(world, px, pz), tz: pz, tyaw: p.facing, phase: 0 };
          entry.rig.group.position.set(px, entry.ty, pz);
          E.rigs.set(p.userId, entry);
        }
        entry.tx = px;
        entry.tz = pz;
        entry.ty = p.alt > 0 ? p.alt : groundHeightAt(world, px, pz);
        entry.tyaw = p.facing;
        entry.rig.setStatus(p.status);
        const g = entry.rig.group;
        const dx = entry.tx - g.position.x;
        const dy = entry.ty - g.position.y;
        const dz = entry.tz - g.position.z;
        const dist = Math.hypot(dx, dz);
        const step = Math.min(1, dt * 6);
        g.position.x += dx * step;
        g.position.y += dy * Math.min(1, dt * 10);
        g.position.z += dz * step;
        const isMoving = dist > 0.08;
        entry.phase += isMoving ? dt * 9 : 0;
        entry.rig.setPose(entry.phase, isMoving, dt);
        entry.rig.setHeading(entry.tyaw);
      }
      // The people who live here. Rigs used to be built once and left frozen,
      // which reads worse than an empty room — somebody at a desk who never
      // moves is unmistakably a prop.
      for (const person of npcRigs) {
        if (person.seated) person.rig.setWorking(now / 1000);
        else person.rig.setPose(0, false, dt);
      }

      for (const [id, entry] of E.rigs) {
        if (!seen.has(id)) {
          scene.remove(entry.rig.group);
          entry.rig.dispose();
          E.rigs.delete(id);
        }
      }

      // Persist position.
      if (E.moved && now - E.lastSave > SAVE_INTERVAL_MS) {
        E.lastSave = now;
        E.moved = false;
        const region = regionAt(world, Math.floor(E.st.pos.x), Math.floor(E.st.pos.y), Math.floor(E.st.pos.z));
        move.mutate({
          x: Math.round(E.st.pos.x * 10) / 10,
          y: Math.round(E.st.pos.z * 10) / 10,
          alt: Math.round(E.st.pos.y * 10) / 10,
          facing: Math.round(E.yaw * 1000) / 1000,
          roomId: region?.roomId ?? null,
        });
      }

      // Render + adaptive quality.
      const t0 = performance.now();
      renderer.render(scene, camera);
      const frameCost = performance.now() - t0;
      frameEma = frameEma * 0.92 + frameCost * 0.08;
      if (E.settings.quality === "auto") {
        if (frameEma > 26 && pixelRatio > 0.6) {
          pixelRatio = Math.max(0.6, pixelRatio - 0.1);
          renderer.setPixelRatio(pixelRatio);
        } else if (frameEma < 11 && pixelRatio < Math.min(window.devicePixelRatio || 1, 1.5)) {
          pixelRatio = Math.min(1.5, pixelRatio + 0.05);
          renderer.setPixelRatio(pixelRatio);
        }
      } else {
        const target = E.settings.quality === "low" ? 0.66 : Math.min(window.devicePixelRatio || 1, 1.5);
        if (Math.abs(pixelRatio - target) > 0.01) {
          pixelRatio = target;
          renderer.setPixelRatio(pixelRatio);
        }
      }

      frames++;
      if (now - fpsAt > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
        const region = regionAt(world, Math.floor(E.st.pos.x), Math.floor(E.st.pos.y), Math.floor(E.st.pos.z));
        setHud({ fps, place: region?.label ?? "Auxa Campus" });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(holdTimer);
      document.removeEventListener("pointerlockchange", onLockChange);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", stopHold);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      for (const [, entry] of E.rigs) {
        scene.remove(entry.rig.group);
        entry.rig.dispose();
      }
      E.rigs.clear();
      for (const person of npcRigs) {
        scene.remove(person.rig.group);
        person.rig.dispose();
      }
      E.remesh = null;
      for (const [, made] of chunkMeshes) {
        for (const m of made) {
          scene.remove(m);
          m.geometry.dispose();
        }
      }
      chunkMeshes.clear();
      matOpaque.dispose();
      matCutout.dispose();
      matEmissive.dispose();
      atlas.dispose();
      normalAtlas.dispose();
      for (const s of signMeshes) {
        s.geometry.dispose();
        (s.material as THREE.MeshBasicMaterial).map?.dispose();
        (s.material as THREE.Material).dispose();
      }
      cloudMat.dispose();
      sporeGeo.dispose();
      sporeMat.dispose();
      hlEdges.dispose();
      hlGeo.dispose();
      hlMat.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      E.scene = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, world]);

  // ---- keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        // Close whatever is open, innermost first. Leaving the office is the
        // last resort, never a side effect of dismissing a dialog.
        if (designRef.current) {
          setFilling(null);
          setSigning(null);
          setNaming(null);
          setPlacing(false);
          e.preventDefault();
        } else if (wiringRef.current) {
          setWiring(null);
          e.preventDefault();
        } else if (pickerRef.current) {
          setPickerOpen(false);
          e.preventDefault();
        } else if (overlayRef.current) {
          setOverlay(null);
          e.preventDefault();
        } else if (document.pointerLockElement) {
          /* browser releases the lock */
        } else {
          onExit();
        }
        return;
      }
      if (modalRef.current) return;
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }

      // Creative flight: double-tap space, exactly like the game everyone
      // already knows. Only meaningful while building.
      if (e.code === "Space" && E.build && !e.repeat) {
        const now = performance.now();
        if (now - E.lastSpace < 320) {
          E.flying = !E.flying;
          setFlying(E.flying);
          if (E.flying) E.st.vel.y = 0;
        }
        E.lastSpace = now;
      }

      // Hotbar slots 1-9.
      if (E.build && /^Digit[1-9]$/.test(e.code)) {
        setSlot(Number(e.code.slice(5)) - 1);
        return;
      }

      switch (e.code) {
        case "KeyG":
          if (canBuildRef.current) {
            const next = !E.build;
            E.build = next;
            setBuildMode(next);
            if (!next) {
              E.flying = false;
              setFlying(false);
            }
            toast(next ? "Build mode on" : "Build mode off", {
              description: next
                ? "Left click breaks · right click places · double-tap Space to fly"
                : "Back to walking the floor.",
            });
          }
          return;
        case "KeyQ":
        case "KeyE":
          if (E.build) {
            // Without this the keystroke lands in the picker's search box the
            // moment it autofocuses, and every open starts with a stray letter.
            e.preventDefault();
            setPickerOpen(true);
            if (document.pointerLockElement) document.exitPointerLock();
            return;
          }
          if (e.code === "KeyE") openInteraction(E.aimed);
          return;
        case "KeyR":
          // Wire the block under the crosshair to a Work OS panel.
          if (E.build) {
            e.preventDefault();
            const hit = E.aimedVoxel;
            if (!hit) {
              toast("Aim at a block first.", { description: "Then press R to wire it up." });
              return;
            }
            const id = E.world ? blockAt(E.world, hit.x, hit.y, hit.z) : 0;
            setWiring({ x: hit.x, y: hit.y, z: hit.z, blockId: id });
            if (document.pointerLockElement) document.exitPointerLock();
          }
          return;
        case "KeyV": {
          // Mark the corners of a box. Two marks and the fill panel opens.
          if (!E.build) return;
          e.preventDefault();
          const hit = E.aimedVoxel;
          if (!hit) {
            toast("Aim at a block to mark a corner.");
            return;
          }
          const cell: Cell = { x: hit.x, y: hit.y, z: hit.z };
          setCorners((c) => {
            // A finished box plus another V starts over here, so moving the
            // first corner never means hunting for a clear button.
            if (!c.a || c.b) {
              toast("Corner 1 marked", { description: "Aim at the far corner and press V." });
              return { a: cell, b: null };
            }
            const box = clampBox(
              normaliseBox(c.a, cell),
              E.world?.sx ?? 0,
              E.world?.sy ?? 0,
              E.world?.sz ?? 0,
            );
            setFilling(box);
            if (document.pointerLockElement) document.exitPointerLock();
            return { a: c.a, b: cell };
          });
          return;
        }
        case "KeyZ":
          if (E.build) {
            e.preventDefault();
            undoLast();
          }
          return;
        case "KeyX": {
          // Letter the wall you are aiming at.
          if (!E.build) return;
          e.preventDefault();
          const hit = E.aimedVoxel;
          if (!hit) {
            toast("Aim at a wall to letter it.");
            return;
          }
          const here = E.world?.signs.find(
            (sg) => sg.x === hit.x && sg.y === hit.y && sg.z === hit.z,
          );
          setSigning({
            id: here?.id,
            x: hit.x,
            y: hit.y,
            z: hit.z,
            // px/py/pz is the empty cell in front of the face that was struck,
            // so the difference is the way a reader looks at it.
            face: here?.face ?? faceFromNormal(hit.px - hit.x, hit.pz - hit.z),
            text: here?.text ?? "",
            size: here?.size ?? 0.9,
            color: here?.color ?? null,
            bg: here?.bg ?? null,
          });
          if (document.pointerLockElement) document.exitPointerLock();
          return;
        }
        case "KeyN": {
          // Name the selected volume — or the room you are standing in.
          if (!E.build) return;
          e.preventDefault();
          const w = E.world;
          if (!w) return;
          const here = regionAt(
            w,
            Math.floor(E.st.pos.x),
            Math.floor(E.st.pos.y),
            Math.floor(E.st.pos.z),
          );
          const sel = cornersRef.current;
          if (!sel.a || !sel.b) {
            if (!here) {
              toast("Mark a box with V first.", {
                description: "Two corners, then N names what's inside.",
              });
              return;
            }
            setNaming({
              key: here.key,
              label: here.label,
              roomId: here.roomId ?? null,
              lair: here.lair ?? false,
              min: here.min,
              max: here.max,
            });
          } else {
            const box = clampBox(normaliseBox(sel.a, sel.b), w.sx, w.sy, w.sz);
            setNaming({
              key: "",
              label: "",
              roomId: null,
              lair: false,
              // Region volumes are max-exclusive; a marked box is inclusive.
              min: box.min,
              max: { x: box.max.x + 1, y: box.max.y + 1, z: box.max.z + 1 },
            });
          }
          if (document.pointerLockElement) document.exitPointerLock();
          return;
        }
        case "KeyB":
          openOverlay({ kind: "bounties" });
          return;
        case "KeyT":
          // The day the owner set for you, wherever you are standing.
          openOverlay({ kind: "timetable" });
          return;
        case "KeyK":
          openOverlay({ kind: "skills" });
          return;
        case "KeyM":
          openOverlay({ kind: "map" });
          return;
        case "KeyO":
          openOverlay({ kind: "settings" });
          return;
        case "KeyC":
          openOverlay({ kind: "chat" });
          return;
        case "Tab":
          openOverlay({ kind: "roster" });
          return;
        case "KeyH":
          openOverlay({ kind: "help" });
          return;
        case "KeyF":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void container?.requestFullscreen?.();
          return;
        default:
          E.keys.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => E.keys.delete(e.code);
    const blur = () => E.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [E, onExit, openInteraction, openOverlay, container, canBuild, undoLast]);

  // Scrolling the wheel walks the hotbar, like every block game.
  useEffect(() => {
    if (!buildMode) return;
    const onWheel = (e: WheelEvent) => {
      if (modalRef.current) return;
      setSlot((s) => (s + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [buildMode, pickerOpen]);

  const leave = useCallback(() => {
    if (E.spawned && world) {
      const region = regionAt(world, Math.floor(E.st.pos.x), Math.floor(E.st.pos.y), Math.floor(E.st.pos.z));
      move.mutate({
        x: Math.round(E.st.pos.x * 10) / 10,
        y: Math.round(E.st.pos.z * 10) / 10,
        alt: Math.round(E.st.pos.y * 10) / 10,
        facing: Math.round(E.yaw * 1000) / 1000,
        roomId: region?.roomId ?? null,
      });
    }
    onExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, onExit]);

  const timeslot = state.data?.timeslot;
  const meeting = state.data?.meeting;
  const myCharacter = useMemo(
    () => characterFor(myCharacterId, currentUser.id),
    [myCharacterId, currentUser.id],
  );
  const online = state.data?.online ?? 0;

  /**
   * Which building and storey a project desk opens.
   *
   * A district's floor carries `building:storey` — the tower is built once and
   * stands still, while the projects inside it are delivered and restacked, so
   * binding to a position keeps the desk meaningful. A hand-wired desk can still
   * carry a project id, and that resolves to wherever that project currently is.
   */
  const cityTargetFor = (
    refId: string | undefined,
  ): { building: "pipeline" | "complete" | "tools"; floor?: number } => {
    const asBuilding = (key: string): "pipeline" | "complete" | "tools" =>
      key.includes("tool") ? "tools" : key.includes("complete") ? "complete" : "pipeline";
    if (!refId) return { building: "tools" };
    const slot = /^(pipeline|complete|tools):(\d+)$/.exec(refId);
    if (slot) {
      return { building: slot[1] as "pipeline" | "complete" | "tools", floor: Number(slot[2]) };
    }
    if (refId === "tools") return { building: "tools" };
    const p = projects?.find((pr) => pr.id === refId);
    return { building: asBuilding(p?.buildingKey ?? ""), floor: p?.floor };
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#07090d] text-[#f2f4f8] select-none">
      {/* Scene */}
      <div ref={setContainer} className="relative min-h-0 flex-1 cursor-crosshair overflow-hidden" />

      {!world ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07090d]">
          <p className="animate-pulse font-mono text-sm tracking-[0.3em] uppercase">
            Building the campus…
          </p>
        </div>
      ) : null}

      {/* Crosshair */}
      {!overlay ? (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`size-2 rounded-full border ${prompt ? "border-[#ffd166] bg-[#ffd166]/40" : "border-white/70"}`}
          />
        </div>
      ) : null}

      {/* Top-left: who/where */}
      <div className="absolute top-3 left-3 flex items-center gap-2.5 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
        <div>
          <p className="text-sm leading-tight font-semibold">{currentUser.name}</p>
          <p className="font-mono text-[0.62rem] tracking-widest text-white/55 uppercase">
            {myCharacter.name} · {hud.place}
          </p>
        </div>
      </div>

      {/* Top-right: stats + leave */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="rounded-lg bg-black/60 px-2.5 py-1.5 font-mono text-[0.65rem] text-white/70 backdrop-blur-sm">
          {online} online · {hud.fps} fps
        </span>
        <button
          onClick={leave}
          className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          Leave
        </button>
      </div>

      {/* Meeting banner */}
      {meeting ? (
        <button
          onClick={() => openOverlay({ kind: "conference" })}
          className="absolute top-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#7d1e30]/90 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
        >
          📣 {meeting.title} — urgent meeting
        </button>
      ) : null}

      {/* Lunch relogin */}
      {timeslot?.needsRelogin ? (
        <button
          onClick={() => relogin.mutate()}
          className="absolute top-24 left-1/2 -translate-x-1/2 rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-bold text-black"
        >
          🍱 Lunch is over — tap to log back in
        </button>
      ) : null}

      {/* Interaction prompt */}
      {prompt && !overlay ? (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
            <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]">
              E
            </kbd>
            <span className="text-sm font-medium">{prompt.label}</span>
            {prompt.sublabel ? <span className="text-xs opacity-60">{prompt.sublabel}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Build-mode HUD: what you're pointing at, and the mode banner */}
      {buildMode && !overlay ? (
        <div className="pointer-events-none absolute top-14 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
          <span className="rounded-full bg-[#ffd166]/90 px-3 py-1 text-[0.7rem] font-bold text-black">
            BUILD MODE{flying ? " · FLYING" : ""}
          </span>
          {aimLabel ? (
            <span className="rounded-full bg-black/60 px-2.5 py-0.5 font-mono text-[0.62rem] text-white/80 backdrop-blur-sm">
              {aimLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Creative hotbar */}
      {buildMode && !overlay ? (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-black/60 p-1.5 backdrop-blur-sm">
            {hotbar.map((id, i) => (
              <button
                key={i}
                onClick={() => setSlot(i)}
                title={BLOCKS[id]?.label ?? "Empty"}
                className={`relative size-12 overflow-hidden rounded-lg border-2 transition-colors ${
                  slot === i ? "border-[#ffd166] bg-white/10" : "border-white/10 hover:bg-white/5"
                }`}
              >
                <BlockSwatch id={id} />
                <span className="absolute top-0 left-0.5 font-mono text-[0.55rem] text-white/70">
                  {i + 1}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setPickerOpen(true);
                if (document.pointerLockElement) document.exitPointerLock();
              }}
              title="All blocks (E)"
              className="ml-1 size-12 rounded-lg border-2 border-dashed border-white/25 text-xs font-semibold text-white/70 hover:bg-white/5"
            >
              All
            </button>
          </div>
          <p className="rounded-full bg-black/45 px-3 py-1 font-mono text-[0.6rem] tracking-wide text-white/60">
            L-click break · R-click place · M-click pick · 1-9 / wheel slot · E all blocks ·
            double-Space fly · G exit build
          </p>
          <p className="rounded-full bg-black/45 px-3 py-1 font-mono text-[0.6rem] tracking-wide text-[#7cc4ff]">
            V mark corners → fill · Z undo · X sign · N name the space · R wire to the Work OS
          </p>
        </div>
      ) : null}

      {/* Hotbar */}
      {!overlay && !buildMode ? (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
          {(
            [
              ["C", "Chat", "chat"],
              ["B", "Bounties", "bounties"],
              ["T", "Day", "timetable"],
              ["K", "Skills", "skills"],
              ["M", "Map", "map"],
              ["Tab", "Crew", "roster"],
              ["O", "View", "settings"],
              ["H", "Help", "help"],
            ] as const
          ).map(([key, label, kind]) => (
            <button
              key={key}
              onClick={() => openOverlay({ kind })}
              className="flex min-w-16 flex-col items-center rounded-lg border border-white/12 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <kbd className="font-mono text-[0.6rem] text-[#ffd166]">{key}</kbd>
              <span className="text-[0.68rem] font-medium text-white/85">{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Selection readout */}
      {buildMode && !overlay && corners.a ? (
        <div className="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg border border-[#7cc4ff]/40 bg-black/65 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-[0.6rem] tracking-widest text-[#7cc4ff] uppercase">
            Selection
          </p>
          <p className="mt-0.5 font-mono text-[0.68rem] text-white/85">
            {corners.b
              ? (() => {
                  const b = normaliseBox(corners.a, corners.b);
                  const v = boxVolume(b);
                  return `${b.max.x - b.min.x + 1}x${b.max.y - b.min.y + 1}x${b.max.z - b.min.z + 1} · ${v.toLocaleString()}`;
                })()
              : `corner 1 at ${corners.a.x},${corners.a.y},${corners.a.z}`}
          </p>
          <button
            onClick={() => setCorners({ a: null, b: null })}
            className="mt-1 font-mono text-[0.6rem] text-white/50 hover:text-white/90"
          >
            clear
          </button>
        </div>
      ) : null}

      {/* World management — the destructive bits live behind build mode */}
      {buildMode && !overlay ? (
        <div className="absolute top-24 right-3 flex w-44 flex-col gap-1.5">
          <button
            onClick={() => setPlacing(true)}
            className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-[#7cc4ff] backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            Place a district…
          </button>
          <button
            onClick={() => {
              if (!confirm("Delete every block, sign and interactive spot? This cannot be undone.")) return;
              clearWorld.mutate(undefined, {
                onSuccess: (res) => {
                  appliedRevision.current = res.revision;
                  void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                  toast.success("World cleared.");
                },
                onError: (e) => toast.error(e.message),
              });
            }}
            disabled={clearWorld.isPending}
            className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-red-300 backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-50"
          >
            {clearWorld.isPending ? "Clearing…" : "Clear everything"}
          </button>
          <button
            onClick={() =>
              setSpawn.mutate(
                {
                  x: Math.round(E.st.pos.x * 10) / 10,
                  y: Math.round(E.st.pos.y),
                  z: Math.round(E.st.pos.z * 10) / 10,
                  yaw: Math.round(E.yaw * 1000) / 1000,
                },
                {
                  onSuccess: () => toast.success("Spawn moved here."),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
            className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            Set spawn here
          </button>
        </div>
      ) : null}

      {/* Build toggle — only for people with build rights */}
      {canBuild && !overlay ? (
        <button
          onClick={() => {
            const next = !buildMode;
            E.build = next;
            setBuildMode(next);
            if (!next) {
              E.flying = false;
              setFlying(false);
            }
          }}
          className={`absolute top-14 right-3 rounded-lg px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors ${
            buildMode
              ? "bg-[#ffd166] text-black"
              : "bg-black/60 text-white/90 hover:bg-black/80"
          }`}
        >
          {buildMode ? "Building (G)" : "Build (G)"}
        </button>
      ) : null}

      {/* Always-on minimap */}
      {world && !overlay ? (
        <Minimap world={world} read={readPose} />
      ) : null}

      {/* Creative inventory */}
      {pickerOpen ? (
        <BlockPicker
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setHotbar((h) => {
              const next = [...h];
              next[slot] = id;
              return next;
            });
            setPickerOpen(false);
          }}
        />
      ) : null}

      {/* Wire a block to the Work OS */}
      {wiring && world ? (
        <WireDialog
          cell={wiring}
          existing={
            world.pois.find(
              (p) => p.min.x === wiring.x && p.min.y === wiring.y && p.min.z === wiring.z,
            ) ?? null
          }
          saving={setPoi.isPending || deletePoi.isPending}
          onClose={() => setWiring(null)}
          onSave={wireBlock}
          onUnwire={() => {
            dropPoiAt(wiring.x, wiring.y, wiring.z);
            setWiring(null);
            toast("Unwired", { description: "It's just a block again." });
          }}
        />
      ) : null}

      {/* Fill the marked box */}
      {filling ? (
        <FillDialog
          box={filling}
          blockId={hotbar[slot] ?? 1}
          onClose={() => setFilling(null)}
          onFill={(mode, id, raise) => runFill(filling, mode, id, raise)}
        />
      ) : null}

      {/* Letter a wall */}
      {signing ? (
        <SignDialog
          draft={signing}
          saving={setSign.isPending || deleteSign.isPending}
          onClose={() => setSigning(null)}
          onSave={(sg) => {
            setSign.mutate(sg, {
              onSuccess: (res) => {
                appliedRevision.current = res.revision;
                void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                toast.success("Sign is up.");
              },
            });
            setSigning(null);
          }}
          onDelete={() => {
            if (signing.id) {
              deleteSign.mutate(
                { id: signing.id },
                {
                  onSuccess: (res) => {
                    appliedRevision.current = res.revision;
                    void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                    toast("Sign removed.");
                  },
                },
              );
            }
            setSigning(null);
          }}
        />
      ) : null}

      {/* Name a space */}
      {naming ? (
        <RegionDialog
          draft={naming}
          existing={world?.regions ?? []}
          saving={setRegion.isPending || deleteRegion.isPending}
          onClose={() => setNaming(null)}
          onSave={(r) => {
            setRegion.mutate(r, {
              onSuccess: (res) => {
                appliedRevision.current = res.revision;
                void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                toast.success(`“${r.label}” is on the map.`);
              },
            });
            setNaming(null);
            setCorners({ a: null, b: null });
          }}
          onDelete={(key) => {
            deleteRegion.mutate(
              { key },
              {
                onSuccess: (res) => {
                  appliedRevision.current = res.revision;
                  void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                  toast("Space removed.");
                },
              },
            );
            setNaming(null);
          }}
        />
      ) : null}

      {/* Place a whole district */}
      {placing ? (
        <DistrictPicker
          districts={districts.data ?? []}
          busy={stamp.isPending}
          at={{
            x: Math.floor(E.st.pos.x),
            y: 0,
            z: Math.floor(E.st.pos.z),
          }}
          onClose={() => setPlacing(false)}
          onPlace={(key, origin) => {
            stamp.mutate(
              { key, origin },
              {
                onSuccess: (res) => {
                  appliedRevision.current = res.revision;
                  void loaded.refetch().then(() => setWorldEpoch((n) => n + 1));
                  toast.success(`${res.label} is up`, {
                    description: `${res.blocks.toLocaleString()} blocks, ${res.pois} things to walk up to.`,
                  });
                  setPlacing(false);
                },
              },
            );
          }}
        />
      ) : null}

      {/* Hint line */}
      {!overlay && !locked ? (
        <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 font-mono text-[0.62rem] tracking-wide text-white/60">
          click to capture the mouse · WASD walk · Space jump · Shift sprint · E interact
        </p>
      ) : null}

      {/* Overlay host */}
      {overlay ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOverlay(null);
          }}
        >
          <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-base font-semibold">
                {overlay.name ?? OVERLAY_TITLES[overlay.kind]}
              </h2>
              <button
                onClick={() => setOverlay(null)}
                className="rounded px-2 py-0.5 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase hover:text-foreground"
              >
                esc
              </button>
            </div>
            <div ref={overlayContentRef} className="min-h-0 flex-1 overflow-y-auto p-5">
              {overlay.kind === "bounties" ? (
                <BountyBoardPanel
                  onChanged={() => {
                    utils.workspace.state.invalidate();
                    utils.skill.tree.invalidate();
                  }}
                />
              ) : null}
              {overlay.kind === "skills" ? <SkillTreePanel /> : null}
              {overlay.kind === "roster" ? <CrewRosterPanel /> : null}
              {overlay.kind === "missions" && overlay.refId ? (
                <RoomMissionsPanel
                  roomId={overlay.refId}
                  onChanged={() => {
                    utils.workspace.state.invalidate();
                    utils.skill.tree.invalidate();
                  }}
                />
              ) : null}
              {overlay.kind === "video" ? <VideoBayPanel /> : null}
              {overlay.kind === "city" ? (
                <DevCityPanel
                  initialBuilding={cityTargetFor(overlay.refId).building}
                  initialFloor={cityTargetFor(overlay.refId).floor}
                />
              ) : null}
              {overlay.kind === "conference" ? (
                <ConferencePanel initialCompose={overlay.refId === "compose"} />
              ) : null}
              {overlay.kind === "tasks" ? <TasksRoomPanel /> : null}
              {overlay.kind === "approvals" ? <ApprovalsPanel /> : null}
              {overlay.kind === "outreach" ? <OutreachPanel /> : null}
              {overlay.kind === "creative" ? (
                <CreativePanel
                  initialDoor={overlay.refId === "internal" ? "internal" : "clients"}
                  onOpenBoard={(docId) => router.push(`/documents/${docId}`)}
                />
              ) : null}
              {overlay.kind === "shoot" ? <ShootPanel /> : null}
              {overlay.kind === "timetable" ? <TimetablePanel /> : null}
              {overlay.kind === "docs" ? <DocsPanel /> : null}
              {overlay.kind === "lair" ? <LairPanel /> : null}
              {overlay.kind === "chat" ? <ChatPanel className="h-[62vh]" /> : null}
              {overlay.kind === "map" && world ? (
                <CampusMap
                  world={world}
                  me={{ x: E.st.pos.x, y: E.st.pos.y, z: E.st.pos.z, yaw: E.yaw }}
                />
              ) : null}
              {overlay.kind === "help" ? <HelpPanel canBuild={canBuild} /> : null}
              {overlay.kind === "settings" ? (
                <SettingsPanel settings={settings} onChange={applySettings} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creative inventory
// ---------------------------------------------------------------------------

/**
 * The atlas, painted once and shared by every swatch. Slicing the real texture
 * means the palette shows exactly what you are about to place.
 */
let swatchAtlas: HTMLCanvasElement | null = null;
function atlasOnce(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  swatchAtlas = swatchAtlas ?? paintAtlas();
  return swatchAtlas;
}

/** One block's top-face tile, drawn at whatever size the button gives it. */
function BlockSwatch({ id }: { id: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const atlas = atlasOnce();
    const def = BLOCKS[id];
    if (!canvas || !atlas || !def) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tile = def.tiles.side;
    const sx = (tile % ATLAS_COLS) * TILE_PX;
    const sy = ((tile / ATLAS_COLS) | 0) * TILE_PX;
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  }, [id]);
  return (
    <canvas
      ref={ref}
      className="size-full"
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

function BlockPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const byKey = useMemo(() => new Map(BLOCKS.map((b, i) => [b.key, i])), []);
  const q = query.trim().toLowerCase();

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background text-foreground shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="font-display text-base font-semibold">All blocks</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks…"
            className="ml-auto w-56 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            onClick={onClose}
            className="rounded px-2 py-0.5 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase hover:text-foreground"
          >
            esc
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {BLOCK_GROUPS.map((group) => {
            const ids = group.keys
              .map((k) => byKey.get(k))
              .filter((id): id is number => id !== undefined && id !== 0)
              .filter((id) => !q || BLOCKS[id].label.toLowerCase().includes(q) || BLOCKS[id].key.includes(q));
            if (ids.length === 0) return null;
            return (
              <div key={group.name} className="mb-5">
                <p className="mb-2 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                  {group.name}
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-2">
                  {ids.map((id) => (
                    <button
                      key={id}
                      onClick={() => onPick(id)}
                      title={BLOCKS[id].label}
                      className="flex flex-col items-center gap-1 rounded-lg border border-border p-2 transition-colors hover:border-foreground hover:bg-muted"
                    >
                      <span className="size-10 overflow-hidden rounded">
                        <BlockSwatch id={id} />
                      </span>
                      <span className="w-full truncate text-center text-[0.62rem] leading-tight text-muted-foreground">
                        {BLOCKS[id].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map overlay: a top-down painting of the voxel world
// ---------------------------------------------------------------------------

/**
 * The always-on HUD minimap. Samples the storey you're standing on in a window
 * around you, so you can navigate without opening the full plan.
 */
function Minimap({
  world,
  read,
}: {
  world: World;
  read: () => { x: number; y: number; z: number; yaw: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const SIZE = 168;
    const SPAN = 52; // blocks across the window
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const cell = SIZE / SPAN;

    let timer = 0;
    const draw = () => {
      const me = read();
      const level = Math.floor(me.y);
      const top = Math.min(world.sy - 1, level + 4);
      const bottom = Math.max(0, level - 2);
      const x0 = Math.floor(me.x - SPAN / 2);
      const z0 = Math.floor(me.z - SPAN / 2);

      ctx.clearRect(0, 0, SIZE, SIZE);
      for (let gz = 0; gz < SPAN; gz++) {
        for (let gx = 0; gx < SPAN; gx++) {
          const wx = x0 + gx;
          const wz = z0 + gz;
          let color: string | null = null;
          for (let y = top; y >= bottom; y--) {
            const id = blockAt(world, wx, y, wz);
            if (id !== 0) {
              const def = BLOCKS[id];
              color = def.tint ?? MAP_FALLBACK[def.key] ?? "#8a8a8a";
              break;
            }
          }
          ctx.fillStyle = color ?? "#0d1014";
          ctx.fillRect(gx * cell, gz * cell, cell + 0.5, cell + 0.5);
        }
      }

      // Points of interest nearby.
      for (const p of world.pois) {
        const px = (p.min.x + p.max.x) / 2;
        const pz = (p.min.z + p.max.z) / 2;
        const py = (p.min.y + p.max.y) / 2;
        if (Math.abs(py - me.y) > 5) continue;
        const gx = (px - x0) * cell;
        const gz = (pz - z0) * cell;
        if (gx < 0 || gz < 0 || gx > SIZE || gz > SIZE) continue;
        ctx.fillStyle = "#ffd166";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(gx, gz, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Me, in the centre, pointing where I look.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(me.yaw);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    draw();
    timer = window.setInterval(draw, 120);
    return () => window.clearInterval(timer);
  }, [world, read]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 overflow-hidden rounded-xl border border-white/15 bg-black/50 shadow-lg backdrop-blur-sm">
      <canvas ref={canvasRef} style={{ width: 168, height: 168, display: "block" }} />
      <p className="border-t border-white/10 px-2 py-1 text-center font-mono text-[0.58rem] tracking-widest text-white/60 uppercase">
        M · full plan
      </p>
    </div>
  );
}

function CampusMap({
  world,
  me,
}: {
  world: World;
  me: { x: number; z: number; y: number; yaw: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const level = Math.floor(me.y);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 3.4;
    canvas.width = world.sx * scale;
    canvas.height = world.sz * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A floor plan of the storey you're standing on: scan down from just below
    // this floor's ceiling, so the roof never hides the layout.
    const top = Math.min(world.sy - 1, level + 4);
    for (let z = 0; z < world.sz; z++) {
      for (let x = 0; x < world.sx; x++) {
        let color = "#1b1e24";
        for (let y = top; y >= Math.max(0, level - 2); y--) {
          const id = blockAt(world, x, y, z);
          if (id !== 0) {
            const def = BLOCKS[id];
            color = def.tint ?? MAP_FALLBACK[def.key] ?? "#888888";
            break;
          }
        }
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, z * scale, scale, scale);
      }
    }

    // Name the rooms on THIS storey only. Nested spaces (a studio's two wings,
    // the timetable alcove inside reception) share a centre, so nudge each
    // colliding label clear of the one before it instead of overprinting.
    ctx.textAlign = "center";
    ctx.font = "700 11px monospace";
    const placed: { x: number; y: number }[] = [];
    for (const r of world.regions) {
      if (r.lair) continue;
      if (level < r.min.y || level >= r.max.y) continue;
      const cx = ((r.min.x + r.max.x) / 2) * scale;
      let cz = ((r.min.z + r.max.z) / 2) * scale;
      const half = ctx.measureText(r.label).width / 2 + 6;
      let guard = 0;
      while (
        guard++ < 8 &&
        placed.some((p) => Math.abs(p.y - cz) < 13 && Math.abs(p.x - cx) < half + 40)
      ) {
        cz += 13;
      }
      placed.push({ x: cx, y: cz });
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(r.label.toUpperCase(), cx + 1, cz + 1);
      ctx.fillStyle = "#fefbf2";
      ctx.fillText(r.label.toUpperCase(), cx, cz);
    }

    // Me.
    const mx = me.x * scale;
    const mz = me.z * scale;
    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(me.yaw);
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [world, me, level]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Floor plan of the storey you&apos;re on. The Upside Down is on no plan.
      </p>
      <div className="overflow-auto rounded-xl border border-border">
        <canvas ref={canvasRef} className="block w-full" style={{ imageRendering: "pixelated" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help + settings
// ---------------------------------------------------------------------------

function HelpPanel({ canBuild }: { canBuild: boolean }) {
  const walking: [string, string][] = [
    ["W A S D", "Walk the office · Shift to hurry"],
    ["Space", "Step up · hop"],
    ["Mouse", "Look (click the view to capture the mouse)"],
    ["E / Click", "Use the thing you are looking at"],
    ["C", "Chat — servers and channels, like Slack"],
    ["B / T", "Bounties · Your day, as the owner set it"],
    ["K / M", "Skill tree · Floor plan"],
    ["Tab / H / O", "Crew · Help · View settings"],
    ["F", "Fullscreen"],
    ["Esc", "Close panel → release mouse → leave"],
  ];
  const building: [string, string][] = [
    ["G", "Enter and leave build mode"],
    ["L / R click", "Break · place — hold to keep going"],
    ["M click", "Eyedropper: take the block you are aiming at"],
    ["1-9 / wheel", "Choose a hotbar slot"],
    ["E or Q", "Every block, searchable"],
    ["Space Space", "Fly"],
    ["V", "Mark a corner — mark two and the fill panel opens"],
    ["Z", "Undo the last fill or batch"],
    ["X", "Letter the wall you are aiming at"],
    ["N", "Name the marked space, and link it to a room"],
    ["R", "Wire a block to a Work OS panel"],
  ];
  const Row = ([key, label]: [string, string]) => (
    <div key={key} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <kbd className="min-w-20 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[0.65rem]">
        {key}
      </kbd>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Nothing here was generated. The office is whatever your team has built, block by block —
        and any block can be wired to the tool it stands for, so walking up to it and pressing E
        opens the real thing.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">{walking.map(Row)}</div>
      {canBuild ? (
        <>
          <h3 className="font-heading text-sm font-semibold">Designing the map</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">{building.map(Row)}</div>
        </>
      ) : null}
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: ViewSettings;
  onChange: (patch: Partial<ViewSettings>) => void;
}) {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Field of view</p>
          <span className="font-mono text-xs text-muted-foreground">{settings.fovDeg}°</span>
        </div>
        <input
          type="range"
          min={60}
          max={110}
          step={1}
          value={settings.fovDeg}
          onChange={(e) => onChange({ fovDeg: Number(e.target.value) })}
          className="mt-2 w-full"
        />
        <p className="mt-1 text-xs text-muted-foreground">75° is the sweet spot.</p>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Look sensitivity</p>
          <span className="font-mono text-xs text-muted-foreground">
            {settings.sensitivity.toFixed(2)}×
          </span>
        </div>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.05}
          value={settings.sensitivity}
          onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
          className="mt-2 w-full"
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Render quality</p>
        <div className="flex gap-2">
          {(["auto", "low", "high"] as const).map((q) => (
            <button
              key={q}
              onClick={() => onChange({ quality: q })}
              className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                settings.quality === q
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Auto keeps 60fps by scaling resolution; High pins maximum sharpness.
        </p>
      </div>
    </div>
  );
}
