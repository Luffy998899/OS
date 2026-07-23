"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, X, Gamepad2, Keyboard, Check, Play, Trophy } from "lucide-react";
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
  ROOMS,
  SPAWN,
  nearestBoard,
  roomKeyAt,
  resolveCollision,
  type RoomDef,
} from "@/lib/workspace-map";
import { levelInfo } from "@/lib/xp";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Palette = {
  bg: string;
  fg: string;
  muted: string;
  mutedFg: string;
  border: string;
  card: string;
  success: string;
  warning: string;
};

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    bg: v("--background", "#ffffff"),
    fg: v("--foreground", "#0b0b0c"),
    muted: v("--muted", "#f1f1f2"),
    mutedFg: v("--muted-foreground", "#71717a"),
    border: v("--border", "#e5e5e7"),
    card: v("--card", "#ffffff"),
    success: v("--success", "#3f9142"),
    warning: v("--warning", "#b4791f"),
  };
}

const STATUS_COLORS = (p: Palette): Record<string, string> => ({
  online: p.success,
  busy: p.warning,
  away: p.mutedFg,
});

const STATUSES = ["online", "busy", "away"] as const;

type Player = {
  userId: string;
  name: string;
  x: number;
  y: number;
  status: string;
  isMe: boolean;
};

export function WorkspaceGame() {
  const currentUser = useCurrentUser();
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, {
    refetchInterval: 4000,
  });

  const move = trpc.workspace.move.useMutation();
  const setStatus = trpc.workspace.setStatus.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });

  const [panelRoomKey, setPanelRoomKey] = useState<string | null>(null);
  const [nearRoomKey, setNearRoomKey] = useState<string | null>(null);
  const [points, setPoints] = useState(currentUser.points);
  const [myStatus, setMyStatus] = useState("online");

  // Mutable game state (kept out of React render to avoid per-frame updates).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const othersRef = useRef<Player[]>([]);
  const paletteRef = useRef<Palette | null>(null);
  const initializedRef = useRef(false);
  const lastSaveRef = useRef(0);
  const movedRef = useRef(false);
  const nearKeyRef = useRef<string | null>(null);
  const roomsRef = useRef<{ key: string; id: string; missionCount: number }[]>([]);

  // Sync server state into refs.
  useEffect(() => {
    if (!state.data) return;
    roomsRef.current = state.data.rooms.map((r) => ({
      key: r.key,
      id: r.id,
      missionCount: r.missionCount,
    }));
    const me = state.data.me;
    if (me) {
      setPoints(me.points);
      setMyStatus(me.status);
      if (!initializedRef.current) {
        meRef.current = { x: me.x || SPAWN.x, y: me.y || SPAWN.y };
        initializedRef.current = true;
      }
    } else if (!initializedRef.current) {
      initializedRef.current = true;
    }
    othersRef.current = state.data.players
      .filter((p) => !p.isMe)
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        x: p.x || SPAWN.x,
        y: p.y || SPAWN.y,
        status: p.status,
        isMe: false,
      }));
  }, [state.data]);

  // Palette + theme observer.
  useEffect(() => {
    paletteRef.current = readPalette();
    const obs = new MutationObserver(() => {
      paletteRef.current = readPalette();
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // Keyboard controls.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
      }
      if (k === "e") {
        const near = nearKeyRef.current;
        setPanelRoomKey((cur) => (cur === near ? null : near));
        return;
      }
      keysRef.current.add(k);
      targetRef.current = null; // keyboard overrides click-move
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Game loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = WORLD.w * dpr;
    canvas.height = WORLD.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

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
      const speed = 2.7 * dt;
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;

      const me = meRef.current;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        const next = resolveCollision(
          me.x,
          me.y,
          me.x + (dx / len) * speed,
          me.y + (dy / len) * speed,
        );
        if (next.x !== me.x || next.y !== me.y) movedRef.current = true;
        meRef.current = next;
      } else if (targetRef.current) {
        const t = targetRef.current;
        const ddx = t.x - me.x;
        const ddy = t.y - me.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist < 3) {
          targetRef.current = null;
        } else {
          const step = Math.min(speed, dist);
          const next = resolveCollision(
            me.x,
            me.y,
            me.x + (ddx / dist) * step,
            me.y + (ddy / dist) * step,
          );
          if (next.x === me.x && next.y === me.y) targetRef.current = null;
          else movedRef.current = true;
          meRef.current = next;
        }
      }

      // Nearest interactable board.
      const near = nearestBoard(me.x, me.y);
      const nk = near?.key ?? null;
      if (nk !== nearKeyRef.current) {
        nearKeyRef.current = nk;
        setNearRoomKey(nk);
      }

      // Throttled position save.
      if (movedRef.current && now - lastSaveRef.current > 1100) {
        lastSaveRef.current = now;
        movedRef.current = false;
        const key = roomKeyAt(me.x, me.y);
        const roomId = key
          ? (roomsRef.current.find((r) => r.key === key)?.id ?? null)
          : null;
        move.mutate({ x: Math.round(me.x), y: Math.round(me.y), roomId });
      }
    };

    const draw = (now: number) => {
      const p = paletteRef.current ?? readPalette();
      const statusColors = STATUS_COLORS(p);
      ctx.clearRect(0, 0, WORLD.w, WORLD.h);

      // Floor
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
      // Floor grid
      ctx.strokeStyle = p.border;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= WORLD.w; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, WORLD.h);
        ctx.stroke();
      }
      for (let gy = 0; gy <= WORLD.h; gy += 32) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(WORLD.w, gy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Outer walls
      ctx.fillStyle = p.fg;
      ctx.fillRect(0, 0, WORLD.w, 14);
      ctx.fillRect(0, WORLD.h - 14, WORLD.w, 14);
      ctx.fillRect(0, 0, 14, WORLD.h);
      ctx.fillRect(WORLD.w - 14, 0, 14, WORLD.h);

      const roomMeta = (key: string) =>
        roomsRef.current.find((r) => r.key === key);

      // Rooms
      for (const r of ROOMS) {
        // zone
        ctx.fillStyle = p.muted;
        ctx.globalAlpha = 0.55;
        roundRect(ctx, r.rect.x, r.rect.y, r.rect.w, r.rect.h, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.border;
        ctx.lineWidth = 1.5;
        roundRect(ctx, r.rect.x, r.rect.y, r.rect.w, r.rect.h, 10);
        ctx.stroke();

        // label tab
        const label = r.name.toUpperCase();
        ctx.font = "600 11px ui-sans-serif, system-ui";
        const tw = ctx.measureText(label).width;
        const count = roomMeta(r.key)?.missionCount ?? 0;
        const tabW = tw + 22 + (count > 0 ? 22 : 0);
        ctx.fillStyle = p.fg;
        roundRect(ctx, r.rect.x + 10, r.rect.y + 10, tabW, 20, 6);
        ctx.fill();
        ctx.fillStyle = p.bg;
        ctx.textBaseline = "middle";
        ctx.fillText(label, r.rect.x + 20, r.rect.y + 21);
        if (count > 0) {
          ctx.fillStyle = p.warning;
          ctx.beginPath();
          ctx.arc(r.rect.x + tabW - 2, r.rect.y + 20, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "700 10px ui-sans-serif, system-ui";
          ctx.textAlign = "center";
          ctx.fillText(String(count), r.rect.x + tabW - 2, r.rect.y + 21);
          ctx.textAlign = "left";
        }

        // desks
        for (const d of r.desks) drawDesk(ctx, d, p);

        // mission board / kiosk
        drawBoard(ctx, r, p, nearKeyRef.current === r.key, now);
      }

      // Players (others first)
      for (const o of othersRef.current) {
        drawAvatar(ctx, o.x, o.y, initials(o.name), o.name, false, statusColors[o.status] ?? p.mutedFg, o.status, p, now);
      }
      // Me on top
      const me = meRef.current;
      drawAvatar(ctx, me.x, me.y, initials(currentUser.name), "You", true, statusColors[myStatus] ?? p.success, myStatus, p, now);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStatus]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WORLD.w;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD.h;
    targetRef.current = { x, y };
    keysRef.current.clear();
  };

  const nearRoom = ROOMS.find((r) => r.key === nearRoomKey) ?? null;
  const lvl = levelInfo(points);

  return (
    <>
      <PageHeader
        eyebrow="Virtual office"
        title="Gamified Workspace"
        description="Walk the floor, visit a room's mission board, and complete the missions the owner assigned you to earn XP."
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
                myStatus === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="relative gap-0 overflow-hidden p-0">
            {/* HUD */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
              <div className="pointer-events-auto rounded-lg border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
                    {lvl.level}
                  </span>
                  <div>
                    <p className="text-xs font-semibold leading-none">
                      Level {lvl.level}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground transition-all"
                          style={{ width: `${lvl.progress * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[0.65rem] text-muted-foreground">
                        {lvl.into}/{lvl.span} XP
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
                <Trophy className="size-3.5 text-muted-foreground" />
                <span className="font-semibold tabular-nums">{points}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {state.data?.online ?? 0} online
                </span>
              </div>
            </div>

            {/* Interaction prompt */}
            {nearRoom ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center">
                <button
                  onClick={() =>
                    setPanelRoomKey((cur) =>
                      cur === nearRoom.key ? null : nearRoom.key,
                    )
                  }
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-lg"
                >
                  <Keyboard className="size-3.5" />
                  Press <kbd className="font-mono">E</kbd> — {nearRoom.name} missions
                </button>
              </div>
            ) : null}

            {/* Controls hint */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-card/80 px-2 py-1 text-[0.65rem] text-muted-foreground backdrop-blur">
              <Gamepad2 className="size-3" />
              WASD / arrows to move · click to walk · E to interact
            </div>

            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="block w-full cursor-pointer touch-none select-none"
              style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }}
              aria-label="Virtual office floor"
            />

            {/* Missions panel */}
            {panelRoomKey ? (
              <RoomMissionsPanel
                roomKey={panelRoomKey}
                roomId={
                  roomsRef.current.find((r) => r.key === panelRoomKey)?.id ?? ""
                }
                onClose={() => setPanelRoomKey(null)}
                onCompleted={(gained) => {
                  utils.workspace.state.invalidate();
                  utils.task.myWork.invalidate();
                  utils.dashboard.overview.invalidate();
                  utils.me.invalidate();
                  setPoints((p) => p + gained);
                  toast.success(`Mission complete — +${gained} XP!`);
                }}
              />
            ) : null}
          </Card>
        </div>

        {/* AI floor manager */}
        <div className="space-y-6">
          <Card className="gap-2">
            <div className="flex items-center gap-2 px-4">
              <Sparkles className="size-4" />
              <h2 className="font-heading text-sm font-semibold">
                AI floor manager
              </h2>
            </div>
            {state.data?.ai ? (
              <div className="space-y-3 px-4">
                <p className="text-sm text-muted-foreground">
                  {state.data.ai.summary}
                </p>
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
              <p className="px-4 text-sm text-muted-foreground">
                No check-in yet today.
              </p>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold">Rooms</h2>
            </div>
            <ul className="divide-y divide-border">
              {(state.data?.rooms ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span>{r.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {
                      (state.data?.players ?? []).filter(
                        (p) => p.roomId === r.id,
                      ).length
                    }{" "}
                    here
                    {r.missionCount > 0 ? (
                      <Badge variant="secondary">{r.missionCount}</Badge>
                    ) : null}
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

function RoomMissionsPanel({
  roomKey,
  roomId,
  onClose,
  onCompleted,
}: {
  roomKey: string;
  roomId: string;
  onClose: () => void;
  onCompleted: (gained: number) => void;
}) {
  const currentUser = useCurrentUser();
  const room = ROOMS.find((r) => r.key === roomKey);
  const missions = trpc.workspace.roomMissions.useQuery(
    { roomId },
    { enabled: !!roomId },
  );
  const utils = trpc.useUtils();
  const update = trpc.task.updateStatus.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const act = (
    id: string,
    status: "in_progress" | "done",
    points: number,
  ) => {
    update.mutate(
      { id, status },
      {
        onSuccess: () => {
          utils.workspace.roomMissions.invalidate({ roomId });
          if (status === "done") onCompleted(points);
        },
      },
    );
  };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="font-heading text-sm font-semibold">{room?.name}</p>
          <p className="text-xs text-muted-foreground">
            Missions assigned by the owner
          </p>
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
          <p className="py-10 text-center text-sm text-muted-foreground">
            No missions in this room yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {missions.data?.map((m) => {
              const mine = m.assignee?.id === currentUser.id;
              const done = m.status === "done";
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{m.title}</p>
                    <TaskStatusBadge status={m.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {m.assignee ? m.assignee.name : "Unassigned"} · {m.points}{" "}
                      XP
                    </span>
                    {mine && !done ? (
                      <div className="flex gap-1.5">
                        {m.status !== "in_progress" ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={update.isPending}
                            onClick={() =>
                              act(m.id, "in_progress", m.points)
                            }
                          >
                            <Play className="size-3" />
                            Start
                          </Button>
                        ) : null}
                        <Button
                          size="xs"
                          disabled={update.isPending}
                          onClick={() => act(m.id, "done", m.points)}
                        >
                          <Check className="size-3" />
                          Complete
                        </Button>
                      </div>
                    ) : mine && done ? (
                      <span className="text-xs font-medium text-success">
                        Completed
                      </span>
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

// ---- canvas drawing helpers -------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  d: { x: number; y: number; w: number; h: number },
  p: Palette,
) {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  roundRect(ctx, d.x + 2, d.y + 3, d.w, d.h, 6);
  ctx.fill();
  // body
  ctx.fillStyle = p.card;
  ctx.strokeStyle = p.mutedFg;
  ctx.lineWidth = 1.5;
  roundRect(ctx, d.x, d.y, d.w, d.h, 6);
  ctx.fill();
  ctx.stroke();
  // monitor
  ctx.fillStyle = p.fg;
  roundRect(ctx, d.x + d.w / 2 - 14, d.y + 6, 28, 16, 3);
  ctx.fill();
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  r: RoomDef,
  p: Palette,
  near: boolean,
  now: number,
) {
  const bx = r.board.x;
  const by = r.board.y + 22;
  if (near) {
    const pulse = 10 + Math.sin(now / 200) * 3;
    ctx.strokeStyle = p.warning;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 20 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // stand
  ctx.fillStyle = p.fg;
  roundRect(ctx, bx - 16, by - 14, 32, 26, 5);
  ctx.fill();
  // "screen" lines (clipboard)
  ctx.strokeStyle = p.bg;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(bx - 9, by - 7 + i * 6);
    ctx.lineTo(bx + 9, by - 7 + i * 6);
    ctx.stroke();
  }
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  init: string,
  name: string,
  isMe: boolean,
  statusColor: string,
  status: string,
  p: Palette,
  now: number,
) {
  const bob = Math.sin(now / 260 + x) * 1.2;
  const cy = y + bob;
  const R = 13;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + R - 1, R * 0.85, R * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isMe) {
    ctx.strokeStyle = p.fg;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, cy, R + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // token
  ctx.beginPath();
  ctx.arc(x, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = isMe ? p.fg : p.card;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isMe ? p.fg : p.mutedFg;
  ctx.stroke();

  // initials
  ctx.fillStyle = isMe ? p.bg : p.fg;
  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(init, x, cy + 0.5);

  // status dot
  ctx.beginPath();
  ctx.arc(x + R - 2, cy + R - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.card;
  ctx.stroke();

  // busy emote bubble
  if (status === "busy") {
    ctx.fillStyle = p.card;
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 8, cy - R - 14, 18, 12, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.warning;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + 12 + i * 5, cy - R - 8, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // nameplate
  ctx.font = "600 10px ui-sans-serif, system-ui";
  const nw = ctx.measureText(name).width + 12;
  ctx.fillStyle = isMe ? p.fg : p.card;
  ctx.globalAlpha = isMe ? 1 : 0.92;
  roundRect(ctx, x - nw / 2, cy - R - 16, nw, 14, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (!isMe) {
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x - nw / 2, cy - R - 16, nw, 14, 7);
    ctx.stroke();
  }
  ctx.fillStyle = isMe ? p.bg : p.fg;
  ctx.fillText(name, x, cy - R - 9);
  ctx.textAlign = "left";
}
