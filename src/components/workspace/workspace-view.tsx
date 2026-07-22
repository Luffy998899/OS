"use client";

import { useEffect, useState } from "react";
import { Sparkles, Users, ListChecks, Loader2, MapPin } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type WSState = RouterOutputs["workspace"]["state"];
type Room = WSState["rooms"][number];

const STATUS_DOT: Record<string, string> = {
  online: "bg-success",
  busy: "bg-warning",
  away: "bg-muted-foreground",
};

const STATUSES = ["online", "busy", "away"] as const;

export function WorkspaceView() {
  const utils = trpc.useUtils();
  const state = trpc.workspace.state.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && state.data?.myRoomId) setSelected(state.data.myRoomId);
  }, [state.data?.myRoomId, selected]);

  const move = trpc.workspace.move.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });
  const setStatus = trpc.workspace.setStatus.useMutation({
    onSuccess: () => utils.workspace.state.invalidate(),
  });

  const rooms = state.data?.rooms ?? [];
  const byPos = new Map(rooms.map((r) => [`${r.posY}-${r.posX}`, r]));
  const myRoomId = state.data?.myRoomId ?? null;
  const myStatus = state.data?.myStatus ?? "online";

  return (
    <>
      <PageHeader
        eyebrow="Virtual office"
        title="Gamified Workspace"
        description="Walk the floor, see who's around, and pick up missions. The AI runs the room and keeps the day moving."
      >
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus.mutate({ status: s })}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                myStatus === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[s])} />
              {s}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* The floor */}
        <div className="lg:col-span-2">
          <Card className="gap-0 bg-muted/30 py-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold">
                The floor
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" /> {state.data?.online ?? 0} online
                </span>
                <span className="flex items-center gap-1">
                  <ListChecks className="size-3.5" /> {state.data?.totalOpen ?? 0}{" "}
                  missions
                </span>
              </div>
            </div>
            {state.isLoading ? (
              <div className="flex h-80 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                className="grid grid-cols-3 gap-3 p-4"
                style={{
                  backgroundImage:
                    "radial-gradient(var(--color-border) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
              >
                {[0, 1, 2].map((y) =>
                  [0, 1, 2].map((x) => {
                    const room = byPos.get(`${y}-${x}`);
                    if (!room) {
                      return (
                        <div
                          key={`${y}-${x}`}
                          className="min-h-[132px] rounded-lg border border-dashed border-border/60"
                        />
                      );
                    }
                    return (
                      <RoomTile
                        key={room.id}
                        room={room}
                        isHere={myRoomId === room.id}
                        isSelected={selected === room.id}
                        onEnter={() => {
                          setSelected(room.id);
                          if (myRoomId !== room.id)
                            move.mutate({ roomId: room.id });
                        }}
                      />
                    );
                  }),
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Side panel */}
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
                  <div>
                    <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Flagged today
                    </p>
                    <ul className="space-y-1">
                      {state.data.ai.importantTasks.map((t) => (
                        <li
                          key={t}
                          className="flex items-start gap-1.5 text-sm"
                        >
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="px-4 text-sm text-muted-foreground">
                No check-in yet today.
              </p>
            )}
          </Card>

          <SelectedRoomMissions
            roomId={selected}
            room={rooms.find((r) => r.id === selected) ?? null}
          />
        </div>
      </div>
    </>
  );
}

function RoomTile({
  room,
  isHere,
  isSelected,
  onEnter,
}: {
  room: Room;
  isHere: boolean;
  isSelected: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      onClick={onEnter}
      className={cn(
        "flex min-h-[132px] flex-col rounded-lg border bg-card p-3 text-left transition-all hover:ring-2 hover:ring-foreground/10",
        isSelected ? "border-foreground ring-2 ring-foreground/20" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{room.name}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {room.department}
          </p>
        </div>
        {room.missionCount > 0 ? (
          <Badge variant="secondary" className="shrink-0">
            {room.missionCount}
          </Badge>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex -space-x-2">
          {room.occupants.slice(0, 5).map((o) => (
            <div key={o.id} className="relative">
              <Avatar
                className={cn(
                  "size-7 ring-2 ring-card",
                  o.isMe && "ring-foreground",
                )}
              >
                {o.avatarUrl ? <AvatarImage src={o.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[0.6rem]">
                  {initials(o.name)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-1 ring-card",
                  STATUS_DOT[o.status] ?? "bg-muted-foreground",
                )}
              />
            </div>
          ))}
          {room.occupants.length > 5 ? (
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[0.6rem] font-medium ring-2 ring-card">
              +{room.occupants.length - 5}
            </div>
          ) : null}
          {room.occupants.length === 0 ? (
            <span className="text-xs text-muted-foreground">Empty</span>
          ) : null}
        </div>
        {isHere ? (
          <span className="flex items-center gap-1 text-[0.7rem] font-medium text-success">
            <MapPin className="size-3" /> You&rsquo;re here
          </span>
        ) : null}
      </div>
    </button>
  );
}

function SelectedRoomMissions({
  roomId,
  room,
}: {
  roomId: string | null;
  room: Room | null;
}) {
  const missions = trpc.workspace.roomMissions.useQuery(
    { roomId: roomId ?? "" },
    { enabled: !!roomId },
  );

  return (
    <Card className="gap-0 py-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold">
          {room ? `${room.name} — missions` : "Missions"}
        </h2>
      </div>
      {!roomId ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Select a room to see its missions.
        </p>
      ) : missions.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (missions.data?.length ?? 0) === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No open missions in this room.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {missions.data?.map((m) => (
            <li key={m.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">
                  {m.title}
                </p>
                <TaskStatusBadge status={m.status} />
              </div>
              {m.assignee ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.assignee.name} · {m.points} pts
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
