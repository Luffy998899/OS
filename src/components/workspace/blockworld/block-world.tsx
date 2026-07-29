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
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { characterFor } from "@/lib/characters";
import {
  blockAt,
  inLair,
  regionAt,
  type Poi,
  type World,
} from "@/lib/blockworld/types";
import { BLOCKS } from "@/lib/blockworld/blocks";
import { buildWorld } from "@/lib/blockworld/world";
import { buildMeshData, type MeshArrays } from "@/lib/blockworld/meshing";
import {
  EYE_HEIGHT,
  stepPlayer,
  groundHeightAt,
  type MoveInput,
  type PlayerState,
} from "@/lib/blockworld/physics";
import { paintAtlas } from "./textures";
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
  const isAdmin = hasPermission(currentUser.permissions, PERMISSIONS.ADMIN);
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

  // Build the world once per campus shape.
  const rooms = state.data?.rooms;
  const projects = state.data?.projects;
  const worldSig = useMemo(
    () =>
      rooms && projects
        ? rooms.map((r) => `${r.id}:${r.key}:${r.name}`).join("|") +
          "//" +
          projects.map((p) => `${p.id}:${p.name}:${p.floor}:${p.buildingKey}`).join("|")
        : null,
    [rooms, projects],
  );
  const world: World | null = useMemo(() => {
    if (!rooms || !projects || rooms.length === 0) return null;
    return buildWorld({
      rooms: rooms.map((r) => ({ id: r.id, key: r.key, name: r.name, kind: r.kind })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        floor: p.floor,
        buildingKey: p.buildingKey,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldSig]);

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
    lairT: 0,
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
    return () => {
      delete (window as unknown as { __bw?: unknown }).__bw;
    };
  }, [E]);

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
        setOverlay({ kind: "creative", refId: door, name: poi.label });
        return;
      }
      if (poi.panel === "client") {
        setOverlay({ kind: "missions", refId: poi.refId, name: poi.label });
        return;
      }
      const kind = poi.panel as OverlayKind;
      setOverlay({ kind, refId: poi.refId, name: poi.label });
    },
    [E, openCreative],
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
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7f6a, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d8, 1.15);
    sun.position.set(0.6, 1, 0.35).multiplyScalar(120);
    scene.add(sun);
    const lairLight = new THREE.PointLight(0xff4030, 0, 18, 1.8);
    scene.add(lairLight);

    // Terrain meshes.
    const atlas = new THREE.CanvasTexture(paintAtlas());
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    atlas.colorSpace = THREE.SRGBColorSpace;

    const meshData = buildMeshData(world);
    const toGeometry = (m: MeshArrays) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
      g.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      return g;
    };
    const matOpaque = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    const matCutout = new THREE.MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const matEmissive = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });
    const meshes = [
      new THREE.Mesh(toGeometry(meshData.opaque), matOpaque),
      new THREE.Mesh(toGeometry(meshData.cutout), matCutout),
      new THREE.Mesh(toGeometry(meshData.emissive), matEmissive),
    ];
    for (const m of meshes) scene.add(m);

    // Text signs.
    const signMeshes: THREE.Mesh[] = [];
    for (const s of world.signs) {
      const pad = 8;
      const fontPx = 42;
      const cv = document.createElement("canvas");
      const cx = cv.getContext("2d")!;
      cx.font = `700 ${fontPx}px "Courier New", monospace`;
      const w = Math.ceil(cx.measureText(s.text).width) + pad * 2;
      cv.width = Math.max(2, w);
      cv.height = fontPx + pad * 2;
      const c2 = cv.getContext("2d")!;
      if (s.bg) {
        c2.fillStyle = s.bg;
        c2.fillRect(0, 0, cv.width, cv.height);
      }
      c2.font = `700 ${fontPx}px "Courier New", monospace`;
      c2.textAlign = "center";
      c2.textBaseline = "middle";
      c2.fillStyle = s.color ?? "#1d1a14";
      c2.fillText(s.text, cv.width / 2, cv.height / 2 + 2);
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
      mesh.position.set(s.x, s.y, s.z);
      if (s.face === "n") {
        mesh.rotation.y = Math.PI;
        mesh.position.z -= off;
      } else if (s.face === "s") {
        mesh.position.z += off;
      } else if (s.face === "e") {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.x += off;
      } else {
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.x -= off;
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

    // POI highlight box.
    const hlGeo = new THREE.BoxGeometry(1, 1, 1);
    const hlEdges = new THREE.EdgesGeometry(hlGeo);
    const hlMat = new THREE.LineBasicMaterial({ color: 0xffd166 });
    const highlight = new THREE.LineSegments(hlEdges, hlMat);
    highlight.visible = false;
    scene.add(highlight);

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
    const onPointerDown = (e: PointerEvent) => {
      if (overlayRef.current) return;
      if (document.pointerLockElement !== dom) {
        dragging = true;
        dragMoved = 0;
        lastPX = e.clientX;
        lastPY = e.clientY;
      }
    };
    const onPointerUp = () => {
      if (overlayRef.current) {
        dragging = false;
        return;
      }
      if (document.pointerLockElement === dom) {
        openInteraction(E.aimed);
      } else if (dragging) {
        dragging = false;
        if (dragMoved < 6) {
          if (E.aimed) openInteraction(E.aimed);
          else dom.requestPointerLock?.();
        }
      }
    };
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
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
      if (!overlayRef.current) {
        const k = E.keys;
        const input: MoveInput = {
          forward: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
          strafe: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
          jump: k.has("Space"),
          sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
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
        if (poi.adminOnly && !E.isAdmin && poi.panel !== "rift") continue;
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
      if (best) {
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
      hemi.intensity = 0.9 - 0.72 * lt;
      sun.intensity = 1.15 - 1.0 * lt;
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
      document.removeEventListener("pointerlockchange", onLockChange);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      for (const [, entry] of E.rigs) {
        scene.remove(entry.rig.group);
        entry.rig.dispose();
      }
      E.rigs.clear();
      for (const m of meshes) {
        m.geometry.dispose();
      }
      matOpaque.dispose();
      matCutout.dispose();
      matEmissive.dispose();
      atlas.dispose();
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
        if (overlayRef.current) {
          setOverlay(null);
          e.preventDefault();
        } else if (document.pointerLockElement) {
          /* browser releases the lock */
        } else {
          onExit();
        }
        return;
      }
      if (overlayRef.current) return;
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      switch (e.code) {
        case "KeyE":
          openInteraction(E.aimed);
          return;
        case "KeyB":
          setOverlay({ kind: "bounties" });
          return;
        case "KeyT":
          setOverlay({ kind: "skills" });
          return;
        case "KeyM":
          setOverlay({ kind: "map" });
          return;
        case "KeyO":
          setOverlay({ kind: "settings" });
          return;
        case "KeyC":
          setOverlay({ kind: "chat" });
          return;
        case "Tab":
          setOverlay({ kind: "roster" });
          return;
        case "KeyH":
          setOverlay({ kind: "help" });
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
  }, [E, onExit, openInteraction, container]);

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

  const cityBuildingFor = (refId: string | undefined): "pipeline" | "complete" | "tools" => {
    if (!refId || refId === "tools") return "tools";
    const p = projects?.find((pr) => pr.id === refId);
    const key = p?.buildingKey ?? "";
    if (key.includes("tool")) return "tools";
    if (key.includes("complete")) return "complete";
    return "pipeline";
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
          onClick={() => setOverlay({ kind: "conference" })}
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

      {/* Hotbar */}
      {!overlay ? (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
          {(
            [
              ["C", "Chat", "chat"],
              ["B", "Bounties", "bounties"],
              ["T", "Skills", "skills"],
              ["M", "Map", "map"],
              ["Tab", "Crew", "roster"],
              ["O", "View", "settings"],
              ["H", "Help", "help"],
            ] as const
          ).map(([key, label, kind]) => (
            <button
              key={key}
              onClick={() => setOverlay({ kind })}
              className="flex min-w-16 flex-col items-center rounded-lg border border-white/12 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <kbd className="font-mono text-[0.6rem] text-[#ffd166]">{key}</kbd>
              <span className="text-[0.68rem] font-medium text-white/85">{label}</span>
            </button>
          ))}
        </div>
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
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
                <DevCityPanel initialBuilding={cityBuildingFor(overlay.refId)} />
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
              {overlay.kind === "help" ? <HelpPanel /> : null}
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
// Map overlay: a top-down painting of the voxel world
// ---------------------------------------------------------------------------

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

function HelpPanel() {
  const rows: [string, string][] = [
    ["W A S D", "Walk the office · Shift to hurry"],
    ["Space", "Step up · hop"],
    ["Mouse", "Look (click the view to capture the mouse)"],
    ["E / Click", "Sit down at a computer, use a board, call a lift"],
    ["C", "Chat — servers and channels, like Slack"],
    ["B / T / M", "Bounties · Skill tree · Floor plan"],
    ["Tab / H / O", "Crew · Help · View settings"],
    ["F", "Fullscreen"],
    ["Esc", "Close panel → release mouse → leave"],
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This is the office. Walk the corridor, go through a door, sit at a computer — every
        workstation opens the real tool it belongs to, and every room has its own board of open
        work. The lifts in the Dev Wing run both project towers, a floor per project.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <kbd className="min-w-16 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[0.65rem]">
              {key}
            </kbd>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
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
