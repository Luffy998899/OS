"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X, Gamepad2, Keyboard, Check, Play, Trophy, Timer } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import {
  WORLD,
  TILE,
  ROOMS,
  ROOM_WALLS,
  OUTER_WALLS,
  SPAWN,
  nearestBoard,
  roomKeyAt,
  resolveCollision,
  userHue,
  type RoomDef,
  type Rect,
} from "@/lib/workspace-map";
import { levelInfo } from "@/lib/xp";
import { initials, relativeTime } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

// Fixed "game world" palette (independent of app light/dark theme).
const GAME = {
  floorA: "#ece5d6",
  floorB: "#e4ddcb",
  roomFloor: "#f3eee2",
  wallSide: "#a7a08b",
  wallTop: "#d3ccb8",
  wallLine: "#83795f",
  deskTop: "#b98a5f",
  deskSide: "#8c6240",
  monitor: "#2e2d31",
  screen: "#8fd3e6",
  chair: "#43424a",
  potColor: "#9e6c43",
  leaf: "#57a466",
  skin: "#f1c49b",
  hair: "#3b2f27",
  ink: "#26241f",
  paper: "#fbf8f0",
  shadow: "rgba(0,0,0,0.14)",
  online: "#4fae5a",
  busy: "#e0a13a",
  away: "#9a9384",
} as const;

const STATUS_COLOR: Record<string, string> = {
  online: GAME.online,
  busy: GAME.busy,
  away: GAME.away,
};
const STATUSES = ["online", "busy", "away"] as const;
type Facing = "down" | "up" | "left" | "right";

export function WorkspaceGame() {
  const currentUser = useCurrentUser();
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 4000 });
  const move = trpc.workspace.move.useMutation();
  const setStatus = trpc.workspace.setStatus.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });

  const [panelRoomKey, setPanelRoomKey] = useState<string | null>(null);
  const [nearRoomKey, setNearRoomKey] = useState<string | null>(null);
  const [points, setPoints] = useState(currentUser.points);
  const [myStatus, setMyStatus] = useState("online");

  // Mutable game state.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const R = useStateRef();

  // Sync server data into refs.
  useEffect(() => {
    if (!state.data) return;
    R.rooms = state.data.rooms.map((r) => ({ key: r.key, id: r.id, missionCount: r.missionCount }));
    const me = state.data.me;
    if (me) {
      setPoints(me.points);
      setMyStatus(me.status);
      if (!R.initialized) {
        R.me = { x: me.x || SPAWN.x, y: me.y || SPAWN.y };
        R.initialized = true;
      }
    } else if (!R.initialized) {
      R.initialized = true;
    }
    R.others = state.data.players
      .filter((p) => !p.isMe)
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        x: p.x || SPAWN.x,
        y: p.y || SPAWN.y,
        status: p.status,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "e") {
        setPanelRoomKey((cur) => (cur === R.nearKey ? null : R.nearKey));
        return;
      }
      R.keys.add(k);
      R.target = null;
    };
    const up = (e: KeyboardEvent) => R.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game loop.
  useEffect(() => {
    const canvas = canvasEl;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WORLD.w * dpr;
    canvas.height = WORLD.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      update(dt, now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const update = (dt: number, now: number) => {
      const speed = 2.6 * dt;
      const keys = R.keys;
      let dx = 0;
      let dy = 0;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;

      let moving = false;
      const me = R.me;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        const nx = me.x + (dx / len) * speed;
        const ny = me.y + (dy / len) * speed;
        const next = resolveCollision(me.x, me.y, nx, ny);
        if (Math.abs(dx) > Math.abs(dy)) R.facing = dx > 0 ? "right" : "left";
        else R.facing = dy > 0 ? "down" : "up";
        if (next.x !== me.x || next.y !== me.y) {
          R.moved = true;
          moving = true;
        }
        R.me = next;
      } else if (R.target) {
        const t = R.target;
        const ddx = t.x - me.x;
        const ddy = t.y - me.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist < 3) R.target = null;
        else {
          const step = Math.min(speed, dist);
          const next = resolveCollision(me.x, me.y, me.x + (ddx / dist) * step, me.y + (ddy / dist) * step);
          if (Math.abs(ddx) > Math.abs(ddy)) R.facing = ddx > 0 ? "right" : "left";
          else R.facing = ddy > 0 ? "down" : "up";
          if (next.x === me.x && next.y === me.y) R.target = null;
          else {
            R.moved = true;
            moving = true;
          }
          R.me = next;
        }
      }
      R.moving = moving;

      const near = nearestBoard(me.x, me.y);
      const nk = near?.key ?? null;
      if (nk !== R.nearKey) {
        R.nearKey = nk;
        setNearRoomKey(nk);
      }

      if (R.moved && now - R.lastSave > 1000) {
        R.lastSave = now;
        R.moved = false;
        const key = roomKeyAt(me.x, me.y);
        const roomId = key ? (R.rooms.find((r) => r.key === key)?.id ?? null) : null;
        move.mutate({ x: Math.round(me.x), y: Math.round(me.y), roomId });
      }
    };

    const draw = (now: number) => {
      // Floor tiles (checker)
      for (let gy = 0; gy < WORLD.h; gy += TILE) {
        for (let gx = 0; gx < WORLD.w; gx += TILE) {
          ctx.fillStyle = ((gx / TILE + gy / TILE) % 2 === 0) ? GAME.floorA : GAME.floorB;
          ctx.fillRect(gx, gy, TILE, TILE);
        }
      }

      // Room floors + rugs + labels
      const roomMeta = (key: string) => R.rooms.find((r) => r.key === key);
      for (const r of ROOMS) {
        ctx.fillStyle = GAME.roomFloor;
        ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
        // accent rug
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = r.accent;
        roundRect(ctx, r.rect.x + 20, r.rect.y + r.rect.h - 74, r.rect.w - 40, 56, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
        for (const d of r.decor) drawDecor(ctx, d);
        for (const d of r.desks) drawDesk(ctx, d);
        drawBoard(ctx, r, R.nearKey === r.key, now);
      }

      // Walls (2.5D)
      for (const w of OUTER_WALLS) drawWall(ctx, w);
      for (const w of ROOM_WALLS) drawWall(ctx, w);

      // Room labels (on top of walls)
      for (const r of ROOMS) {
        const count = roomMeta(r.key)?.missionCount ?? 0;
        drawSign(ctx, r, count);
      }

      // Characters (others first, sorted by y for depth)
      const drawList = [
        ...R.others.map((o) => ({ ...o, isMe: false, facing: "down" as Facing, moving: false })),
        { userId: currentUser.id, name: currentUser.name, x: R.me.x, y: R.me.y, status: myStatus, isMe: true, facing: R.facing, moving: R.moving },
      ].sort((a, b) => a.y - b.y);
      for (const c of drawList) {
        drawCharacter(ctx, c.x, c.y, c.name, c.isMe, userHue(c.userId), c.status, c.facing, c.moving, now);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl, myStatus]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasEl;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    R.target = {
      x: ((e.clientX - rect.left) / rect.width) * WORLD.w,
      y: ((e.clientY - rect.top) / rect.height) * WORLD.h,
    };
    R.keys.clear();
  };

  const nearRoom = ROOMS.find((r) => r.key === nearRoomKey) ?? null;
  const lvl = levelInfo(points);

  return (
    <>
      <PageHeader
        eyebrow="Virtual office"
        title="Gamified Workspace"
        description="Walk the floor as your character, visit a room's mission board, and complete the missions the owner assigned you to earn XP."
      >
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setMyStatus(s);
                setStatus.mutate({ status: s });
              }}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                myStatus === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="gap-0 overflow-hidden p-0">
            {/* Top bar — level / XP and points (no longer overlaps the map) */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
                  {lvl.level}
                </span>
                <div>
                  <p className="text-xs font-semibold leading-none">Level {lvl.level}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${lvl.progress * 100}%` }} />
                    </div>
                    <span className="font-mono text-[0.65rem] text-muted-foreground">{lvl.into}/{lvl.span} XP</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Trophy className="size-3.5 text-muted-foreground" />
                <span className="font-semibold tabular-nums">{points}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{state.data?.online ?? 0} online</span>
              </div>
            </div>

            {/* Map area (overlays are scoped to this box only) */}
            <div className="relative">
              {nearRoom ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center">
                  <button
                    onClick={() => setPanelRoomKey((cur) => (cur === nearRoom.key ? null : nearRoom.key))}
                    className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-lg"
                  >
                    <Keyboard className="size-3.5" />
                    Press <kbd className="font-mono">E</kbd> — {nearRoom.name} missions
                  </button>
                </div>
              ) : null}

              <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5 rounded-md bg-card/80 px-2 py-1 text-[0.65rem] text-muted-foreground backdrop-blur">
                <Gamepad2 className="size-3" />
                WASD / arrows · click to walk · E to interact
              </div>

              <canvas
                ref={setCanvasEl}
                onClick={onCanvasClick}
                className="block w-full cursor-pointer touch-none select-none"
                style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}`, imageRendering: "pixelated" }}
                aria-label="Virtual office floor"
              />

              {panelRoomKey ? (
                <RoomMissionsPanel
                  roomKey={panelRoomKey}
                  roomId={R.rooms.find((r) => r.key === panelRoomKey)?.id ?? ""}
                  onClose={() => setPanelRoomKey(null)}
                  onChanged={() => {
                    utils.workspace.state.invalidate();
                    utils.task.myWork.invalidate();
                    utils.dashboard.overview.invalidate();
                    utils.me.invalidate();
                  }}
                />
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="gap-2">
            <div className="flex items-center gap-2 px-4">
              <Sparkles className="size-4" />
              <h2 className="font-heading text-sm font-semibold">AI floor manager</h2>
            </div>
            {state.data?.ai ? (
              <div className="space-y-3 px-4">
                <p className="text-sm text-muted-foreground">{state.data.ai.summary}</p>
                {state.data.ai.importantTasks.length > 0 ? (
                  <ul className="space-y-1">
                    {state.data.ai.importantTasks.map((t) => (
                      <li key={t} className="flex items-start gap-1.5 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="px-4 text-sm text-muted-foreground">No check-in yet today.</p>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold">Rooms</h2>
            </div>
            <ul className="divide-y divide-border">
              {(state.data?.rooms ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {(state.data?.players ?? []).filter((p) => p.roomId === r.id).length} here
                    {r.missionCount > 0 ? <Badge variant="secondary">{r.missionCount}</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// A single mutable "refs bag" so the render loop reads/writes without re-renders.
function useStateRef() {
  const [bag] = useState(() => ({
    me: { x: SPAWN.x, y: SPAWN.y },
    target: null as { x: number; y: number } | null,
    keys: new Set<string>(),
    others: [] as { userId: string; name: string; x: number; y: number; status: string }[],
    rooms: [] as { key: string; id: string; missionCount: number }[],
    facing: "down" as Facing,
    moving: false,
    moved: false,
    lastSave: 0,
    nearKey: null as string | null,
    initialized: false,
  }));
  return bag;
}

function RoomMissionsPanel({
  roomKey,
  roomId,
  onClose,
  onChanged,
}: {
  roomKey: string;
  roomId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const room = ROOMS.find((r) => r.key === roomKey);
  const missions = trpc.workspace.roomMissions.useQuery({ roomId }, { enabled: !!roomId });
  const utils = trpc.useUtils();

  const update = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.workspace.roomMissions.invalidate({ roomId });
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const act = (
    id: string,
    status: "todo" | "in_progress" | "review" | "done",
    msg: string,
  ) => update.mutate({ id, status }, { onSuccess: () => toast.success(msg) });

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="font-heading text-sm font-semibold">{room?.name}</p>
          <p className="text-xs text-muted-foreground">Missions & XP set by the owner</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {missions.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (missions.data?.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No missions in this room yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {missions.data?.map((m) => {
              const mine = m.assignee?.id === currentUser.id;
              const overdue = m.dueAt && new Date(m.dueAt) < new Date() && m.status !== "done";
              return (
                <li key={m.id} className="rounded-lg border border-border p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{m.title}</p>
                    <TaskStatusBadge status={m.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{m.assignee ? m.assignee.name : "Unassigned"}</span>
                    <span>· {m.points} XP</span>
                    {m.priority === "urgent" || m.priority === "high" ? (
                      <span className={cn("rounded px-1.5 py-0.5 font-medium", m.priority === "urgent" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>
                        {m.priority}
                      </span>
                    ) : null}
                    {m.status === "in_progress" && m.dueAt ? (
                      <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
                        <Timer className="size-3" />
                        {overdue ? "overdue " : "due "}
                        {relativeTime(m.dueAt)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                    {mine && m.status === "todo" ? (
                      <Button size="xs" disabled={update.isPending} onClick={() => act(m.id, "in_progress", "Started — timer running.")}>
                        <Play className="size-3" />
                        Start
                      </Button>
                    ) : null}
                    {mine && m.status === "in_progress" ? (
                      <Button size="xs" disabled={update.isPending} onClick={() => act(m.id, "review", "Published for review.")}>
                        <Check className="size-3" />
                        Publish for review
                      </Button>
                    ) : null}
                    {mine && m.status === "review" ? (
                      <span className="text-xs font-medium text-warning">Awaiting review</span>
                    ) : null}
                    {mine && m.status === "done" ? (
                      <span className="text-xs font-medium text-success">Completed</span>
                    ) : null}

                    {canManage && m.status === "review" ? (
                      <>
                        <Button size="xs" variant="outline" disabled={update.isPending} onClick={() => act(m.id, "in_progress", "Sent back.")}>
                          Send back
                        </Button>
                        <Button size="xs" disabled={update.isPending} onClick={() => act(m.id, "done", "Approved — XP awarded.")}>
                          <Check className="size-3" />
                          Approve
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---- canvas drawing --------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawWall(ctx: CanvasRenderingContext2D, w: Rect) {
  ctx.fillStyle = GAME.wallSide;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  // top highlight (pseudo-3D)
  ctx.fillStyle = GAME.wallTop;
  ctx.fillRect(w.x, w.y, w.w, Math.min(4, w.h));
  ctx.strokeStyle = GAME.wallLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
}

function drawDesk(ctx: CanvasRenderingContext2D, d: Rect) {
  ctx.fillStyle = GAME.shadow;
  ctx.fillRect(d.x + 2, d.y + 4, d.w, d.h);
  ctx.fillStyle = GAME.deskSide;
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.fillStyle = GAME.deskTop;
  ctx.fillRect(d.x, d.y, d.w, d.h - 5);
  // monitor
  ctx.fillStyle = GAME.monitor;
  ctx.fillRect(d.x + d.w / 2 - 11, d.y + 5, 22, 13);
  ctx.fillStyle = GAME.screen;
  ctx.fillRect(d.x + d.w / 2 - 9, d.y + 7, 18, 9);
  // chair
  ctx.fillStyle = GAME.chair;
  roundRect(ctx, d.x + d.w / 2 - 7, d.y + d.h + 4, 14, 9, 3);
  ctx.fill();
}

function drawDecor(ctx: CanvasRenderingContext2D, d: { kind: string; x: number; y: number }) {
  if (d.kind === "plant") {
    ctx.fillStyle = GAME.potColor;
    ctx.fillRect(d.x - 6, d.y + 6, 12, 10);
    ctx.fillStyle = GAME.leaf;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a9459";
    ctx.beginPath();
    ctx.arc(d.x - 4, d.y + 2, 5, 0, Math.PI * 2);
    ctx.arc(d.x + 4, d.y + 2, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === "cooler") {
    ctx.fillStyle = "#dfe7ee";
    roundRect(ctx, d.x - 8, d.y - 4, 16, 26, 3);
    ctx.fill();
    ctx.fillStyle = "#8fc7e6";
    roundRect(ctx, d.x - 6, d.y - 8, 12, 10, 3);
    ctx.fill();
  } else if (d.kind === "shelf") {
    ctx.fillStyle = GAME.deskSide;
    ctx.fillRect(d.x - 14, d.y - 8, 28, 26);
    ctx.fillStyle = "#c76b5a";
    ctx.fillRect(d.x - 12, d.y - 6, 6, 10);
    ctx.fillStyle = "#5a86c7";
    ctx.fillRect(d.x - 4, d.y - 6, 6, 10);
    ctx.fillStyle = "#c7a15a";
    ctx.fillRect(d.x + 4, d.y - 6, 6, 10);
  } else if (d.kind === "board") {
    ctx.fillStyle = "#f7f5ee";
    ctx.fillRect(d.x - 16, d.y - 10, 32, 22);
    ctx.strokeStyle = GAME.wallLine;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(d.x - 16, d.y - 10, 32, 22);
    ctx.fillStyle = "#c76b5a";
    ctx.fillRect(d.x - 12, d.y - 6, 10, 3);
    ctx.fillStyle = "#5a86c7";
    ctx.fillRect(d.x - 12, d.y, 16, 3);
    ctx.fillStyle = "#5aa768";
    ctx.fillRect(d.x - 12, d.y + 6, 8, 3);
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, r: RoomDef, near: boolean, now: number) {
  const bx = r.board.x;
  const by = r.board.y + 20;
  if (near) {
    const pulse = 8 + Math.sin(now / 200) * 3;
    ctx.strokeStyle = GAME.busy;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 18 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // legs
  ctx.fillStyle = GAME.wallLine;
  ctx.fillRect(bx - 12, by + 6, 3, 10);
  ctx.fillRect(bx + 9, by + 6, 3, 10);
  // board panel
  ctx.fillStyle = GAME.ink;
  roundRect(ctx, bx - 16, by - 16, 32, 26, 4);
  ctx.fill();
  ctx.strokeStyle = GAME.paper;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(bx - 9, by - 9 + i * 6);
    ctx.lineTo(bx + 9, by - 9 + i * 6);
    ctx.stroke();
  }
}

function drawSign(ctx: CanvasRenderingContext2D, r: RoomDef, count: number) {
  const label = r.name.toUpperCase();
  ctx.font = "600 10px ui-sans-serif, system-ui";
  const tw = ctx.measureText(label).width;
  const w = tw + 20 + (count > 0 ? 20 : 0);
  const x = r.rect.x + 8;
  const y = r.rect.y + 6;
  ctx.fillStyle = GAME.ink;
  roundRect(ctx, x, y, w, 18, 5);
  ctx.fill();
  ctx.fillStyle = GAME.paper;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 8, y + 10);
  if (count > 0) {
    ctx.fillStyle = GAME.busy;
    ctx.beginPath();
    ctx.arc(x + w - 10, y + 9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a10";
    ctx.font = "700 9px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(count), x + w - 10, y + 10);
  }
  ctx.textAlign = "left";
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  isMe: boolean,
  hue: number,
  status: string,
  facing: Facing,
  moving: boolean,
  now: number,
) {
  const bob = moving ? Math.abs(Math.sin(now / 90)) * 2 : Math.sin(now / 500 + x) * 0.6;
  const cy = y - bob;
  const shirt = `hsl(${hue} 48% 52%)`;
  const shirtDark = `hsl(${hue} 45% 42%)`;

  // shadow
  ctx.fillStyle = GAME.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isMe) {
    ctx.strokeStyle = "#1c1a16";
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 12, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // legs
  const legShift = moving ? Math.sin(now / 90) * 1.5 : 0;
  ctx.fillStyle = "#3a3630";
  ctx.fillRect(x - 4, cy + 2 + legShift, 3, 6);
  ctx.fillRect(x + 1, cy + 2 - legShift, 3, 6);

  // arms
  ctx.fillStyle = shirtDark;
  ctx.fillRect(x - 9, cy - 8, 3, 9);
  ctx.fillRect(x + 6, cy - 8, 3, 9);

  // body
  ctx.fillStyle = shirt;
  roundRect(ctx, x - 7, cy - 9, 14, 13, 4);
  ctx.fill();

  // head
  ctx.fillStyle = GAME.skin;
  ctx.beginPath();
  ctx.arc(x, cy - 15, 6, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = GAME.hair;
  ctx.beginPath();
  ctx.arc(x, cy - 16, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 6, cy - 17, 12, 3);

  // eyes (by facing)
  if (facing !== "up") {
    ctx.fillStyle = GAME.ink;
    const ex = facing === "left" ? -1.5 : facing === "right" ? 1.5 : 0;
    ctx.fillRect(x - 3 + ex, cy - 15, 1.6, 1.8);
    ctx.fillRect(x + 1.4 + ex, cy - 15, 1.6, 1.8);
  }

  // status dot
  ctx.beginPath();
  ctx.arc(x + 7, cy - 18, 3, 0, Math.PI * 2);
  ctx.fillStyle = STATUS_COLOR[status] ?? GAME.away;
  ctx.fill();
  ctx.strokeStyle = GAME.paper;
  ctx.lineWidth = 1;
  ctx.stroke();

  // busy emote
  if (status === "busy") {
    ctx.fillStyle = GAME.paper;
    ctx.strokeStyle = GAME.wallLine;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 8, cy - 30, 18, 12, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GAME.busy;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + 12 + i * 5, cy - 24, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // nameplate
  ctx.font = "600 10px ui-sans-serif, system-ui";
  const nm = isMe ? "You" : name.split(" ")[0];
  const nw = ctx.measureText(nm).width + 12;
  ctx.fillStyle = isMe ? GAME.ink : GAME.paper;
  ctx.globalAlpha = isMe ? 1 : 0.94;
  roundRect(ctx, x - nw / 2, cy - 34, nw, 14, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!isMe) {
    ctx.strokeStyle = GAME.wallLine;
    ctx.lineWidth = 1;
    roundRect(ctx, x - nw / 2, cy - 34, nw, 14, 7);
    ctx.stroke();
  }
  ctx.fillStyle = isMe ? GAME.paper : GAME.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(nm, x, cy - 27);
  ctx.textAlign = "left";
}
