"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  X,
  Gamepad2,
  Keyboard,
  Check,
  Play,
  Trophy,
  Timer,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/app/form-select";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import {
  buildLayout,
  nearestBoard,
  roomIdAt,
  resolveCollision,
  userHue,
  type Layout,
  type RoomGeom,
  type Vec,
} from "@/lib/workspace-map";
import { levelInfo } from "@/lib/xp";
import { initials, relativeTime } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const VIEW = { w: 1024, h: 620 };
// Isometric projection (2:1), pre-scaled.
const A = 0.42;
const B = 0.21;
const WALL_H = 34;
const DESK_H = 20;
const BOARD_H = 30;
const CHAR_H = 40;

const GAME = {
  ground: "#d9d2c2",
  groundLine: "#cabfa8",
  roomFloor: "#efe9db",
  wallTop: "#e2dbc7",
  wallL: "#b7ad95",
  wallR: "#9b917a",
  deskTop: "#c08a5b",
  deskL: "#9c6a41",
  deskR: "#84582f",
  monitor: "#2f2d31",
  screen: "#8fd3e6",
  skin: "#f1c49b",
  hair: "#3b2f27",
  ink: "#26241f",
  paper: "#fbf8f0",
  online: "#4fae5a",
  busy: "#e0a13a",
  away: "#9a9384",
};
const STATUS_COLOR: Record<string, string> = {
  online: GAME.online,
  busy: GAME.busy,
  away: GAME.away,
};
const STATUSES = ["online", "busy", "away"] as const;
type Facing = "down" | "up" | "left" | "right";

export function WorkspaceGame() {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.CLIENTS_MANAGE);
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 4000 });
  const move = trpc.workspace.move.useMutation();
  const setStatus = trpc.workspace.setStatus.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });

  const [panelRoom, setPanelRoom] = useState<{ id: string; name: string } | null>(null);
  const [nearRoom, setNearRoom] = useState<{ id: string; name: string } | null>(null);
  const [points, setPoints] = useState(currentUser.points);
  const [myStatus, setMyStatus] = useState("online");
  const [addOpen, setAddOpen] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  const layout: Layout = useMemo(
    () =>
      buildLayout(
        (state.data?.rooms ?? []).map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          kind: r.kind,
          clientName: r.clientName,
          posX: r.posX,
          posY: r.posY,
          missionCount: r.missionCount,
        })),
      ),
    [state.data?.rooms],
  );

  const R = useGameRefs();
  R.layout = layout;

  // Sync server -> refs
  useEffect(() => {
    if (!state.data) return;
    const me = state.data.me;
    if (me) {
      setPoints(me.points);
      setMyStatus(me.status);
      if (!R.initialized) {
        R.me = { x: me.x || layout.spawn.x, y: me.y || layout.spawn.y };
        R.initialized = true;
      }
    } else if (!R.initialized) {
      R.me = { ...layout.spawn };
      R.initialized = true;
    }
    R.others = state.data.players
      .filter((p) => !p.isMe)
      .map((p) => ({ userId: p.userId, name: p.name, x: p.x || layout.spawn.x, y: p.y || layout.spawn.y, status: p.status }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "e") {
        setPanelRoom((cur) => (cur && cur.id === R.nearId ? null : R.nearRoomForPanel));
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

  // Game loop
  useEffect(() => {
    if (!canvasEl) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvasEl.width = VIEW.w * dpr;
    canvasEl.height = VIEW.h * dpr;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let last = performance.now();
    const cam = { x: 0, y: 0 };
    const iso = (wx: number, wy: number) => ({ x: (wx - wy) * A, y: (wx + wy) * B });
    const proj = (wx: number, wy: number) => ({ x: (wx - wy) * A + cam.x, y: (wx + wy) * B + cam.y });

    const quad = (pts: Vec[], fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const isoBox = (
      rect: { x: number; y: number; w: number; h: number },
      h: number,
      top: string,
      left: string,
      right: string,
    ) => {
      const a = proj(rect.x, rect.y);
      const b = proj(rect.x + rect.w, rect.y);
      const c = proj(rect.x + rect.w, rect.y + rect.h);
      const d = proj(rect.x, rect.y + rect.h);
      const up = (p: Vec) => ({ x: p.x, y: p.y - h });
      quad([b, c, up(c), up(b)], right); // east face
      quad([c, d, up(d), up(c)], left); // south face
      quad([up(a), up(b), up(c), up(d)], top); // roof
    };

    const loop = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      update(dt, now);
      // camera centres the player
      const pIso = iso(R.me.x, R.me.y);
      cam.x = VIEW.w / 2 - pIso.x;
      cam.y = VIEW.h / 2 - pIso.y - CHAR_H / 2;
      R.cam = { ...cam };
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const update = (dt: number, now: number) => {
      const speed = 2.7 * dt;
      const L = R.layout;
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
        const next = resolveCollision(L.solids, me.x, me.y, me.x + (dx / len) * speed, me.y + (dy / len) * speed, L.world);
        R.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
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
        if (dist < 4) R.target = null;
        else {
          const step = Math.min(speed, dist);
          const next = resolveCollision(L.solids, me.x, me.y, me.x + (ddx / dist) * step, me.y + (ddy / dist) * step, L.world);
          R.facing = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "right" : "left") : ddy > 0 ? "down" : "up";
          if (next.x === me.x && next.y === me.y) R.target = null;
          else {
            R.moved = true;
            moving = true;
          }
          R.me = next;
        }
      }
      R.moving = moving;

      const near = nearestBoard(L.rooms, me.x, me.y);
      const nk = near?.id ?? null;
      if (nk !== R.nearId) {
        R.nearId = nk;
        R.nearRoomForPanel = near ? { id: near.id, name: near.name } : null;
        setNearRoom(near ? { id: near.id, name: near.name } : null);
      }

      if (R.moved && now - R.lastSave > 1000) {
        R.lastSave = now;
        R.moved = false;
        move.mutate({ x: Math.round(me.x), y: Math.round(me.y), roomId: roomIdAt(L.rooms, me.x, me.y) });
      }
    };

    const draw = (now: number) => {
      const L = R.layout;
      ctx.clearRect(0, 0, VIEW.w, VIEW.h);
      ctx.fillStyle = "#c7bfae";
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);

      // Ground plate
      const g0 = proj(0, 0), g1 = proj(L.world.w, 0), g2 = proj(L.world.w, L.world.h), g3 = proj(0, L.world.h);
      quad([g0, g1, g2, g3], GAME.ground);

      // Room floors + rugs + labels
      for (const r of L.rooms) {
        const a = proj(r.rect.x, r.rect.y), b = proj(r.rect.x + r.rect.w, r.rect.y), c = proj(r.rect.x + r.rect.w, r.rect.y + r.rect.h), d = proj(r.rect.x, r.rect.y + r.rect.h);
        quad([a, b, c, d], GAME.roomFloor, GAME.groundLine);
        // rug
        ctx.globalAlpha = 0.25;
        const rx = r.rect.x + 26, ry = r.rect.y + r.rect.h - 80, rw = r.rect.w - 52, rh = 58;
        quad([proj(rx, ry), proj(rx + rw, ry), proj(rx + rw, ry + rh), proj(rx, ry + rh)], r.accent);
        ctx.globalAlpha = 1;
      }

      // Depth-sorted tall objects
      type Item = { depth: number; draw: () => void };
      const items: Item[] = [];
      for (const r of L.rooms) {
        for (const w of roomWallRects(r)) {
          items.push({ depth: w.x + w.y + w.w + w.h, draw: () => isoBox(w, WALL_H, GAME.wallTop, GAME.wallL, GAME.wallR) });
        }
        for (const dk of r.desks) {
          items.push({ depth: dk.x + dk.y + dk.w + dk.h, draw: () => drawDesk(dk) });
        }
        const near = R.nearId === r.id;
        items.push({ depth: r.board.x + r.board.y, draw: () => drawBoard(r, near, now) });
        items.push({ depth: r.rect.x + 12 + (r.rect.y + 10), draw: () => drawSign(r) });
      }
      for (const o of R.others)
        items.push({ depth: o.x + o.y, draw: () => drawChar(o.x, o.y, o.name, false, userHue(o.userId), o.status, "down", false, now) });
      items.push({ depth: R.me.x + R.me.y + 1, draw: () => drawChar(R.me.x, R.me.y, currentUser.name, true, userHue(currentUser.id), myStatus, R.facing, R.moving, now) });

      items.sort((p, q) => p.depth - q.depth);
      for (const it of items) it.draw();
    };

    const drawDesk = (dk: { x: number; y: number; w: number; h: number }) => {
      isoBox(dk, DESK_H, GAME.deskTop, GAME.deskL, GAME.deskR);
      // monitor on top
      const mx = dk.x + dk.w / 2 - 12, my = dk.y + dk.h / 2 - 8;
      const m = { x: mx, y: my, w: 24, h: 16 };
      isoBox({ x: m.x, y: m.y, w: m.w, h: 4 }, DESK_H + 16, GAME.monitor, GAME.monitor, GAME.monitor);
      const top = proj(m.x, m.y);
      ctx.fillStyle = GAME.screen;
      ctx.fillRect(top.x - 8, top.y - DESK_H - 15, 16, 8);
    };

    const drawBoard = (r: RoomGeom, near: boolean, now: number) => {
      const b = { x: r.board.x - 14, y: r.board.y - 8, w: 28, h: 16 };
      if (near) {
        const p = proj(r.board.x, r.board.y);
        ctx.strokeStyle = GAME.busy;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 3;
        const pulse = 6 + Math.sin(now / 200) * 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 26 + pulse, 13 + pulse / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      isoBox(b, BOARD_H, GAME.ink, "#3a352c", "#2c2822");
      const t = proj(r.board.x, r.board.y);
      ctx.strokeStyle = GAME.paper;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(t.x - 7, t.y - BOARD_H - 6 + i * 5);
        ctx.lineTo(t.x + 7, t.y - BOARD_H - 6 + i * 5);
        ctx.stroke();
      }
    };

    const drawSign = (r: RoomGeom) => {
      const p = proj(r.rect.x + 14, r.rect.y + 10);
      const label = (r.kind === "client" ? "★ " : "") + r.name;
      ctx.font = "600 12px ui-sans-serif, system-ui";
      const w = ctx.measureText(label).width + 18 + (r.missionCount > 0 ? 20 : 0);
      ctx.fillStyle = r.kind === "client" ? "#3b2d55" : GAME.ink;
      roundRect(ctx, p.x, p.y - 10, w, 20, 5);
      ctx.fill();
      ctx.fillStyle = GAME.paper;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, p.x + 8, p.y);
      if (r.missionCount > 0) {
        ctx.fillStyle = GAME.busy;
        ctx.beginPath();
        ctx.arc(p.x + w - 10, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a2a10";
        ctx.font = "700 9px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(String(r.missionCount), p.x + w - 10, p.y + 0.5);
      }
      ctx.textAlign = "left";
    };

    const drawChar = (
      wx: number,
      wy: number,
      name: string,
      isMe: boolean,
      hue: number,
      status: string,
      facing: Facing,
      moving: boolean,
      now: number,
    ) => {
      const foot = proj(wx, wy);
      const bob = moving ? Math.abs(Math.sin(now / 90)) * 2 : Math.sin(now / 500 + wx) * 0.7;
      const cy = foot.y - bob;
      const shirt = `hsl(${hue} 48% 52%)`;
      const shirtDark = `hsl(${hue} 45% 42%)`;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(foot.x, foot.y, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isMe) {
        ctx.strokeStyle = "#1c1a16";
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(foot.x, foot.y, 13, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const legShift = moving ? Math.sin(now / 90) * 1.5 : 0;
      ctx.fillStyle = "#3a3630";
      ctx.fillRect(foot.x - 4, cy - 8 + legShift, 3, 8);
      ctx.fillRect(foot.x + 1, cy - 8 - legShift, 3, 8);
      // body
      ctx.fillStyle = shirtDark;
      ctx.fillRect(foot.x - 9, cy - 22, 3, 12);
      ctx.fillRect(foot.x + 6, cy - 22, 3, 12);
      ctx.fillStyle = shirt;
      roundRect(ctx, foot.x - 7, cy - 24, 14, 16, 4);
      ctx.fill();
      // head
      ctx.fillStyle = GAME.skin;
      ctx.beginPath();
      ctx.arc(foot.x, cy - 31, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GAME.hair;
      ctx.beginPath();
      ctx.arc(foot.x, cy - 32, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(foot.x - 6.5, cy - 33, 13, 3);
      if (facing !== "up") {
        ctx.fillStyle = GAME.ink;
        const ex = facing === "left" ? -1.6 : facing === "right" ? 1.6 : 0;
        ctx.fillRect(foot.x - 3 + ex, cy - 31, 1.7, 2);
        ctx.fillRect(foot.x + 1.3 + ex, cy - 31, 1.7, 2);
      }
      // status
      ctx.beginPath();
      ctx.arc(foot.x + 7, cy - 34, 3, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLOR[status] ?? GAME.away;
      ctx.fill();
      ctx.strokeStyle = GAME.paper;
      ctx.lineWidth = 1;
      ctx.stroke();
      // nameplate
      ctx.font = "600 10px ui-sans-serif, system-ui";
      const nm = isMe ? "You" : name.split(" ")[0];
      const nw = ctx.measureText(nm).width + 12;
      ctx.fillStyle = isMe ? GAME.ink : GAME.paper;
      ctx.globalAlpha = isMe ? 1 : 0.94;
      roundRect(ctx, foot.x - nw / 2, cy - 50, nw, 14, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = isMe ? GAME.paper : GAME.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nm, foot.x, cy - 43);
      ctx.textAlign = "left";
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl, myStatus]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * VIEW.w;
    const cy = ((e.clientY - rect.top) / rect.height) * VIEW.h;
    const sx = cx - R.cam.x;
    const sy = cy - R.cam.y;
    const u = sx / A; // wx - wy
    const v = sy / B; // wx + wy
    R.target = { x: (u + v) / 2, y: (v - u) / 2 };
    R.keys.clear();
  };

  const lvl = levelInfo(points);

  return (
    <>
      <PageHeader
        eyebrow="Virtual office"
        title="Gamified Workspace"
        description="Walk the isometric floor, visit a room's board, and complete owner-assigned missions to earn XP."
      >
        {canManage ? (
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add client area
          </Button>
        ) : null}
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

            <div className="relative bg-[#c7bfae]">
              {nearRoom ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center">
                  <button
                    onClick={() => setPanelRoom((cur) => (cur && cur.id === nearRoom.id ? null : nearRoom))}
                    className="pointer-events-auto flex items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-lg"
                  >
                    <Keyboard className="size-3.5" />
                    Press <kbd className="font-mono">E</kbd> — {nearRoom.name}
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
                style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
                aria-label="Virtual office floor"
              />

              {panelRoom ? (
                <RoomMissionsPanel
                  roomId={panelRoom.id}
                  roomName={panelRoom.name}
                  onClose={() => setPanelRoom(null)}
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
                  <span className="flex items-center gap-1.5">
                    {r.kind === "client" ? <Badge variant="outline">Client</Badge> : null}
                    {r.name}
                  </span>
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

      {canManage ? <AddAreaDialog open={addOpen} onOpenChange={setAddOpen} /> : null}
    </>
  );
}

// ---- room wall rects (mirror of workspace-map, for rendering) --------------
function roomWallRects(r: RoomGeom): { x: number; y: number; w: number; h: number }[] {
  const t = 10;
  const DOOR = 96;
  const rect = r.rect;
  const segs: { x: number; y: number; w: number; h: number }[] = [];
  const gx = rect.x + rect.w / 2 - DOOR / 2;
  const gy = rect.y + rect.h / 2 - DOOR / 2;
  for (const wy of [rect.y - t, rect.y + rect.h]) {
    segs.push({ x: rect.x - t, y: wy, w: gx - (rect.x - t), h: t });
    segs.push({ x: gx + DOOR, y: wy, w: rect.x + rect.w + t - (gx + DOOR), h: t });
  }
  for (const wx of [rect.x - t, rect.x + rect.w]) {
    segs.push({ x: wx, y: rect.y - t, w: t, h: gy - (rect.y - t) });
    segs.push({ x: wx, y: gy + DOOR, w: t, h: rect.y + rect.h + t - (gy + DOOR) });
  }
  return segs;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function useGameRefs() {
  const [bag] = useState(() => ({
    me: { x: 0, y: 0 } as Vec,
    target: null as Vec | null,
    keys: new Set<string>(),
    others: [] as { userId: string; name: string; x: number; y: number; status: string }[],
    layout: null as unknown as Layout,
    cam: { x: 0, y: 0 } as Vec,
    facing: "down" as Facing,
    moving: false,
    moved: false,
    lastSave: 0,
    nearId: null as string | null,
    nearRoomForPanel: null as { id: string; name: string } | null,
    initialized: false,
  }));
  return bag;
}

function AddAreaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const clients = trpc.workspace.unassignedClients.useQuery(undefined, { enabled: open });
  const [clientId, setClientId] = useState("");
  const add = trpc.workspace.addClientArea.useMutation({
    onSuccess: () => {
      utils.workspace.state.invalidate();
      utils.workspace.unassignedClients.invalidate();
      onOpenChange(false);
      setClientId("");
      toast.success("Client area added to the floor.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a client area</DialogTitle>
          <DialogDescription>
            Give a client their own room on the floor. Their missions land there and the team
            can walk over to work on them.
          </DialogDescription>
        </DialogHeader>
        {(clients.data?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Every client already has an area — add a client first.
          </p>
        ) : (
          <div className="space-y-2">
            <FormSelect
              value={clientId}
              onValueChange={setClientId}
              placeholder="Select a client"
              options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.companyName }))}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!clientId || add.isPending} onClick={() => add.mutate({ clientId })}>
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add area
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomMissionsPanel({
  roomId,
  roomName,
  onClose,
  onChanged,
}: {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const missions = trpc.workspace.roomMissions.useQuery({ roomId }, { enabled: !!roomId });
  const utils = trpc.useUtils();
  const update = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.workspace.roomMissions.invalidate({ roomId });
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const act = (id: string, status: "todo" | "in_progress" | "review" | "done", msg: string) =>
    update.mutate({ id, status }, { onSuccess: () => toast.success(msg) });

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="font-heading text-sm font-semibold">{roomName}</p>
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
                    {mine && m.status === "review" ? <span className="text-xs font-medium text-warning">Awaiting review</span> : null}
                    {mine && m.status === "done" ? <span className="text-xs font-medium text-success">Completed</span> : null}
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
