"use client";

// Full-window first-person view of the campus — v3.
//
// The campus is axis-aligned rectangles in top-down world space
// (lib/workspace-map), cast the way a person standing on the floor sees it: eye
// at 1.5m, per-pixel depth, billboards depth-tested over the world. v3 adds
// real exploration — buildings you walk into through their doors, parks with
// trees, a fountain plaza — plus view settings (FOV, sensitivity, head bob,
// quality), documents written at in-world desks, and the admin-only Upside
// Down behind the rift, from where demogorgons land on slackers' screens.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  Bell,
  Compass,
  Loader2,
  LogOut,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Settings2,
  Sparkles,
  UtensilsCrossed,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  buildLayout,
  buildNavGrid,
  findPath,
  inLair,
  placeName,
  resolveCollision,
  roomIdAt,
  type Layout,
  type NavGrid,
  type Vec,
} from "@/lib/workspace-map";
import {
  CEILING_HEIGHT,
  DESK_HEIGHT,
  FLOOR_INTERIOR_BASE,
  FLOOR_PARK,
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
import { slotRangeLabel } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import {
  approvalDeskSprite,
  bigClockSprite,
  bountyBoardSprite,
  cameraRigSprite,
  chairSprite,
  conferenceScreenSprite,
  coolerSprite,
  crewSprite,
  editRigSprite,
  exitDoorSprite,
  fountainSprite,
  galleryBoardSprite,
  hiveDeskSprite,
  infiniteBoardSprite,
  libraryShelfSprite,
  liftPanelSprite,
  lightRigSprite,
  missionBoardSprite,
  monitorSprite,
  outreachDeskSprite,
  phoneBoothSprite,
  plantSprite,
  queueBoardSprite,
  riftSprite,
  schoolBellSprite,
  scriptTerminalSprite,
  seatedEditorSprite,
  studioDoorSprite,
  taskWallSprite,
  treeSprite,
  vineSprite,
  writingDeskSprite,
  type Orientation,
  type SpriteBitmap,
  type WalkFrame,
} from "./sprites";
import { BountyBoardPanel } from "./bounty-board";
import { SkillTreePanel } from "./skill-tree";
import { RoomMissionsPanel } from "./room-missions-panel";
import { CrewRosterPanel } from "./crew-roster";
import { VideoBayPanel } from "./rooms/video-bay-panel";
import { DevCityPanel } from "./rooms/dev-city-panel";
import { ConferencePanel } from "./rooms/conference-panel";
import { TasksRoomPanel } from "./rooms/tasks-room-panel";
import { ApprovalsPanel } from "./rooms/approvals-panel";
import { OutreachPanel } from "./rooms/outreach-panel";
import { CreativePanel } from "./rooms/creative-panel";
import { ShootPanel } from "./rooms/shoot-panel";
import { TimetablePanel } from "./rooms/timetable-panel";
import { DocsPanel } from "./rooms/docs-panel";
import { LairPanel } from "./rooms/lair-panel";

const WALK_SPEED = 1.7;
const SPRINT_SPEED = 2.9;
const TURN_KEY_SPEED = 0.035;
const INTERACT_RANGE = 120;
const SAVE_INTERVAL_MS = 900;

const RENDER_SCALE_START = 0.62;
const RENDER_SCALE_MIN = 0.42;
const RENDER_SCALE_MAX = 0.85;
const RENDER_W_MAX = 1360;
const FLOOR_PATTERN_DIST = 620;
const CEIL_PATTERN_DIST = 760;

// ---- player view settings (persisted) -------------------------------------

type ViewSettings = {
  /** Field of view in degrees. */
  fovDeg: number;
  /** Look sensitivity multiplier. */
  sensitivity: number;
  headBob: boolean;
  /** auto = frame-time governor; low/high pin the render scale. */
  quality: "auto" | "low" | "high";
};

const DEFAULT_SETTINGS: ViewSettings = { fovDeg: 72, sensitivity: 1, headBob: true, quality: "auto" };
const SETTINGS_KEY = "auxa-fps-settings";

function loadSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      fovDeg: clamp(Number(parsed.fovDeg) || DEFAULT_SETTINGS.fovDeg, 55, 105),
      sensitivity: clamp(Number(parsed.sensitivity) || 1, 0.3, 2.5),
      headBob: parsed.headBob !== false,
      quality: ["auto", "low", "high"].includes(parsed.quality) ? parsed.quality : "auto",
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

type PanelKind =
  | "missions"
  | "bounties"
  | "skills"
  | "roster"
  | "help"
  | "map"
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
  | "settings";

type Overlay = { kind: PanelKind; refId?: string; name?: string } | null;

type Interactable = {
  panel: PanelKind | "portal";
  id: string;
  refId?: string;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  portalTo?: Vec;
  portalYaw?: number;
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
  rx: number;
  ry: number;
  facing: number;
  status: string;
  character: Character;
  moving: boolean;
};

const PROP_SIZE: Record<string, { worldW: number; worldH: number }> = {
  "mission-board": { worldW: 50, worldH: 75 },
  "queue-board": { worldW: 54, worldH: 74 },
  "npc-editor": { worldW: 62, worldH: 68 },
  "conference-screen": { worldW: 78, worldH: 68 },
  chair: { worldW: 26, worldH: 34 },
  "door-clients": { worldW: 50, worldH: 78 },
  "door-internal": { worldW: 50, worldH: 78 },
  "infinite-board": { worldW: 70, worldH: 73 },
  "task-wall": { worldW: 62, worldH: 70 },
  "approval-desk": { worldW: 66, worldH: 50 },
  "outreach-desk": { worldW: 62, worldH: 65 },
  "phone-booth": { worldW: 38, worldH: 74 },
  "camera-rig": { worldW: 52, worldH: 72 },
  "light-rig": { worldW: 44, worldH: 76 },
  "big-clock": { worldW: 56, worldH: 64 },
  "school-bell": { worldW: 34, worldH: 44 },
  plant: { worldW: 33, worldH: 45 },
  cooler: { worldW: 31, worldH: 58 },
  monitor: { worldW: 26, worldH: 22 },
  "edit-rig": { worldW: 46, worldH: 29 },
  "bounty-board": { worldW: 61, worldH: 78 },
  tree: { worldW: 74, worldH: 98 },
  fountain: { worldW: 92, worldH: 70 },
  "writing-desk": { worldW: 62, worldH: 54 },
  "script-terminal": { worldW: 46, worldH: 69 },
  "lift-panel": { worldW: 44, worldH: 66 },
  "gallery-board": { worldW: 72, worldH: 62 },
  "library-shelf": { worldW: 66, worldH: 78 },
  "exit-door": { worldW: 52, worldH: 79 },
  vine: { worldW: 52, worldH: 92 },
  rift: { worldW: 58, worldH: 79 },
  "hive-desk": { worldW: 72, worldH: 66 },
};

const CREW_SIZE = { worldW: 55, worldH: 70 };

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

const FOG: [number, number, number] = [199, 193, 180];
const CORRIDOR: [number, number, number] = [176, 169, 152];
const CORRIDOR_GROUT: [number, number, number] = [148, 141, 126];
const CEIL_BASE: [number, number, number] = [226, 222, 212];
const CEIL_PANEL: [number, number, number] = [252, 250, 244];
const SKY_TOP: [number, number, number] = [176, 214, 226];
const SKY_BOTTOM: [number, number, number] = [214, 230, 219];
const SKY_ZENITH: [number, number, number] = [112, 172, 234];
const SKY_HORIZON: [number, number, number] = [209, 224, 233];
const GRASS_A: [number, number, number] = [122, 158, 96];
const GRASS_B: [number, number, number] = [108, 146, 86];
const GRASS_BLADE: [number, number, number] = [88, 128, 70];
const LAIR_FLOOR: [number, number, number] = [24, 18, 28];
const LAIR_VEIN: [number, number, number] = [96, 26, 38];

function fogged(rgb: [number, number, number], light: number, f: number): number {
  return pack(
    rgb[0] * light * (1 - f) + FOG[0] * f,
    rgb[1] * light * (1 - f) + FOG[1] * f,
    rgb[2] * light * (1 - f) + FOG[2] * f,
  );
}

function fogAmount(depth: number): number {
  const t = depth / VIEW_DISTANCE;
  return t <= 0 ? 0 : t >= 1 ? 0.85 : Math.pow(t, 1.2) * 0.85;
}

function hash2(a: number, b: number): number {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export function FirstPersonFloor({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const isAdmin = hasPermission(currentUser.permissions, PERMISSIONS.ADMIN);
  const utils = trpc.useUtils();
  const router = useRouter();
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

  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [locked, setLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [prompt, setPrompt] = useState<Interactable | null>(null);
  const [hud, setHud] = useState({ fps: 0, room: "The Park" });
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_SETTINGS);

  const layout: Layout = useMemo(
    () => buildLayout((state.data?.rooms ?? []).map((r) => ({ ...r }))),
    [state.data?.rooms],
  );

  const R = useEngine();
  R.layout = layout;
  R.settings = settings;

  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;

  const myCharacter = useMemo(
    () => characterFor(myCharacterId, currentUser.id),
    [myCharacterId, currentUser.id],
  );

  // Settings from localStorage once on the client.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Claim the crew slot + last position.
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
        utils.workspace.state.invalidate();
      },
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geometry.
  useEffect(() => {
    if (layout.rooms.length === 0) return;
    R.solids = buildSolids(layout);
    R.moveSolids = layout.solids;
    R.grid = buildCastGrid(R.solids, layout.world);
    R.floorIndex = buildFloorIndex(layout);
    R.nav = buildNavGrid(layout);
    R.floorPalette = [
      CORRIDOR,
      ...layout.rooms.map((room) => {
        const [r, g, b] = hexRgb(room.accent);
        return [r * 0.38 + 150 * 0.62, g * 0.38 + 144 * 0.62, b * 0.38 + 128 * 0.62] as [number, number, number];
      }),
    ];
    R.interiorFloors = layout.interiors.map((i) => i.floor);
    if (!R.spawned) {
      R.x = layout.spawn.x;
      R.y = layout.spawn.y;
      R.yaw = 0; // facing the fountain and the plaza board
      R.spawned = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Interactables.
  const interactables = useMemo<Interactable[]>(() => {
    if (layout.rooms.length === 0) return [];
    const out: Interactable[] = [];
    const bounties = state.data?.totalBounties ?? 0;
    out.push({
      panel: "bounties",
      id: "plaza-board",
      name: "Bounty Board",
      subtitle: `${bounties} unclaimed`,
      x: layout.plaza.board.x,
      y: layout.plaza.board.y,
    });

    for (const room of layout.rooms) {
      const missions = `${room.missionCount} open mission${room.missionCount === 1 ? "" : "s"}`;
      const boardTarget = (name: string) => ({
        panel: "missions" as const,
        id: `board-${room.id}`,
        refId: room.id,
        name,
        subtitle: missions,
        x: room.board.x,
        y: room.board.y,
      });
      switch (room.zone) {
        case "developer":
          out.push(boardTarget(`${room.name} — Missions`));
          break;
        case "video-editing": {
          const q = room.props.find((p) => p.kind === "queue-board");
          if (q) out.push({ panel: "video", id: "video-queue", name: "Editing Queue", subtitle: "Pending videos, timers & scripts", x: q.x, y: q.y });
          const npc = room.props.find((p) => p.kind === "npc-editor");
          if (npc) {
            out.push({
              panel: "video",
              id: "video-desk",
              name: "Editing Desk",
              subtitle: state.data?.nowEditing ? `Now editing: ${state.data.nowEditing.title}` : "The timeline is idle",
              x: npc.x,
              y: npc.y,
            });
          }
          const term = room.props.find((p) => p.kind === "script-terminal");
          if (term) out.push({ panel: "docs", id: "video-scripts", name: "Script Terminal", subtitle: "Write & pull scripts without leaving the bay", x: term.x, y: term.y });
          out.push(boardTarget(`${room.name} — Missions`));
          break;
        }
        case "conference": {
          const screen = room.props.find((p) => p.kind === "conference-screen");
          out.push({
            panel: "conference",
            id: "conference",
            name: "Conference Hall",
            subtitle: "Meetings · disclosures · weekly feedback",
            x: screen?.x ?? room.board.x,
            y: (screen?.y ?? room.board.y) + 16,
          });
          break;
        }
        case "creative": {
          for (const p of room.props) {
            if (p.kind === "door-clients") out.push({ panel: "creative", id: "door-clients", refId: "clients", name: "Clients Door", subtitle: "Every client's social planning house", x: p.x, y: p.y + 14 });
            if (p.kind === "door-internal") out.push({ panel: "creative", id: "door-internal", refId: "internal", name: "Internal Door", subtitle: "Auxa's own content space", x: p.x, y: p.y + 14 });
            if (p.kind === "infinite-board") out.push({ panel: "creative", id: "creative-board", refId: "board", name: "Infinite Board", subtitle: "Brand kits, references, scribbles → tasks", x: p.x, y: p.y });
            if (p.kind === "writing-desk") out.push({ panel: "docs", id: "creative-desk", name: "Writing Desk", subtitle: "Scripts & docs, written on the floor", x: p.x, y: p.y });
          }
          out.push(boardTarget(`${room.name} — Missions`));
          break;
        }
        case "tasks": {
          const wall = room.props.find((p) => p.kind === "task-wall");
          out.push({ panel: "tasks", id: "task-wall", name: "Task Wall", subtitle: "Your missions & co-assigned squad work", x: wall?.x ?? room.board.x, y: wall?.y ?? room.board.y });
          break;
        }
        case "managing-heads": {
          const desk = room.props.find((p) => p.kind === "approval-desk");
          out.push({ panel: "approvals", id: "approvals", name: "Approvals Desk", subtitle: "Leave · sign-offs · queries", x: desk?.x ?? room.board.x, y: desk?.y ?? room.board.y });
          out.push(boardTarget(`${room.name} — Missions`));
          break;
        }
        case "outreach": {
          const desk = room.props.find((p) => p.kind === "outreach-desk");
          out.push({ panel: "outreach", id: "outreach", name: "Outreach Desk", subtitle: "Today's sector, day plan & OTP capture", x: desk?.x ?? room.board.x, y: desk?.y ?? room.board.y });
          break;
        }
        case "shoot": {
          const rig = room.props.find((p) => p.kind === "camera-rig");
          out.push({ panel: "shoot", id: "shoot", name: "Shoot Planner", subtitle: "This week in front of the camera", x: rig?.x ?? room.board.x, y: rig?.y ?? room.board.y });
          break;
        }
        case "timetable": {
          const clock = room.props.find((p) => p.kind === "big-clock");
          out.push({ panel: "timetable", id: "timetable", name: "The Timetable", subtitle: "Your day, period by period", x: clock?.x ?? room.board.x, y: (clock?.y ?? room.board.y) + 18 });
          break;
        }
        case "client":
          out.push(boardTarget(room.name));
          break;
      }
    }

    // Interior furniture.
    for (const interior of layout.interiors) {
      for (const p of interior.props) {
        if (p.kind === "lift-panel") out.push({ panel: "city", id: "lift", refId: "tower-pipeline", name: "Lift Panel", subtitle: "Every floor is a project in flight", x: p.x, y: p.y + 12 });
        if (p.kind === "gallery-board" && p.x === interior.props.find((q) => q.kind === "gallery-board")?.x) {
          out.push({ panel: "city", id: "gallery", refId: "tower-complete", name: "The Gallery", subtitle: "Shipped sites — audits & links", x: p.x + 100, y: p.y + 14 });
        }
        if (p.kind === "library-shelf" && p.x === interior.props.find((q) => q.kind === "library-shelf")?.x) {
          out.push({ panel: "city", id: "tools-shelf", refId: "bungalow", name: "The Tool Shelf", subtitle: "Sync AI · prompts · portfolio · research", x: p.x, y: p.y + 14 });
        }
        if (p.kind === "writing-desk") out.push({ panel: "docs", id: `desk-${interior.key}`, name: "Writing Desk", subtitle: "The library's quiet corner", x: p.x, y: p.y });
        if (p.kind === "hive-desk") out.push({ panel: "lair", id: "hive-desk", name: "Vecna's Desk", subtitle: "Watch the floor · send demogorgons", x: p.x, y: p.y + 10 });
      }
    }

    // Portals — doors you actually walk through.
    for (const portal of layout.portals) {
      if (portal.adminOnly && !isAdmin) continue;
      out.push({
        panel: "portal",
        id: portal.id,
        name: portal.label,
        subtitle: portal.subtitle,
        x: portal.at.x,
        y: portal.at.y,
        portalTo: portal.to,
        portalYaw: portal.toYaw,
      });
    }
    return out;
  }, [layout, state.data?.totalBounties, state.data?.nowEditing, isAdmin]);

  R.interactables = interactables;

  // Static props.
  useEffect(() => {
    if (layout.rooms.length === 0) return;
    const rooms = state.data?.rooms ?? [];
    const props: Prop[] = [];
    const sz = (kind: string) => PROP_SIZE[kind] ?? { worldW: 40, worldH: 40 };
    const push = (kind: string, x: number, y: number, bitmap: SpriteBitmap, glow: string | null = null, baseZ = 0) =>
      props.push({ x, y, baseZ, ...sz(kind), bitmap, glow });

    for (const room of layout.rooms) {
      const live = rooms.find((r) => r.id === room.id);
      const bounties = live?.bountyCount ?? 0;
      if (["developer", "creative", "managing-heads", "outreach", "client", "video-editing"].includes(room.zone)) {
        push(
          "mission-board",
          room.board.x,
          room.board.y,
          missionBoardSprite({ accent: room.accent, missions: room.missionCount, bounties, highlighted: room.missionCount > 0 }),
          room.missionCount > 0 ? room.accent : null,
        );
      }
      for (const p of room.props) {
        switch (p.kind) {
          case "queue-board":
            push(p.kind, p.x, p.y, queueBoardSprite(R.queueCount, R.queueHot), R.queueHot ? "#e0574f" : null);
            break;
          case "conference-screen":
            push(p.kind, p.x, p.y, conferenceScreenSprite(!!state.data?.meeting), state.data?.meeting ? "#e0574f" : null);
            break;
          case "chair":
            push(p.kind, p.x, p.y, chairSprite());
            break;
          case "door-clients":
            push(p.kind, p.x, p.y, studioDoorSprite("CLIENTS", "#c98fb0"));
            break;
          case "door-internal":
            push(p.kind, p.x, p.y, studioDoorSprite("INTERNAL", "#8fb46a"));
            break;
          case "infinite-board":
            push(p.kind, p.x, p.y, infiniteBoardSprite());
            break;
          case "task-wall":
            push(p.kind, p.x, p.y, taskWallSprite(room.missionCount));
            break;
          case "approval-desk":
            push(p.kind, p.x, p.y, approvalDeskSprite(0));
            break;
          case "outreach-desk":
            push(p.kind, p.x, p.y, outreachDeskSprite(6));
            break;
          case "phone-booth":
            push(p.kind, p.x, p.y, phoneBoothSprite());
            break;
          case "camera-rig":
            push(p.kind, p.x, p.y, cameraRigSprite());
            break;
          case "light-rig":
            push(p.kind, p.x, p.y, lightRigSprite());
            break;
          case "school-bell":
            push(p.kind, p.x, p.y, schoolBellSprite(false));
            break;
          case "plant":
            push(p.kind, p.x, p.y, plantSprite(Math.round(p.x + p.y)));
            break;
          case "cooler":
            push(p.kind, p.x, p.y, coolerSprite());
            break;
          case "writing-desk":
            push(p.kind, p.x, p.y, writingDeskSprite());
            break;
          case "script-terminal":
            push(p.kind, p.x, p.y, scriptTerminalSprite());
            break;
          case "tree":
            push(p.kind, p.x, p.y, treeSprite(Math.round(p.x)));
            break;
          case "npc-editor":
            R.npc = { x: p.x, y: p.y };
            break;
          case "big-clock":
            R.clockAt = { x: p.x, y: p.y };
            break;
          default:
            break;
        }
      }
      if (room.zone === "video-editing") {
        for (const desk of room.desks) {
          push("edit-rig", desk.x + desk.w / 2, desk.y + desk.h / 2, editRigSprite(room.accent, !!state.data?.nowEditing), null, DESK_HEIGHT);
        }
      } else if (room.zone !== "conference") {
        for (const desk of room.desks) {
          push("monitor", desk.x + desk.w / 2, desk.y + desk.h / 2, monitorSprite(room.accent), null, DESK_HEIGHT);
        }
      }
    }

    // Interiors.
    for (const interior of layout.interiors) {
      let shelfSeed = 0;
      let gallerySeed = 0;
      for (const p of interior.props) {
        switch (p.kind) {
          case "lift-panel":
            push(p.kind, p.x, p.y, liftPanelSprite());
            break;
          case "gallery-board":
            push(p.kind, p.x, p.y, galleryBoardSprite(gallerySeed++));
            break;
          case "library-shelf":
            push(p.kind, p.x, p.y, libraryShelfSprite(shelfSeed++));
            break;
          case "writing-desk":
            push(p.kind, p.x, p.y, writingDeskSprite());
            break;
          case "exit-door":
            push(p.kind, p.x, p.y, exitDoorSprite());
            break;
          case "vine":
            push(p.kind, p.x, p.y, vineSprite(Math.round(p.x)));
            break;
          case "hive-desk":
            push(p.kind, p.x, p.y, hiveDeskSprite(), "#7d1e30");
            break;
          case "plant":
            push(p.kind, p.x, p.y, plantSprite(Math.round(p.x + p.y)));
            break;
          case "cooler":
            push(p.kind, p.x, p.y, coolerSprite());
            break;
          case "rift":
            R.rifts.push({ x: p.x, y: p.y });
            break;
          default:
            break;
        }
      }
    }

    // Campus greenery + plaza.
    R.rifts = R.rifts.filter((r, i, arr) => arr.findIndex((q) => q.x === r.x && q.y === r.y) === i);
    for (const tree of layout.trees) push("tree", tree.x, tree.y, treeSprite(Math.round(tree.x)));
    const bounties = state.data?.totalBounties ?? 0;
    push("bounty-board", layout.plaza.board.x, layout.plaza.board.y, bountyBoardSprite(bounties, bounties > 0), bounties > 0 ? "#e0574f" : null);
    // The managing-heads rift (campus side).
    const heads = layout.rooms.find((r) => r.zone === "managing-heads");
    const campusRift = heads?.props.find((p) => p.kind === "rift");
    if (campusRift && isAdmin) R.rifts.push({ x: campusRift.x, y: campusRift.y });

    R.props = props;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, state.data?.rooms, state.data?.totalBounties, state.data?.meeting, state.data?.nowEditing, isAdmin]);

  // Remote crew.
  useEffect(() => {
    const next = (state.data?.players ?? [])
      .filter((p) => !p.isMe)
      .map((p) => {
        const prev = R.others.find((o) => o.userId === p.userId);
        const x = p.x || layout.spawn.x;
        const y = p.y || layout.spawn.y;
        return {
          userId: p.userId,
          name: p.name,
          x,
          y,
          rx: prev?.rx ?? x,
          ry: prev?.ry ?? y,
          facing: p.facing ?? 0,
          status: p.status,
          character: characterFor(p.characterId, p.userId),
          moving: false,
        } satisfies RemotePlayer;
      });
    R.others = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.players, layout]);

  const video = trpc.video.state.useQuery(undefined, { refetchInterval: 12_000 });
  useEffect(() => {
    R.queueCount = video.data?.queued.length ?? 0;
    R.queueHot = (video.data?.queued ?? []).some((q) => q.priority === "urgent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.data]);

  // The school bell.
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

  /** Aim click-to-walk at a world point: plans an A* route, then walks it. */
  const walkTo = useCallback(
    (x: number, y: number) => {
      R.target = { x, y };
      R.detour = 0;
      R.detourAge = 0;
      R.repath = 0;
      R.path = R.nav ? findPath(R.nav, R.x, R.y, x, y) : [];
      R.pathI = 0;
      R.wayBest = Infinity;
      R.wayAge = 0;
    },
    [R],
  );

  const openInteraction = useCallback(
    (target: Interactable | null) => {
      if (!target) return;
      if (target.panel === "portal") {
        if (!target.portalTo) return;
        R.x = target.portalTo.x;
        R.y = target.portalTo.y;
        R.yaw = target.portalYaw ?? R.yaw;
        R.target = null;
        R.detour = 0;
        R.moved = true;
        toast(target.name, { description: target.subtitle });
        return;
      }
      if (target.panel === "creative" && target.refId === "board") {
        openCreative.mutate(
          { key: "internal" },
          {
            onSuccess: () => {
              utils.creative.doors.invalidate();
              setOverlay({ kind: "creative", refId: "internal" });
            },
          },
        );
        return;
      }
      setOverlay({ kind: target.panel, refId: target.refId, name: target.name });
    },
    [openCreative, utils, R],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* refusable */
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Pointer lock (opt-in).
  useEffect(() => {
    if (!canvasEl) return;
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === canvasEl;
      setLocked(isLocked);
      if (!isLocked) R.keys.clear();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasEl) return;
      const sens = 0.0023 * R.settings.sensitivity;
      R.yaw += e.movementX * sens;
      R.pitch = clamp(R.pitch - e.movementY * sens, -MAX_PITCH, MAX_PITCH);
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [canvasEl, R]);

  // Drag-to-look / click-to-walk.
  useEffect(() => {
    if (!canvasEl) return;
    let downAt: { x: number; y: number } | null = null;
    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (document.pointerLockElement === canvasEl) {
        openInteraction(R.nearTarget);
        return;
      }
      if (e.button !== 0) return;
      downAt = { x: e.clientX, y: e.clientY };
      dragging = false;
      canvasEl.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!downAt || document.pointerLockElement === canvasEl) return;
      const dx = e.clientX - downAt.x;
      const dy = e.clientY - downAt.y;
      if (!dragging && Math.hypot(dx, dy) > 5) dragging = true;
      if (dragging) {
        const sens = 0.0035 * R.settings.sensitivity;
        R.yaw += (e.movementX || 0) * sens;
        R.pitch = clamp(R.pitch - (e.movementY || 0) * sens, -MAX_PITCH, MAX_PITCH);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downAt) return;
      const wasDrag = dragging;
      downAt = null;
      dragging = false;
      try {
        canvasEl.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }
      if (wasDrag || document.pointerLockElement === canvasEl) return;
      if (R.nearTarget) {
        openInteraction(R.nearTarget);
        return;
      }
      const world = screenToFloor(e.clientX, e.clientY);
      if (world) {
        walkTo(world.x, world.y);
        R.keys.clear();
      }
    };
    const screenToFloor = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const cam = R.cam;
      if (!cam) return null;
      const rect = canvasEl.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * cam.width;
      const py = ((clientY - rect.top) / rect.height) * cam.height;
      const p = py - cam.horizon;
      if (p <= 1) return null;
      const rowDist = (cam.eye * cam.projDist) / p;
      const cameraX = (2 * px) / cam.width - 1;
      const wx = cam.x + rowDist * (cam.dirX + cam.planeX * cameraX);
      const wy = cam.y + rowDist * (cam.dirY + cam.planeY * cameraX);
      const L = R.layout;
      if (!L || wx < 20 || wy < 20 || wx > L.world.w - 20 || wy > L.world.h - 20) return null;
      return { x: wx, y: wy };
    };

    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    return () => {
      canvasEl.removeEventListener("pointerdown", onPointerDown);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerup", onPointerUp);
    };
  }, [canvasEl, R, openInteraction, walkTo]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
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
      if (["tab", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      switch (k) {
        case "e":
          openInteraction(R.nearTarget);
          return;
        case "b":
          setOverlay({ kind: "bounties" });
          return;
        case "t":
          setOverlay({ kind: "skills" });
          return;
        case "m":
          setOverlay({ kind: "map" });
          return;
        case "o":
          setOverlay({ kind: "settings" });
          return;
        case "tab":
          setOverlay({ kind: "roster" });
          return;
        case "h":
        case "?":
          setOverlay({ kind: "help" });
          return;
        case "f":
          void toggleFullscreen();
          return;
        case "l":
          if (document.pointerLockElement) document.exitPointerLock();
          else canvasEl?.requestPointerLock?.();
          return;
        default:
          R.keys.add(k);
          R.target = null;
          R.detour = 0;
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
  }, [R, onExit, openInteraction, toggleFullscreen, canvasEl]);

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
    let rowPalette = new Uint32Array(0);
    let renderScale = RENDER_SCALE_START;
    let frameEma = 12;
    let lastTune = performance.now();

    const resize = () => {
      const cssW = Math.max(320, canvasEl.clientWidth);
      const cssH = Math.max(240, canvasEl.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(cssW * dpr);
      const chh = Math.round(cssH * dpr);
      if (canvasEl.width !== cw || canvasEl.height !== chh) {
        canvasEl.width = cw;
        canvasEl.height = chh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const quality = R.settings.quality;
      const scale = quality === "low" ? 0.45 : quality === "high" ? 0.8 : renderScale;
      const w = Math.round(clamp(cssW * scale, 380, RENDER_W_MAX));
      const h = Math.max(220, Math.round((w * cssH) / cssW));
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

    const tuneResolution = (frameMs: number, now: number) => {
      if (R.settings.quality !== "auto") return;
      frameEma = frameEma * 0.9 + frameMs * 0.1;
      if (now - lastTune < 700) return;
      if (frameEma > 19 && renderScale > RENDER_SCALE_MIN) {
        renderScale = Math.max(RENDER_SCALE_MIN, renderScale - 0.07);
        lastTune = now;
        resize();
      } else if (frameEma < 12.5 && renderScale < RENDER_SCALE_MAX) {
        renderScale = Math.min(RENDER_SCALE_MAX, renderScale + 0.05);
        lastTune = now;
        resize();
      }
    };

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
      if (keys.has("arrowleft")) R.yaw -= TURN_KEY_SPEED * dt;
      if (keys.has("arrowright")) R.yaw += TURN_KEY_SPEED * dt;

      const sprinting = keys.has("shift");
      const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * dt;
      let moving = false;

      if (forward !== 0 || strafe !== 0) {
        R.target = null;
        R.detour = 0;
        const step = moveVector(R.yaw, forward, strafe, speed);
        const next = resolveCollision(R.moveSolids, R.x, R.y, R.x + step.dx, R.y + step.dy, R.layout.world);
        if (Math.abs(next.x - R.x) > 0.01 || Math.abs(next.y - R.y) > 0.01) {
          moving = true;
          R.moved = true;
        }
        R.x = next.x;
        R.y = next.y;
      } else if (R.target) {
        const dx = R.target.x - R.x;
        const dy = R.target.y - R.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 12) {
          R.target = null;
          R.detour = 0;
        } else {
          // Chase the A* route; waypoints fall away as we pass them. With no
          // route (unreachable / nav not ready) fall back to a straight aim.
          while (
            R.pathI < R.path.length - 1 &&
            Math.hypot(R.path[R.pathI].x - R.x, R.path[R.pathI].y - R.y) < 20
          ) {
            R.pathI++;
            R.wayBest = Infinity;
            R.wayAge = 0;
          }
          const aim = R.path[R.pathI] ?? R.target;
          const adx = aim.x - R.x;
          const ady = aim.y - R.y;
          const aimDist = Math.hypot(adx, ady) || 1;
          const stepLen = Math.min(speed * 1.05, aimDist);
          const ang = Math.atan2(ady, adx);
          // Watchdog: a detour that stops closing on its waypoint is orbiting
          // some corner — re-plan from wherever we actually are.
          if (aimDist < R.wayBest - 4) {
            R.wayBest = aimDist;
            R.wayAge = 0;
          } else if (++R.wayAge > 140) {
            R.wayAge = 0;
            R.wayBest = Infinity;
            R.detour = 0;
            if (R.nav && ++R.repath <= 4) {
              R.path = findPath(R.nav, R.x, R.y, R.target.x, R.target.y);
              R.pathI = 0;
            } else {
              R.target = null;
            }
          }
          const tryStep = (a: number) =>
            resolveCollision(
              R.moveSolids,
              R.x,
              R.y,
              R.x + Math.cos(a) * stepLen,
              R.y + Math.sin(a) * stepLen,
              R.layout.world,
            );
          let next = tryStep(ang);
          let progressed = Math.hypot(next.x - R.x, next.y - R.y);
          if (progressed >= stepLen * 0.55) {
            // Direct line is open — stop any wall-follow.
            R.detour = 0;
            R.detourAge = 0;
          } else {
            // Blocked. Commit to one side and follow the wall until the direct
            // line clears — re-picking the "best" side each frame just makes
            // the walker dither at the block point forever.
            const followSide = (side: 1 | -1): boolean => {
              for (const off of [0.6, 0.95, 1.35, 1.75]) {
                const cand = tryStep(ang + side * off);
                const pd = Math.hypot(cand.x - R.x, cand.y - R.y);
                if (pd > progressed + 0.01) {
                  next = cand;
                  progressed = pd;
                  if (pd > stepLen * 0.55) return true;
                }
              }
              return progressed > stepLen * 0.25;
            };
            if (R.detour === 0) {
              const left = tryStep(ang - 0.95);
              const right = tryStep(ang + 0.95);
              const pl = Math.hypot(left.x - R.x, left.y - R.y);
              const pr = Math.hypot(right.x - R.x, right.y - R.y);
              R.detour = pl >= pr ? -1 : 1;
            }
            if (!followSide(R.detour)) {
              R.detour = R.detour === 1 ? -1 : 1;
              followSide(R.detour);
            }
            // A follow that drags on this long is orbiting something — give up.
            if (++R.detourAge > 900) {
              R.target = null;
              R.detour = 0;
              R.detourAge = 0;
            }
          }
          // Face where we're actually going: the walk direction while wall-
          // following, the destination once the line is clear.
          const targetYaw =
            progressed > stepLen * 0.3 && R.detour !== 0
              ? Math.atan2(next.y - R.y, next.x - R.x)
              : ang;
          let dyaw = targetYaw - R.yaw;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          R.yaw += dyaw * Math.min(1, 0.12 * dt);
          if (progressed > 0.05) {
            moving = true;
            R.moved = true;
            R.stuck = 0;
          } else if (++R.stuck > 24) {
            // Wedged. Re-plan from here a few times before giving up.
            R.stuck = 0;
            R.detour = 0;
            R.wayBest = Infinity;
            R.wayAge = 0;
            if (R.nav && R.target && ++R.repath <= 4) {
              R.path = findPath(R.nav, R.x, R.y, R.target.x, R.target.y);
              R.pathI = 0;
              if (R.path.length === 0) R.target = null;
            } else {
              R.target = null;
            }
          }
          R.x = next.x;
          R.y = next.y;
        }
      }

      R.moving = moving;
      R.walkPhase += moving ? speed * 0.3 : 0;
      R.bobAmount += ((moving && R.settings.headBob ? (sprinting ? 1 : 0.65) : 0) - R.bobAmount) * Math.min(1, 0.15 * dt);

      for (const o of R.others) {
        const dx = o.x - o.rx;
        const dy = o.y - o.ry;
        const d = Math.hypot(dx, dy);
        if (d > 0.5) {
          const stepLen = Math.min(d, 2.2 * dt);
          o.rx += (dx / d) * stepLen;
          o.ry += (dy / d) * stepLen;
          o.moving = true;
        } else {
          o.moving = false;
        }
      }

      const dirX = Math.cos(R.yaw);
      const dirY = Math.sin(R.yaw);
      const target = pickTarget({ x: R.x, y: R.y, dirX, dirY }, R.interactables, INTERACT_RANGE, 0.05);
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

    const drawWorld = (now: number) => {
      const grid = R.grid;
      const index = R.floorIndex;
      if (!grid || !index || !image) return;

      const bobPx = R.bobAmount > 0.01 ? Math.sin(R.walkPhase) * 2.4 * R.bobAmount * (bufH / 360) : 0;
      const cam = makeCamera({
        x: R.x,
        y: R.y,
        yaw: R.yaw,
        pitch: R.pitch,
        width: bufW,
        height: bufH,
        bob: bobPx,
        fov: (R.settings.fovDeg * Math.PI) / 180,
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
      const horizon = cam.horizon;

      // Floor
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
        const groutColor = fogged(CORRIDOR_GROUT, 1, f);
        const grassA = fogged(GRASS_A, 1, f);
        const grassB = fogged(GRASS_B, 1, f);
        const grassBlade = fogged(GRASS_BLADE, 1, f);
        const lairBase = fogged(LAIR_FLOOR, 1, f * 0.4);
        const lairVein = fogged(LAIR_VEIN, 1, f * 0.4);
        const patterned = rowDist < FLOOR_PATTERN_DIST;
        const stepX = (rowDist * (rightX - leftX)) / bufW;
        const stepY = (rowDist * (rightY - leftY)) / bufW;
        let wx = cam.x + rowDist * leftX;
        let wy = cam.y + rowDist * leftY;
        let o = y * bufW;
        for (let x = 0; x < bufW; x++, o++) {
          const cx = (wx * invCell) | 0;
          const cy = (wy * invCell) | 0;
          const id: number =
            cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows ? 0 : index.ids[cy * index.cols + cx];
          if (id === FLOOR_PARK) {
            // Grass: soft checker + occasional darker blade tufts.
            if (!patterned) {
              colors[o] = grassA;
            } else {
              const gx = (wx / 26) | 0;
              const gy = (wy / 26) | 0;
              let c = ((gx ^ gy) & 1) === 0 ? grassA : grassB;
              if (hash2(wx | 0, wy | 0) % 41 === 0) c = grassBlade;
              colors[o] = c;
            }
          } else if (id >= FLOOR_INTERIOR_BASE && id < FLOOR_PARK) {
            const interiorIdx = id - FLOOR_INTERIOR_BASE;
            const floorRgb = R.interiorFloors[interiorIdx];
            if (!floorRgb) {
              colors[o] = rowPalette[0];
            } else if (R.interiorFloors.length > 0 && R.layout.interiors[interiorIdx]?.theme === "lair") {
              // The Upside Down floor: near-black with red root veins.
              const vein =
                (Math.sin(wx * 0.045) + Math.sin(wy * 0.038 + wx * 0.012)) * 12 +
                ((hash2((wx / 8) | 0, (wy / 8) | 0) % 100) / 100) * 4;
              colors[o] = vein > 21 ? lairVein : lairBase;
            } else {
              // Interior planks.
              const stripe = ((wx / 34) | 0) & 1 ? 0.94 : 1.02;
              colors[o] = fogged(floorRgb, stripe, f);
            }
          } else if (!patterned) {
            colors[o] = rowPalette[id * 2];
          } else if (id === 0) {
            const gx = wx % 100;
            const gy = wy % 100;
            if ((gx >= 0 && gx < 3.5) || (gy >= 0 && gy < 3.5)) {
              colors[o] = groutColor;
            } else {
              const parity = ((((wx / 100) | 0) ^ ((wy / 100) | 0)) & 1) as 0 | 1;
              colors[o] = rowPalette[parity];
            }
          } else {
            const stripe = ((wx + wy) / 28) | 0;
            colors[o] = rowPalette[id * 2 + (stripe & 1)];
          }
          depth[o] = rowDist;
          wx += stepX;
          wy += stepY;
        }
      }

      // Ceiling & sky — vault interiors get panelled ceilings; the open campus
      // gets daylight with blocky clouds drifting on the cloud plane.
      const ceilHeight = CEILING_HEIGHT - cam.eye;
      const ceilEnd = Math.min(bufH, Math.floor(horizon - 0.5));
      const skyDepth = VIEW_DISTANCE + 50;
      const cloudDrift = now * 0.018;
      for (let y = 0; y < ceilEnd; y++) {
        const p = horizon - y;
        if (p <= 0.0001) continue;
        const rowDist = (ceilHeight * cam.projDist) / p;
        const f = fogAmount(rowDist);
        const base = fogged(CEIL_BASE, 0.88, f);
        const panel = fogged(CEIL_PANEL, 1.05, f);
        const rim = fogged(CEIL_BASE, 0.72, f);
        const patterned = rowDist < CEIL_PATTERN_DIST;
        // Sky colour for this row: deeper blue straight overhead, haze at range.
        const haze = Math.min(1, rowDist / 3200);
        const skyColor = pack(
          SKY_ZENITH[0] + (SKY_HORIZON[0] - SKY_ZENITH[0]) * haze,
          SKY_ZENITH[1] + (SKY_HORIZON[1] - SKY_ZENITH[1]) * haze,
          SKY_ZENITH[2] + (SKY_HORIZON[2] - SKY_ZENITH[2]) * haze,
        );
        const cloudMix = 1 - haze * 0.75;
        const cloudColor = pack(
          248 * cloudMix + (SKY_HORIZON[0] + 10) * (1 - cloudMix),
          250 * cloudMix + (SKY_HORIZON[1] + 8) * (1 - cloudMix),
          253 * cloudMix + (SKY_HORIZON[2] + 4) * (1 - cloudMix),
        );
        const cloudShade = pack(
          224 * cloudMix + SKY_HORIZON[0] * (1 - cloudMix),
          231 * cloudMix + SKY_HORIZON[1] * (1 - cloudMix),
          240 * cloudMix + SKY_HORIZON[2] * (1 - cloudMix),
        );
        const stepX = (rowDist * (rightX - leftX)) / bufW;
        const stepY = (rowDist * (rightY - leftY)) / bufW;
        let wx = cam.x + rowDist * leftX;
        let wy = cam.y + rowDist * leftY;
        let o = y * bufW;
        for (let x = 0; x < bufW; x++, o++) {
          const cx = (wx * invCell) | 0;
          const cy = (wy * invCell) | 0;
          const fid: number =
            cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows ? 0 : index.ids[cy * index.cols + cx];
          if (fid >= FLOOR_INTERIOR_BASE && fid < FLOOR_PARK) {
            // Indoors: acoustic panels.
            if (!patterned) {
              colors[o] = base;
            } else {
              const lx = ((wx % 200) + 200) % 200;
              const ly = ((wy % 200) + 200) % 200;
              const inPanel = lx > 55 && lx < 145 && ly > 55 && ly < 145;
              const onRim = !inPanel && lx > 48 && lx < 152 && ly > 48 && ly < 152;
              colors[o] = inPanel ? panel : onRim ? rim : base;
            }
            depth[o] = rowDist;
          } else {
            // Open air: sky, with chunky rectangular clouds that drift east.
            const cwx = wx + cloudDrift;
            const ccx = Math.floor(cwx / 300);
            const ccy = Math.floor(wy / 300);
            let c = skyColor;
            if (hash2(ccx, ccy) % 100 < 34) {
              const lx = cwx - ccx * 300;
              const ly = wy - ccy * 300;
              const h2 = hash2(ccx * 7 + 1, ccy * 3 + 5);
              const padX = 20 + (h2 % 40);
              const padY = 30 + ((h2 >> 4) % 45);
              if (lx > padX && lx < 300 - padX * 0.6 && ly > padY && ly < 300 - padY * 0.8) {
                // Undersides read darker toward the far edge of the blob.
                c = ly > 300 - padY * 0.8 - 34 ? cloudShade : cloudColor;
              }
            }
            colors[o] = c;
            depth[o] = skyDepth;
          }
          wx += stepX;
          wy += stepY;
        }
      }

      // Walls
      for (let x = 0; x < bufW; x++) {
        const ray = columnRay(cam, x + 0.5);
        const n = castRay(grid, cam.x, cam.y, ray.dx, ray.dy, VIEW_DISTANCE, hits);
        for (let i = n - 1; i >= 0; i--) drawSlice(x, hits[i], cam);
      }

      drawSprites(cam, now);

      // ---- the Upside Down post pass ----
      const lairMode = inLair(R.x, R.y);
      R.lairMode = lairMode;
      if (lairMode) {
        // Occasional red lightning: brief bright pulses out of the dark.
        const tSec = now / 1000;
        const strike = Math.max(0, Math.sin(tSec * 0.9) * Math.sin(tSec * 2.63 + 1.7) - 0.88) * 8;
        const flicker = 0.9 + strike;
        const n = bufW * bufH;
        for (let o = 0; o < n; o++) {
          const c = colors[o];
          const r = c & 255;
          const g = (c >>> 8) & 255;
          const b = (c >>> 16) & 255;
          // Desaturate, crush, tint red-violet; lightning lifts the reds.
          const lum = (r * 0.3 + g * 0.59 + b * 0.11) * 0.32;
          colors[o] = pack(
            (lum + 26) * flicker + r * 0.08,
            (lum * 0.65 + 6) * (flicker * 0.82),
            (lum * 0.9 + 18) * (flicker * 0.9),
          );
        }
      }

      offCtx.putImageData(image, 0, 0);
    };

    const drawSlice = (x: number, hit: Hit, cam: ReturnType<typeof makeCamera>) => {
      const s = hit.solid;
      const d = hit.dist;
      if (d <= 0.05 || s.height < 4) return;
      const f = fogAmount(d);
      const invF = 1 - f;
      const fogR = FOG[0] * f;
      const fogG = FOG[1] * f;
      const fogB = FOG[2] * f;
      const [r, g, b] = hexRgb(s.tint);

      const wallLen = hit.axis === 0 ? s.h : s.w;
      const along = hit.u * wallLen;
      let lightBase = hit.axis === 0 ? 0.74 : 0.98;
      if (s.kind === "partition" || s.kind === "shell" || s.kind === "vault") {
        const joint = along % 160;
        if (joint < 2.4) lightBase *= 0.85;
        else if (along % 40 < 1.3) lightBase *= 0.93;
      } else if (s.kind === "desk" || s.kind === "table") {
        if (along % 14 < 0.9) lightBase *= 0.94;
      }
      const nearFade = Math.min(1, d / 90);

      const yBottom = projectHeight(cam, 0, d);
      const yTop = projectHeight(cam, s.height, d);
      let y0 = Math.max(0, Math.ceil(yTop));
      const y1 = Math.min(bufH - 1, Math.floor(yBottom));
      if (y1 < 0 || y0 > bufH - 1) return;

      if (s.height < cam.eye) {
        const yTopBack = projectHeight(cam, s.height, Math.max(hit.exit, d + 0.01));
        const capTop = Math.max(0, Math.ceil(yTopBack));
        const capBottom = Math.min(bufH - 1, Math.floor(yTop));
        const capSpan = Math.max(1, capBottom - capTop);
        for (let y = capTop; y <= capBottom; y++) {
          const o = y * bufW + x;
          if (d >= depth[o]) continue;
          const t = (y - capTop) / capSpan;
          const L = 1.0 + 0.1 * t;
          colors[o] = pack(r * L * invF + fogR, g * L * invF + fogG, b * L * invF + fogB);
          depth[o] = d;
        }
        y0 = Math.max(y0, capTop);
      }

      const span = yBottom - yTop;
      const invSpan = span > 0.0001 ? 1 / span : 0;
      const isTower = s.windows === "tower";
      const isShell = s.windows === "shell";
      const invHeight = 1 / s.height;

      for (let y = y0; y <= y1; y++) {
        const o = y * bufW + x;
        if (d >= depth[o]) continue;
        const z = s.height * (yBottom - y) * invSpan;
        let cr: number;
        let cg: number;
        let cb: number;

        if (isTower && z > 24 && z < s.height - 14) {
          const rowF = (z - 24) / 40;
          const row = rowF | 0;
          const inRowF = rowF - row;
          const colF = along / 34;
          const col = colF | 0;
          const inColF = colF - col;
          if (inRowF < 0.6 && inColF > 0.2) {
            const lit = hash2(col + (s.seed ?? 0) * 97, row) % 10 < 6;
            const gt = inRowF / 0.6;
            if (lit) {
              cr = 255 - 44 * gt;
              cg = 226 - 52 * gt;
              cb = 158 - 56 * gt;
            } else {
              cr = 62 - 22 * gt;
              cg = 78 - 26 * gt;
              cb = 96 - 28 * gt;
            }
            const sideL = hit.axis === 0 ? 0.88 : 1;
            cr *= sideL;
            cg *= sideL;
            cb *= sideL;
          } else {
            const L = lightBase * (0.9 + 0.12 * z * invHeight);
            cr = r * L;
            cg = g * L;
            cb = b * L;
          }
        } else if (isShell && z > 96 && z < 176) {
          const t = (z - 96) / 80;
          if (along % 90 < 4) {
            cr = r * lightBase;
            cg = g * lightBase;
            cb = b * lightBase;
          } else if (z < 100) {
            cr = 245;
            cg = 242;
            cb = 232;
          } else {
            const halfFog = f * 0.5;
            cr = (SKY_BOTTOM[0] + (SKY_TOP[0] - SKY_BOTTOM[0]) * t) * (1 - halfFog) + FOG[0] * halfFog;
            cg = (SKY_BOTTOM[1] + (SKY_TOP[1] - SKY_BOTTOM[1]) * t) * (1 - halfFog) + FOG[1] * halfFog;
            cb = (SKY_BOTTOM[2] + (SKY_TOP[2] - SKY_BOTTOM[2]) * t) * (1 - halfFog) + FOG[2] * halfFog;
            colors[o] = pack(cr, cg, cb);
            depth[o] = d;
            continue;
          }
        } else {
          let L = lightBase * (0.86 + 0.18 * z * invHeight) * (0.82 + 0.18 * nearFade);
          if (z < 6) L *= 0.6;
          else if (z < 9) L *= 0.82;
          else if (s.kind === "shell" && z < 42) L *= 0.86;
          else if (z > s.height - 3 && s.height >= cam.eye) L *= 1.08;
          cr = r * L;
          cg = g * L;
          cb = b * L;
        }

        colors[o] = pack(cr * invF + fogR, cg * invF + fogG, cb * invF + fogB);
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
      const pulse = glowRgb ? 0.18 + 0.1 * Math.sin(performance.now() / 320) : 0;
      const f = fogAmount(d);
      const invF = 1 - f;
      const fogR = FOG[0] * f;
      const fogG = FOG[1] * f;
      const fogB = FOG[2] * f;
      const px0 = Math.max(0, x0);
      const px1 = Math.min(bufW - 1, x1);
      const py0 = Math.max(0, Math.floor(yTop));
      const py1 = Math.min(bufH - 1, Math.ceil(yBottom));
      const sx = bitmap.w / spanX;
      const sy = bitmap.h / spanY;
      const bw = bitmap.w;
      const bh = bitmap.h;
      const px = bitmap.px;

      for (let x = px0; x <= px1; x++) {
        const txf = (x - x0 + 0.5) * sx - 0.5;
        let tx0 = txf | 0;
        if (txf < 0) tx0 = 0;
        if (tx0 > bw - 2) tx0 = bw - 2;
        const fx = Math.min(1, Math.max(0, txf - tx0));
        const fx1 = 1 - fx;

        for (let y = py0; y <= py1; y++) {
          const o = y * bufW + x;
          if (d >= depth[o]) continue;
          const tyf = (y - yTop + 0.5) * sy - 0.5;
          let ty0 = tyf | 0;
          if (tyf < 0) ty0 = 0;
          if (ty0 > bh - 2) ty0 = bh - 2;
          const fy = Math.min(1, Math.max(0, tyf - ty0));
          const fy1 = 1 - fy;

          const row0 = ty0 * bw + tx0;
          const t00 = px[row0];
          const t10 = px[row0 + 1];
          const t01 = px[row0 + bw];
          const t11 = px[row0 + bw + 1];

          const w00 = fx1 * fy1;
          const w10 = fx * fy1;
          const w01 = fx1 * fy;
          const w11 = fx * fy;

          const a00 = t00 >>> 24;
          const a10 = t10 >>> 24;
          const a01 = t01 >>> 24;
          const a11 = t11 >>> 24;
          const a = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
          if (a < 20) continue;

          const wa00 = w00 * a00;
          const wa10 = w10 * a10;
          const wa01 = w01 * a01;
          const wa11 = w11 * a11;
          const invA = 1 / (wa00 + wa10 + wa01 + wa11);
          let sr = ((t00 & 255) * wa00 + (t10 & 255) * wa10 + (t01 & 255) * wa01 + (t11 & 255) * wa11) * invA;
          let sg = (((t00 >>> 8) & 255) * wa00 + ((t10 >>> 8) & 255) * wa10 + ((t01 >>> 8) & 255) * wa01 + ((t11 >>> 8) & 255) * wa11) * invA;
          let sb = (((t00 >>> 16) & 255) * wa00 + ((t10 >>> 16) & 255) * wa10 + ((t01 >>> 16) & 255) * wa01 + ((t11 >>> 16) & 255) * wa11) * invA;

          if (glowRgb) {
            sr = sr * (1 - pulse) + glowRgb[0] * pulse;
            sg = sg * (1 - pulse) + glowRgb[1] * pulse;
            sb = sb * (1 - pulse) + glowRgb[2] * pulse;
          }
          if (a < 250) {
            const prev = colors[o];
            const t = a / 255;
            sr = sr * t + (prev & 255) * (1 - t);
            sg = sg * t + ((prev >>> 8) & 255) * (1 - t);
            sb = sb * t + ((prev >>> 16) & 255) * (1 - t);
          }
          colors[o] = pack(sr * invF + fogR, sg * invF + fogG, sb * invF + fogB);
          depth[o] = d;
        }
      }
    };

    const drawSprites = (cam: ReturnType<typeof makeCamera>, now: number) => {
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
          draw: () => blit(p.bitmap, proj.screenX, yTop, yBottom, p.worldW, proj.depth, p.glow),
        });
      }

      // Animated fixtures: the NPC editor, the live clock, the fountain, rifts.
      if (R.npc) {
        const proj = projectSprite(cam, R.npc.x, R.npc.y);
        if (proj) {
          const bitmap = seatedEditorSprite((((now / 700) | 0) % 2) as 0 | 1);
          entries.push({
            d: proj.depth,
            draw: () =>
              blit(bitmap, proj.screenX, projectHeight(cam, 60, proj.depth), projectHeight(cam, 0, proj.depth), 56, proj.depth, null),
          });
        }
      }
      if (R.clockAt) {
        const proj = projectSprite(cam, R.clockAt.x, R.clockAt.y);
        if (proj) {
          const t = new Date();
          const bitmap = bigClockSprite(t.getHours(), t.getMinutes());
          const size = PROP_SIZE["big-clock"];
          entries.push({
            d: proj.depth,
            draw: () =>
              blit(bitmap, proj.screenX, projectHeight(cam, 40 + size.worldH, proj.depth), projectHeight(cam, 40, proj.depth), size.worldW, proj.depth, null),
          });
        }
      }
      const fountain = R.layout?.fountain;
      if (fountain) {
        const proj = projectSprite(cam, fountain.x, fountain.y);
        if (proj) {
          const bitmap = fountainSprite((((now / 500) | 0) % 2) as 0 | 1);
          const size = PROP_SIZE.fountain;
          entries.push({
            d: proj.depth,
            draw: () =>
              blit(bitmap, proj.screenX, projectHeight(cam, size.worldH, proj.depth), projectHeight(cam, 0, proj.depth), size.worldW, proj.depth, null),
          });
        }
      }
      for (const rift of R.rifts) {
        const proj = projectSprite(cam, rift.x, rift.y);
        if (!proj) continue;
        const bitmap = riftSprite((((now / 380) | 0) % 2) as 0 | 1);
        const size = PROP_SIZE.rift;
        entries.push({
          d: proj.depth,
          draw: () =>
            blit(bitmap, proj.screenX, projectHeight(cam, size.worldH, proj.depth), projectHeight(cam, 0, proj.depth), size.worldW, proj.depth, "#e0574f"),
        });
      }

      for (const other of R.others) {
        const proj = projectSprite(cam, other.rx, other.ry);
        if (!proj) continue;
        const orientation = facingBucket(other.facing, cam.x, cam.y, other.rx, other.ry) as Orientation;
        const frame: WalkFrame = other.moving ? ((((now / 140) | 0) % 4) as WalkFrame) : 0;
        const bitmap = crewSprite(other.character, orientation, other.status, frame);
        const yBottom = projectHeight(cam, 0, proj.depth);
        const yTop = projectHeight(cam, CREW_SIZE.worldH, proj.depth);
        entries.push({
          d: proj.depth,
          draw: () => blit(bitmap, proj.screenX, yTop, yBottom, CREW_SIZE.worldW, proj.depth, null),
          label: { x: proj.screenX, y: yTop, d: proj.depth, player: other },
        });
      }

      if (R.target) {
        const proj = projectSprite(cam, R.target.x, R.target.y);
        if (proj) {
          const yFloor = projectHeight(cam, 0, proj.depth);
          entries.push({
            d: proj.depth,
            draw: () => {
              const ringR = Math.max(2, (16 / proj.depth) * cam.projDist * 0.06);
              const cxPix = Math.round(proj.screenX);
              const cyPix = Math.round(yFloor);
              const pulse = 0.6 + 0.4 * Math.sin(now / 180);
              for (let a = 0; a < 20; a++) {
                const ang = (a / 20) * Math.PI * 2;
                const pxp = Math.round(cxPix + Math.cos(ang) * ringR);
                const pyp = Math.round(cyPix + Math.sin(ang) * ringR * 0.45);
                if (pxp < 0 || pyp < 0 || pxp >= bufW || pyp >= bufH) continue;
                const oo = pyp * bufW + pxp;
                if (proj.depth < depth[oo] + 2) {
                  colors[oo] = pack(255 * pulse, 214 * pulse, 102 * pulse);
                }
              }
            },
          });
        }
      }

      entries.sort((a, b) => b.d - a.d);
      R.labels = [];
      for (const e of entries) {
        e.draw();
        if (e.label) R.labels.push(e.label);
      }
    };

    const drawOverlayLayer = (now: number) => {
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

      // Upside Down atmosphere on the crisp layer: spores + vignette.
      if (R.lairMode) {
        ctx.save();
        ctx.fillStyle = "rgba(201,166,160,0.5)";
        for (let i = 0; i < 34; i++) {
          const seed = i * 137;
          const sx = ((seed * 7 + now * 0.012 * (1 + (i % 3) * 0.4)) % (cssW + 60)) - 30;
          const sy = ((seed * 13 - now * 0.02 * (1 + (i % 4) * 0.3)) % (cssH + 60) + cssH + 60) % (cssH + 60) - 30;
          const r = 1 + (i % 3);
          ctx.globalAlpha = 0.25 + ((i * 31) % 40) / 100;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const vg = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.3, cssW / 2, cssH / 2, cssH * 0.85);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(70,10,24,0.55)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.restore();
      }

      drawMinimap(cssW, cssH);
      drawCrosshair(cssW, cssH);
    };

    const drawMinimap = (cssW: number, cssH: number) => {
      const L = R.layout;
      if (!L || L.rooms.length === 0) return;
      const size = Math.min(230, Math.max(160, cssW * 0.15));
      const pad = 18;
      const x0 = pad;
      const y0 = cssH - size - pad;
      const scale = Math.min(size / L.world.w, size / L.world.h) * 0.92;
      const ox = x0 + (size - L.world.w * scale) / 2;
      const oy = y0 + (size - L.world.h * scale) / 2;
      R.minimap = { x0: ox, y0: oy, scale, panelX: x0, panelY: y0, panelSize: size };

      ctx.save();
      ctx.fillStyle = "rgba(18,17,15,0.7)";
      ctx.beginPath();
      ctx.roundRect(x0, y0, size, size, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(247,242,230,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.clip();

      for (const park of L.parks) {
        ctx.fillStyle = "rgba(122,158,96,0.45)";
        ctx.fillRect(ox + park.x * scale, oy + park.y * scale, park.w * scale, park.h * scale);
      }
      for (const room of L.rooms) {
        ctx.fillStyle = `${room.accent}58`;
        ctx.fillRect(ox + room.rect.x * scale, oy + room.rect.y * scale, room.rect.w * scale, room.rect.h * scale);
      }
      for (const b of L.buildings) {
        ctx.fillStyle = b.tint;
        ctx.fillRect(ox + b.rect.x * scale, oy + b.rect.y * scale, b.rect.w * scale, b.rect.h * scale);
      }
      for (const interior of L.interiors) {
        if (interior.theme === "lair" && !R.isAdmin) continue;
        ctx.fillStyle = interior.theme === "lair" ? "rgba(125,30,48,0.5)" : "rgba(154,165,184,0.4)";
        ctx.fillRect(ox + interior.rect.x * scale, oy + interior.rect.y * scale, interior.rect.w * scale, interior.rect.h * scale);
      }
      ctx.font = `600 ${Math.max(6.5, size * 0.036)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(247,242,230,0.85)";
      for (const room of L.rooms) {
        const short = SHORT_NAMES[room.zone] ?? room.name.slice(0, 6);
        ctx.fillText(short, ox + (room.rect.x + room.rect.w / 2) * scale, oy + (room.rect.y + room.rect.h / 2) * scale + 2);
      }
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(ox + L.plaza.board.x * scale, oy + L.plaza.board.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();

      for (const other of R.others) {
        ctx.fillStyle = other.character.suit;
        ctx.beginPath();
        ctx.arc(ox + other.rx * scale, oy + other.ry * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (R.target) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox + R.target.x * scale, oy + R.target.y * scale, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const pxp = ox + R.x * scale;
      const pyp = oy + R.y * scale;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(pxp, pyp);
      ctx.arc(pxp, pyp, 26, R.yaw - Math.PI / 6, R.yaw + Math.PI / 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f7f2e6";
      ctx.beginPath();
      ctx.arc(pxp, pyp, 3.5, 0, Math.PI * 2);
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
      ctx.beginPath();
      ctx.arc(cx, cy, hot ? 9 : 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(3.5, (now - last) / 16.67);
      last = now;
      if (!overlayRef.current) update(dt, now);
      if (R.grid && image) {
        const t0 = performance.now();
        drawWorld(now);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(off, 0, 0, canvasEl.clientWidth, canvasEl.clientHeight);
        drawOverlayLayer(now);
        tuneResolution(performance.now() - t0, now);
      }
      frames++;
      if (now - fpsAt > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
        setHud({ fps, room: R.layout ? placeName(R.layout, R.x, R.y) : "Campus" });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl]);

  R.isAdmin = isAdmin;

  // Minimap click-to-walk.
  const onCanvasAuxClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const mm = R.minimap;
      if (!mm || !canvasEl) return false;
      const rect = canvasEl.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (cx < mm.panelX || cy < mm.panelY || cx > mm.panelX + mm.panelSize || cy > mm.panelY + mm.panelSize) return false;
      const wx = (cx - mm.x0) / mm.scale;
      const wy = (cy - mm.y0) / mm.scale;
      const L = R.layout;
      if (!L || wx < 20 || wy < 20 || wx > L.world.w - 20 || wy > L.world.h - 20) return true;
      walkTo(wx, wy);
      return true;
    },
    [R, canvasEl, walkTo],
  );

  const goTo = useCallback(
    (x: number, y: number) => {
      walkTo(x, y);
      setOverlay(null);
    },
    [walkTo],
  );

  const timeslot = state.data?.timeslot;
  const meeting = state.data?.meeting;
  const nowEditing = state.data?.nowEditing;
  const levels = state.data?.levels;
  const lvl = levelInfo(state.data?.me?.points ?? currentUser.points);
  const loading = state.isLoading || layout.rooms.length === 0;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#12110f] text-[#f7f2e6] select-none">
      <canvas
        ref={setCanvasEl}
        onClickCapture={(e) => {
          if (onCanvasAuxClick(e)) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className={cn("absolute inset-0 h-full w-full", locked ? "cursor-none" : "cursor-crosshair")}
        aria-label="First-person view of the campus"
      />

      {loading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#12110f]">
          <Loader2 className="size-6 animate-spin opacity-70" />
          <p className="font-mono text-xs tracking-widest uppercase opacity-70">Entering the campus…</p>
        </div>
      ) : null}

      {/* ---- HUD ---- */}
      <div className="pointer-events-none absolute inset-0 z-10">
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
                    style={{ background: `${SKILL_META[key].color}30`, color: SKILL_META[key].color }}
                  >
                    {levels[key] ?? 0}
                  </span>
                ))
              : null}
          </div>
        </div>

        {meeting ? (
          <button
            onClick={() => setOverlay({ kind: "conference" })}
            className="pointer-events-auto absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#7d1e30] px-4 py-2 text-xs font-semibold shadow-lg transition-transform hover:scale-[1.02]"
          >
            <Bell className="size-3.5 animate-pulse" />
            Urgent meeting: {meeting.title}
            {meeting.meetingAt ? (
              <span className="opacity-75">
                · {new Date(meeting.meetingAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </button>
        ) : nowEditing ? (
          <div className="absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-xs backdrop-blur-sm">
            <Video className="size-3.5 text-[#e0a862]" />
            <span className="font-medium">Now editing:</span>
            <span className="opacity-80">
              {nowEditing.title}
              {nowEditing.clientName ? ` — ${nowEditing.clientName}` : ""}
            </span>
            {nowEditing.editorName ? <span className="opacity-55">by {nowEditing.editorName}</span> : null}
          </div>
        ) : null}

        {timeslot?.current || timeslot?.needsRelogin ? (
          <div className="absolute top-16 left-4 flex flex-col gap-1.5">
            {timeslot.current ? (
              <button
                onClick={() => setOverlay({ kind: "timetable" })}
                className="pointer-events-auto flex items-center gap-2 rounded-lg bg-black/45 px-2.5 py-1.5 text-[0.7rem] backdrop-blur-sm transition-colors hover:bg-black/65"
              >
                <AlarmClock className="size-3 opacity-70" />
                <span className="font-medium">{timeslot.current.label}</span>
                <span className="font-mono opacity-55">{slotRangeLabel(timeslot.current)}</span>
              </button>
            ) : null}
            {timeslot.needsRelogin ? (
              <button
                onClick={() => relogin.mutate()}
                className="pointer-events-auto flex items-center gap-2 rounded-lg bg-[#7a5c16] px-2.5 py-1.5 text-[0.7rem] font-semibold backdrop-blur-sm transition-colors hover:bg-[#8f6d1c]"
              >
                <UtensilsCrossed className="size-3" />
                Lunch is over — tap to log back in
              </button>
            ) : null}
          </div>
        ) : null}

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
            onClick={() => setOverlay({ kind: "settings" })}
            title="View settings (O)"
            className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <Settings2 className="size-4" />
          </button>
          <button
            onClick={() => setOverlay({ kind: "map" })}
            title="Campus map (M)"
            className="pointer-events-auto rounded-xl bg-black/45 p-2 backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <MapIcon className="size-4" />
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

        {prompt && !overlay ? (
          <div className="absolute inset-x-0 top-[58%] flex justify-center">
            <div className="flex items-center gap-2.5 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
              <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]">E</kbd>
              <span className="text-sm font-medium">{prompt.name}</span>
              <span className="text-xs opacity-60">{prompt.subtitle}</span>
            </div>
          </div>
        ) : null}

        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1.5 text-[0.65rem]">
          <div className="flex gap-1.5">
            {(
              [
                ["B", "Bounties", "bounties"],
                ["T", "Skills", "skills"],
                ["M", "Map", "map"],
                ["O", "View", "settings"],
                ["Tab", "Crew", "roster"],
                ["H", "Help", "help"],
              ] as const
            ).map(([key, label, kind]) => (
              <button
                key={key}
                onClick={() => setOverlay({ kind })}
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-black/65"
              >
                <kbd className="font-mono opacity-60">{key}</kbd>
                {label}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-1.5 rounded-lg bg-black/35 px-2.5 py-1.5 font-mono tracking-wide opacity-55 backdrop-blur-sm">
            <MousePointerClick className="size-3" />
            click floor to walk · drag to look · E doors & desks · L mouse-look
          </p>
        </div>
      </div>

      {/* ---- Overlays ---- */}
      {overlay ? (
        <GameOverlay
          title={overlayTitle(overlay)}
          wide={overlay.kind === "city" || overlay.kind === "creative" || overlay.kind === "map" || overlay.kind === "docs"}
          dark={overlay.kind === "lair"}
          onClose={() => setOverlay(null)}
        >
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
                utils.task.myWork.invalidate();
                utils.skill.tree.invalidate();
                utils.me.invalidate();
              }}
            />
          ) : null}
          {overlay.kind === "video" ? <VideoBayPanel /> : null}
          {overlay.kind === "city" ? (
            <DevCityPanel
              initialBuilding={overlay.refId === "tower-complete" ? "complete" : overlay.refId === "bungalow" ? "tools" : "pipeline"}
            />
          ) : null}
          {overlay.kind === "conference" ? <ConferencePanel /> : null}
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
          {overlay.kind === "lair" && isAdmin ? <LairPanel /> : null}
          {overlay.kind === "map" ? <CampusMap layout={layout} me={{ x: R.x, y: R.y }} isAdmin={isAdmin} onGo={goTo} /> : null}
          {overlay.kind === "settings" ? (
            <SettingsPanel
              value={settings}
              onChange={(next) => {
                setSettings(next);
                saveSettings(next);
              }}
            />
          ) : null}
          {overlay.kind === "help" ? <HelpPanel /> : null}
        </GameOverlay>
      ) : null}
    </div>
  );
}

const SHORT_NAMES: Record<string, string> = {
  developer: "DEV CITY",
  "video-editing": "VIDEO",
  conference: "CONF",
  creative: "CREATIVE",
  tasks: "TASKS",
  "managing-heads": "HEADS",
  timetable: "TIME",
  outreach: "OUTREACH",
  shoot: "SHOOT",
  client: "CLIENT",
};

function overlayTitle(overlay: NonNullable<Overlay>): string {
  switch (overlay.kind) {
    case "bounties":
      return "Bounty Board";
    case "skills":
      return "Skill Tree";
    case "roster":
      return "Crew";
    case "missions":
      return overlay.name ?? "Missions";
    case "video":
      return "Video Editing Bay";
    case "city":
      return overlay.name ?? "Developer City";
    case "conference":
      return "Conference Hall";
    case "tasks":
      return "Task Room";
    case "approvals":
      return "Managing Heads — Approvals";
    case "outreach":
      return "Outreach Room";
    case "creative":
      return "Creative Studio";
    case "shoot":
      return "Shoot Room";
    case "timetable":
      return "Timetable";
    case "docs":
      return "The Writing Desk";
    case "lair":
      return "The Upside Down — Vecna's Desk";
    case "map":
      return "Campus Map";
    case "settings":
      return "View Settings";
    case "help":
      return "How to play";
  }
}

function GameOverlay({
  title,
  wide,
  dark,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  dark?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1",
          wide ? "max-w-5xl" : "max-w-4xl",
          dark ? "ring-[#7d1e30]/60" : "ring-foreground/10",
        )}
      >
        <div className={cn("flex items-center justify-between border-b px-5 py-3.5", dark ? "border-[#7d1e30]/40" : "border-border")}>
          <h2 className={cn("font-heading text-sm font-semibold tracking-wide", dark && "text-[#c9414b]")}>{title}</h2>
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

function SettingsPanel({
  value,
  onChange,
}: {
  value: ViewSettings;
  onChange: (next: ViewSettings) => void;
}) {
  return (
    <div className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Field of view</span>
          <span className="font-mono text-xs text-muted-foreground">{value.fovDeg}°</span>
        </div>
        <input
          type="range"
          min={55}
          max={105}
          step={1}
          value={value.fovDeg}
          onChange={(e) => onChange({ ...value, fovDeg: Number(e.target.value) })}
          className="w-full accent-foreground"
        />
        <p className="text-xs text-muted-foreground">Wider sees more of the room; narrower zooms the view. 72° is the sweet spot.</p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Look sensitivity</span>
          <span className="font-mono text-xs text-muted-foreground">{value.sensitivity.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.3}
          max={2.5}
          step={0.05}
          value={value.sensitivity}
          onChange={(e) => onChange({ ...value, sensitivity: Number(e.target.value) })}
          className="w-full accent-foreground"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="font-medium">Head bob</p>
          <p className="text-xs text-muted-foreground">The slight sway while walking.</p>
        </div>
        <button
          onClick={() => onChange({ ...value, headBob: !value.headBob })}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            value.headBob ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          {value.headBob ? "On" : "Off"}
        </button>
      </div>
      <div className="space-y-1.5 text-sm">
        <p className="font-medium">Render quality</p>
        <div className="flex gap-1.5">
          {(["auto", "low", "high"] as const).map((q) => (
            <button
              key={q}
              onClick={() => onChange({ ...value, quality: q })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                value.quality === q ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Auto finds the sharpest resolution your machine holds at 60fps. Low pins it for weak
          hardware; High pins maximum sharpness.
        </p>
      </div>
    </div>
  );
}

function CampusMap({
  layout,
  me,
  isAdmin,
  onGo,
}: {
  layout: Layout;
  me: { x: number; y: number };
  isAdmin: boolean;
  onGo: (x: number, y: number) => void;
}) {
  const W = 920;
  const scale = Math.min(W / layout.world.w, 500 / layout.world.h);
  const H = Math.round(layout.world.h * scale);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Click anywhere to walk there. Towers and the bungalow are entered through their doors; the
        vault row at the bottom holds their interiors{isAdmin ? " — and the Upside Down" : ""}.
      </p>
      <div
        className="relative mx-auto overflow-hidden rounded-xl border border-border bg-muted/40"
        style={{ width: Math.round(layout.world.w * scale), height: H }}
      >
        {layout.parks.map((park, i) => (
          <div
            key={i}
            className="absolute rounded-sm bg-[#7a9e60]/40"
            style={{ left: park.x * scale, top: park.y * scale, width: park.w * scale, height: park.h * scale }}
          />
        ))}
        {layout.rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onGo(room.board.x, room.board.y + 40)}
            className="absolute flex flex-col items-center justify-center rounded-md text-[0.62rem] font-semibold transition-transform hover:z-10 hover:scale-[1.03]"
            style={{
              left: room.rect.x * scale,
              top: room.rect.y * scale,
              width: room.rect.w * scale,
              height: room.rect.h * scale,
              background: `${room.accent}33`,
              border: `1.5px solid ${room.accent}88`,
              color: "var(--color-foreground)",
            }}
          >
            {room.name}
            <span className="font-mono text-[0.5rem] font-normal opacity-60">
              {room.missionCount > 0 ? `${room.missionCount} missions` : ""}
            </span>
          </button>
        ))}
        {layout.buildings.map((b) => (
          <button
            key={b.key}
            onClick={() => onGo(b.door.x, b.door.y)}
            title={`Walk to ${b.label}`}
            className="absolute flex items-center justify-center rounded-sm text-[0.5rem] font-bold text-white/90 transition-transform hover:z-10 hover:scale-105"
            style={{ left: b.rect.x * scale, top: b.rect.y * scale, width: b.rect.w * scale, height: b.rect.h * scale, background: b.tint }}
          >
            {b.key === "tower-pipeline" ? "TOWER 1" : b.key === "tower-complete" ? "TOWER 2" : "TOOLS"}
          </button>
        ))}
        {isAdmin
          ? layout.portals
              .filter((p) => p.id === "enter-lair")
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => onGo(p.at.x, p.at.y + 36)}
                  title="Walk to the rift"
                  className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#c9414b] bg-[#3b1220] px-1.5 py-0.5 text-[0.5rem] font-bold text-[#ff8f85] transition-transform hover:scale-110"
                  style={{ left: p.at.x * scale, top: p.at.y * scale }}
                >
                  RIFT
                </button>
              ))
          : null}
        {layout.interiors.map((interior) => {
          if (interior.theme === "lair" && !isAdmin) return null;
          return (
            <div
              key={interior.key}
              className={cn(
                "absolute flex items-center justify-center rounded-sm text-[0.5rem] font-semibold",
                interior.theme === "lair" ? "bg-[#3b1220] text-[#c9414b]" : "bg-[#9aa5b8]/50 text-foreground/70",
              )}
              style={{
                left: interior.rect.x * scale,
                top: interior.rect.y * scale,
                width: interior.rect.w * scale,
                height: interior.rect.h * scale,
              }}
            >
              {interior.theme === "lair" ? "UPSIDE DOWN" : interior.label.split("—")[0]}
            </div>
          );
        })}
        <span
          className="absolute size-2 rounded-full bg-[#ffd166] ring-2 ring-black/40"
          style={{ left: layout.plaza.board.x * scale - 4, top: layout.plaza.board.y * scale - 4 }}
        />
        <span
          className="absolute size-2.5 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: me.x * scale - 5, top: me.y * scale - 5 }}
        />
      </div>
    </div>
  );
}

function HelpPanel() {
  const rows: [string, string][] = [
    ["Click floor", "Walk there — a marker shows the spot"],
    ["Drag", "Look around"],
    ["W A S D", "Walk and strafe · Shift sprints"],
    ["E / Click", "Interact: boards, desks, doors — doors walk you inside"],
    ["L", "Toggle immersive mouse-look"],
    ["B / T / M", "Bounties · Skill tree · Campus map"],
    ["O", "View settings — FOV, sensitivity, head bob, quality"],
    ["Tab", "Crew roster"],
    ["F", "Browser fullscreen"],
    ["Esc", "Close panel → release mouse → leave the floor"],
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The campus is a real place: walk into the towers through their doors, write scripts at the
        writing desks, and watch the park from the fountain plaza. Admins know what hides behind
        the rift in the managing heads&apos; office.
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
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Every teammate is a unique blocky crewmate — face, hair and suit are theirs alone, and the
        backpack tells you which way they&apos;re walking.
      </p>
    </div>
  );
}

let audioCtx: AudioContext | null = null;
function ringBell() {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    const t = audioCtx.currentTime;
    for (const [freq, at, dur] of [
      [1318.5, 0, 0.28],
      [1046.5, 0.18, 0.42],
    ] as const) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + at);
      osc.stop(t + at + dur + 0.05);
    }
  } catch {
    /* silent floors are fine */
  }
}

function useEngine() {
  const [bag] = useState(() => ({
    x: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
    spawned: false,
    keys: new Set<string>(),
    target: null as { x: number; y: number } | null,
    stuck: 0,
    /** Wall-follow side while click-to-walk routes around a blocker. */
    detour: 0 as 0 | 1 | -1,
    detourAge: 0,
    /** A* route for the current target; pathI is the waypoint being chased. */
    nav: null as NavGrid | null,
    path: [] as Vec[],
    pathI: 0,
    repath: 0,
    /** Watchdog: closest approach to the current waypoint + frames since. */
    wayBest: Infinity,
    wayAge: 0,
    walkPhase: 0,
    bobAmount: 0,
    moving: false,
    moved: false,
    lastSave: 0,
    layout: null as unknown as Layout,
    solids: [] as Solid[],
    moveSolids: [] as { x: number; y: number; w: number; h: number }[],
    grid: null as CastGrid | null,
    floorIndex: null as FloorIndex | null,
    floorPalette: [CORRIDOR] as [number, number, number][],
    interiorFloors: [] as [number, number, number][],
    props: [] as Prop[],
    others: [] as RemotePlayer[],
    interactables: [] as Interactable[],
    nearTarget: null as Interactable | null,
    cam: null as ReturnType<typeof makeCamera> | null,
    labels: [] as { x: number; y: number; d: number; player: RemotePlayer }[],
    npc: null as { x: number; y: number } | null,
    clockAt: null as { x: number; y: number } | null,
    rifts: [] as { x: number; y: number }[],
    queueCount: 0,
    queueHot: false,
    lairMode: false,
    isAdmin: false,
    settings: DEFAULT_SETTINGS as ViewSettings,
    minimap: null as { x0: number; y0: number; scale: number; panelX: number; panelY: number; panelSize: number } | null,
  }));
  return bag;
}
