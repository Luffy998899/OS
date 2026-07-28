"use client";

// The workspace lobby — your crewmate, your craft levels, the bounty board, and
// the door into the floor itself. The floor is a full-window first-person view
// (see ./first-person-floor), so this page is the briefing you read before you
// walk in, not a scaled-down copy of the game.

import { useEffect, useMemo, useState } from "react";
import {
  Gamepad2,
  Loader2,
  Play,
  Plus,
  ScrollText,
  Sparkles,
  Trophy,
  Users,
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
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { characterFor } from "@/lib/characters";
import { levelInfo } from "@/lib/xp";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { FirstPersonFloor } from "./first-person-floor";
import { BountyBoardPanel } from "./bounty-board";
import { SkillTreePanel } from "./skill-tree";
import { CrewmateAvatar } from "./crewmate-avatar";
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

const STATUSES = ["online", "busy", "away"] as const;

// Every campus room, reachable from the lobby without walking the floor.
const ROOM_LAUNCHERS = [
  { key: "video", label: "Video Editing Bay", desc: "Queue, timers & scripts" },
  { key: "city", label: "Developer City", desc: "Towers, floors & audits" },
  { key: "conference", label: "Conference Hall", desc: "Meetings & disclosures" },
  { key: "tasks", label: "Task Room", desc: "Your wall & squad work" },
  { key: "approvals", label: "Managing Heads", desc: "Leave & sign-offs" },
  { key: "outreach", label: "Outreach Room", desc: "Sectors, day plan, OTP" },
  { key: "creative", label: "Creative Studio", desc: "Client houses & boards" },
  { key: "shoot", label: "Shoot Room", desc: "This week's call sheet" },
  { key: "timetable", label: "Timetable", desc: "The bell schedule" },
  { key: "docs", label: "Writing Desk", desc: "Scripts, notes & boards" },
  { key: "lair", label: "The Upside Down", desc: "Vecna's overwatch", adminOnly: true },
] as const;
type LauncherKey = (typeof ROOM_LAUNCHERS)[number]["key"];

export function WorkspaceGame() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.CLIENTS_MANAGE);
  const isAdmin = hasPermission(currentUser.permissions, PERMISSIONS.ADMIN);
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 15_000 });
  const enter = trpc.workspace.enter.useMutation();
  const setStatus = trpc.workspace.setStatus.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });

  const [playing, setPlaying] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState<LauncherKey | null>(null);
  const [myStatus, setMyStatus] = useState(state.data?.me?.status ?? "online");
  const [characterId, setCharacterId] = useState<string | null>(null);

  // Claim a crewmate up front so the card below shows who you actually are.
  useEffect(() => {
    enter.mutate(undefined, {
      onSuccess: (res) => setCharacterId(res.characterId ?? null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.data?.me?.status) setMyStatus(state.data.me.status);
  }, [state.data?.me?.status]);

  const character = useMemo(
    () => characterFor(characterId, currentUser.id),
    [characterId, currentUser.id],
  );
  const lvl = levelInfo(state.data?.me?.points ?? currentUser.points);
  const rooms = state.data?.rooms ?? [];
  const openBounties = state.data?.totalBounties ?? 0;

  if (playing) {
    return (
      <FirstPersonFloor
        onExit={() => {
          setPlaying(false);
          utils.workspace.state.invalidate();
          utils.skill.tree.invalidate();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Virtual office"
        title="Gamified Workspace"
        description="Walk the floor in first person, claim missions off the bounty board, and level the craft you want to be known for."
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
        <div className="space-y-6 lg:col-span-2">
          {/* ---- Enter the floor ---- */}
          <Card className="gap-0 overflow-hidden p-0">
            <div className="relative flex flex-col gap-5 bg-gradient-to-br from-foreground/[0.06] to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <CrewmateAvatar character={character} size={84} status={myStatus} />
                <div className="min-w-0">
                  <p className="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
                    Your crewmate
                  </p>
                  <h2 className="font-display text-xl font-semibold">{character.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{character.trait}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded bg-foreground text-[0.65rem] font-bold text-background">
                      {lvl.level}
                    </span>
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
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

              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <Button size="lg" onClick={() => setPlaying(true)} disabled={rooms.length === 0}>
                  <Play className="size-4" />
                  Enter the floor
                </Button>
                <p className="text-center font-mono text-[0.65rem] tracking-wide text-muted-foreground sm:text-right">
                  first person · full screen · WASD + mouse
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              <Stat
                icon={<ScrollText className="size-3.5" />}
                label="On the board"
                value={openBounties}
              />
              <Stat
                icon={<Trophy className="size-3.5" />}
                label="Open missions"
                value={state.data?.totalOpen ?? 0}
              />
              <Stat
                icon={<Users className="size-3.5" />}
                label="On the floor"
                value={state.data?.online ?? 0}
              />
            </div>
          </Card>

          {/* ---- Room launcher ---- */}
          <Card className="gap-3">
            <div className="flex items-center justify-between px-4">
              <h2 className="font-heading text-sm font-semibold">Rooms — straight in</h2>
              <p className="text-xs text-muted-foreground">or walk there on the floor</p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3">
              {ROOM_LAUNCHERS.filter((r) => !("adminOnly" in r && r.adminOnly) || isAdmin).map(
                (r) => (
                  <button
                    key={r.key}
                    onClick={() => setRoomOpen(r.key)}
                    className={cn(
                      "rounded-lg border border-border p-2.5 text-left transition-colors hover:border-foreground/30",
                      r.key === "lair" &&
                        "border-destructive/40 bg-destructive/5 hover:border-destructive",
                    )}
                  >
                    <p className="text-xs font-semibold">{r.label}</p>
                    <p className="text-[0.65rem] text-muted-foreground">{r.desc}</p>
                  </button>
                ),
              )}
            </div>
          </Card>

          {/* ---- Bounty board ---- */}
          <Card className="gap-3">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <ScrollText className="size-4" />
                <h2 className="font-heading text-sm font-semibold">Bounty Board</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Unclaimed missions — urgent ones pay a bonus
              </p>
            </div>
            <div className="px-4">
              <BountyBoardPanel
                onChanged={() => {
                  utils.workspace.state.invalidate();
                  utils.skill.tree.invalidate();
                }}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* ---- Skill tree ---- */}
          <Card className="gap-3">
            <div className="flex items-center gap-2 px-4">
              <Gamepad2 className="size-4" />
              <h2 className="font-heading text-sm font-semibold">Skill Tree</h2>
            </div>
            <div className="px-4">
              <SkillTreePanel compact />
            </div>
          </Card>

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
              {rooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    {r.kind === "client" ? <Badge variant="outline">Client</Badge> : null}
                    {r.name}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {(state.data?.players ?? []).filter((p) => p.roomId === r.id).length} here
                    {r.bountyCount > 0 ? (
                      <Badge variant="destructive">{r.bountyCount} open</Badge>
                    ) : null}
                    {r.missionCount > 0 ? (
                      <Badge variant="secondary">{r.missionCount}</Badge>
                    ) : null}
                  </span>
                </li>
              ))}
              {rooms.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No rooms on the floor yet.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>

      <Dialog open={roomOpen !== null} onOpenChange={(v) => (v ? null : setRoomOpen(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{ROOM_LAUNCHERS.find((r) => r.key === roomOpen)?.label ?? ""}</DialogTitle>
          </DialogHeader>
          {roomOpen === "video" ? <VideoBayPanel /> : null}
          {roomOpen === "city" ? <DevCityPanel /> : null}
          {roomOpen === "conference" ? <ConferencePanel /> : null}
          {roomOpen === "tasks" ? <TasksRoomPanel /> : null}
          {roomOpen === "approvals" ? <ApprovalsPanel /> : null}
          {roomOpen === "outreach" ? <OutreachPanel /> : null}
          {roomOpen === "creative" ? (
            <CreativePanel initialDoor="clients" onOpenBoard={(docId) => router.push(`/documents/${docId}`)} />
          ) : null}
          {roomOpen === "shoot" ? <ShootPanel /> : null}
          {roomOpen === "timetable" ? <TimetablePanel /> : null}
          {roomOpen === "docs" ? <DocsPanel /> : null}
          {roomOpen === "lair" ? <LairPanel /> : null}
        </DialogContent>
      </Dialog>

      {canManage ? <AddAreaDialog open={addOpen} onOpenChange={setAddOpen} /> : null}
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-display text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function AddAreaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
            Give a client their own room on the floor. Their missions land there and the
            team can walk over to work on them.
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
              options={(clients.data ?? []).map((c) => ({
                value: c.id,
                label: c.companyName,
              }))}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!clientId || add.isPending} onClick={() => add.mutate({ clientId })}>
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add area
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
