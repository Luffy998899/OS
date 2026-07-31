"use client";

// Team chat, laid out the way Discord reads: the space rail (with a Direct
// Messages home on top), the channel or conversation list, the transcript with
// date dividers and hover timestamps, and a toggleable member sidebar. Mounts
// full-height inside a page or inside the workspace overlay, so both share one
// implementation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Hash,
  Loader2,
  MessageSquare,
  SendHorizontal,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { crossesDay, dayLabel, groupMessages, serverInitials, unreadLabel } from "@/lib/chat";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

function timeOf(at: Date | string): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  busy: "bg-red-500",
  away: "bg-amber-400",
  offline: "bg-zinc-400/60",
};

function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 rounded-full ring-2 ring-background",
        STATUS_DOT[status] ?? STATUS_DOT.offline,
        className,
      )}
    />
  );
}

/** The rail is either a server or the DM home. */
type Pane = { type: "server"; serverId: string } | { type: "dm" };

export function ChatPanel({
  className,
  autoFocus = true,
}: {
  className?: string;
  autoFocus?: boolean;
}) {
  const utils = trpc.useUtils();
  const list = trpc.chat.list.useQuery(undefined, { refetchInterval: 15_000 });
  const members = trpc.chat.members.useQuery(undefined, { refetchInterval: 20_000 });
  const [pane, setPane] = useState<Pane | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const servers = list.data?.servers ?? [];
  const dms = useMemo(() => list.data?.dms ?? [], [list.data?.dms]);
  const dmUnread = list.data?.dmUnread ?? 0;

  const activePane: Pane | null =
    pane ?? (servers[0] ? { type: "server", serverId: servers[0].id } : null);
  const activeServer =
    activePane?.type === "server"
      ? (servers.find((s) => s.id === activePane.serverId) ?? servers[0] ?? null)
      : null;
  const activeChannel =
    activePane?.type === "server"
      ? (activeServer?.channels.find((c) => c.id === channelId) ?? activeServer?.channels[0] ?? null)
      : null;
  const activeDm =
    activePane?.type === "dm" ? (dms.find((d) => d.id === channelId) ?? null) : null;

  // In DM mode trust the selected id directly: right after openDm creates a
  // channel the refreshed list hasn't landed yet, and the input must not sit
  // disabled while we wait for it.
  const conversationId = activePane?.type === "dm" ? (channelId ?? undefined) : activeChannel?.id;

  const messages = trpc.chat.messages.useQuery(
    { channelId: conversationId ?? "" },
    { enabled: !!conversationId, refetchInterval: 4000 },
  );

  // You should be able to type the moment chat opens — no clicking around
  // first. Focus follows the conversation, and every explicit selection click
  // re-focuses too (switching back to an already-open DM changes nothing the
  // effect below could react to).
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusInput = useCallback(() => {
    if (!autoFocus) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);

  const markRead = trpc.chat.markRead.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate();
      utils.chat.unreadTotal.invalidate();
    },
  });
  const openDm = trpc.chat.openDm.useMutation({
    onSuccess: (res) => {
      setPane({ type: "dm" });
      setChannelId(res.channelId);
      utils.chat.list.invalidate();
      focusInput();
    },
  });
  const send = trpc.chat.send.useMutation({
    onSuccess: () => {
      setDraft("");
      utils.chat.messages.invalidate();
      utils.chat.list.invalidate();
      inputRef.current?.focus();
    },
  });

  // Opening a conversation clears its badge, and so does every message that
  // lands while you are looking at it — but only once per newest message, or
  // the invalidate/refetch pair would chase its own tail.
  const marked = useRef<string | null>(null);
  const newestId = messages.data?.[messages.data.length - 1]?.id ?? "empty";
  useEffect(() => {
    if (!conversationId) return;
    const stamp = `${conversationId}:${newestId}`;
    if (marked.current === stamp) return;
    marked.current = stamp;
    markRead.mutate({ channelId: conversationId });
    // markRead is a stable mutation handle; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, newestId]);

  // Pin the transcript to the newest line, the way a chat log should sit.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    focusInput();
  }, [conversationId, focusInput]);

  const groups = useMemo(() => groupMessages(messages.data ?? []), [messages.data]);
  const canSend = draft.trim().length > 0 && !!conversationId && !send.isPending;

  const submit = () => {
    if (!canSend || !conversationId) return;
    send.mutate({ channelId: conversationId, body: draft.trim() });
  };

  const startDm = useCallback(
    (userId: string) => {
      const existing = dms.find((d) => d.peer.id === userId);
      if (existing) {
        setPane({ type: "dm" });
        setChannelId(existing.id);
        focusInput();
      } else {
        openDm.mutate({ userId });
      }
    },
    [dms, openDm, focusInput],
  );

  const teammates = (members.data ?? []).filter((m) => !m.isMe);
  const conversationName =
    activePane?.type === "dm" ? (activeDm?.peer.name ?? "Direct messages") : (activeChannel?.name ?? "—");
  const placeholder =
    activePane?.type === "dm"
      ? activeDm
        ? `Message @${activeDm.peer.name}`
        : "Pick a person to message"
      : activeChannel
        ? `Message #${activeChannel.name}`
        : "Pick a channel to start";

  return (
    <div
      className={cn(
        "flex min-h-0 overflow-hidden rounded-xl border border-border bg-background",
        className,
      )}
    >
      {/* Space rail */}
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-muted/40 py-3">
        {/* DM home, the way Discord pins it on top */}
        <button
          onClick={() => {
            setPane({ type: "dm" });
            setChannelId(dms[0]?.id ?? null);
            focusInput();
          }}
          title="Direct messages"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-xl transition-all",
            activePane?.type === "dm"
              ? "rounded-lg bg-foreground text-background"
              : "bg-background text-muted-foreground hover:rounded-lg hover:bg-muted hover:text-foreground",
          )}
        >
          <MessageSquare className="size-4.5" />
          {dmUnread > 0 && activePane?.type !== "dm" ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[0.6rem] leading-4 font-semibold text-background">
              {unreadLabel(dmUnread)}
            </span>
          ) : null}
        </button>
        <div className="h-px w-7 shrink-0 bg-border" />
        {servers.map((s) => {
          const active = activePane?.type === "server" && s.id === activeServer?.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                setPane({ type: "server", serverId: s.id });
                setChannelId(s.channels[0]?.id ?? null);
              }}
              title={`${s.name}${s.description ? ` — ${s.description}` : ""}`}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-xl text-xs font-semibold transition-all",
                active
                  ? "rounded-lg bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:rounded-lg hover:bg-muted hover:text-foreground",
              )}
            >
              {serverInitials(s.name)}
              {s.unreadCount > 0 && !active ? (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[0.6rem] leading-4 font-semibold text-background">
                  {unreadLabel(s.unreadCount)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Channel / conversation list */}
      <div className="flex w-52 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {activePane?.type === "dm" ? "Direct Messages" : (activeServer?.name ?? "Chat")}
            </p>
            {activePane?.type === "dm" ? (
              <p className="truncate text-[0.7rem] text-muted-foreground">
                One-to-one, like Discord DMs
              </p>
            ) : activeServer?.description ? (
              <p className="truncate text-[0.7rem] text-muted-foreground">
                {activeServer.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {activePane?.type === "dm" ? (
            <>
              {teammates.length === 0 && !members.isLoading ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No teammates yet.
                </p>
              ) : null}
              {teammates.map((m) => {
                const dm = dms.find((d) => d.peer.id === m.id);
                const active = !!dm && dm.id === activeDm?.id;
                const unread = (dm?.unreadCount ?? 0) > 0 && !active;
                return (
                  <button
                    key={m.id}
                    onClick={() => startDm(m.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : unread
                          ? "font-semibold text-foreground hover:bg-muted"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="relative shrink-0">
                      <Avatar size="sm">
                        {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
                        <AvatarFallback>{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      <StatusDot
                        status={dm?.peer.status ?? m.status}
                        className="absolute -right-0.5 -bottom-0.5 size-2"
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    {unread ? (
                      <span className="flex min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-[0.6rem] leading-4 font-semibold text-background">
                        {unreadLabel(dm?.unreadCount ?? 0)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <p className="px-2 pb-1 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                Channels
              </p>
              {activeServer?.channels.map((c) => {
                const active = c.id === activeChannel?.id;
                const unread = c.unreadCount > 0 && !active;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setChannelId(c.id);
                      focusInput();
                    }}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : unread
                          ? "font-semibold text-foreground hover:bg-muted"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Hash className="size-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {unread ? (
                      <span className="flex min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-[0.6rem] leading-4 font-semibold text-background">
                        {unreadLabel(c.unreadCount)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </>
          )}
          {list.isLoading || (activePane?.type === "dm" && members.isLoading) ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          {activePane?.type === "dm" ? (
            activeDm ? (
              <span className="relative flex shrink-0 items-center">
                <Avatar size="sm">
                  {activeDm.peer.avatarUrl ? (
                    <AvatarImage src={activeDm.peer.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback>{initials(activeDm.peer.name)}</AvatarFallback>
                </Avatar>
                <StatusDot
                  status={activeDm.peer.status}
                  className="absolute -right-0.5 -bottom-0.5 size-2"
                />
              </span>
            ) : (
              <AtSign className="size-4 shrink-0 text-muted-foreground" />
            )
          ) : (
            <Hash className="size-4 shrink-0 text-muted-foreground" />
          )}
          <p className="shrink-0 text-sm font-semibold">{conversationName}</p>
          {activePane?.type === "dm" && activeDm ? (
            <p className="truncate text-xs text-muted-foreground capitalize">
              {activeDm.peer.status}
              {activeDm.peer.title ? ` · ${activeDm.peer.title}` : ""}
            </p>
          ) : activeChannel?.topic ? (
            <>
              <span className="h-4 w-px shrink-0 bg-border" />
              <p className="truncate text-xs text-muted-foreground">{activeChannel.topic}</p>
            </>
          ) : null}
          {activePane?.type === "server" ? (
            <button
              onClick={() => setMembersOpen((v) => !v)}
              title="Member list"
              aria-label="Toggle member list"
              className={cn(
                "ml-auto shrink-0 rounded-md p-1.5 transition-colors",
                membersOpen
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Users className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-3">
              {messages.isLoading && conversationId ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : groups.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <MessageSquare className="size-5 text-muted-foreground" />
                  </span>
                  <p className="text-sm font-medium">
                    {activePane?.type === "dm"
                      ? activeDm
                        ? `This is the start of your conversation with ${activeDm.peer.name}`
                        : "Pick a teammate to start a conversation"
                      : `Nothing in #${activeChannel?.name ?? "this channel"} yet`}
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    {activePane?.type === "dm"
                      ? "Only the two of you can see this."
                      : (activeChannel?.topic ?? "Start the thread — everyone in this space sees it.")}
                  </p>
                </div>
              ) : (
                <div>
                  {groups.map((g, i) => {
                    const head = g.messages[0];
                    const prev = groups[i - 1];
                    const newDay = !prev || crossesDay(prev.at, g.at);
                    return (
                      <div key={g.key}>
                        {newDay ? (
                          <div className="my-3 flex items-center gap-3 px-4">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-[0.65rem] font-semibold text-muted-foreground">
                              {dayLabel(g.at)}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        ) : null}
                        <div className="group flex items-start gap-2.5 px-4 py-0.5 hover:bg-muted/50">
                          <Avatar size="sm" className="mt-0.5 shrink-0">
                            {head.user.avatarUrl ? (
                              <AvatarImage src={head.user.avatarUrl} alt="" />
                            ) : null}
                            <AvatarFallback>{initials(head.user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold">{head.user.name}</span>
                              <span className="text-[0.7rem] text-muted-foreground tabular-nums">
                                {timeOf(g.at)}
                              </span>
                            </p>
                            {g.messages.map((m, j) => (
                              <div key={m.id} className="group/line relative -mx-1 rounded px-1">
                                {j > 0 ? (
                                  <span className="pointer-events-none absolute top-1/2 -left-12 hidden -translate-y-1/2 text-[0.62rem] text-muted-foreground tabular-nums group-hover/line:inline">
                                    {timeOf(m.createdAt)}
                                  </span>
                                ) : null}
                                <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 p-3 pt-1">
              <div className="flex items-end gap-2 rounded-lg bg-muted/70 px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring/40">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={1}
                  disabled={!conversationId}
                  placeholder={placeholder}
                  className="field-sizing-content max-h-32 min-h-6 w-full resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!canSend}
                  onClick={submit}
                  aria-label="Send message"
                >
                  {send.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <SendHorizontal className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Member sidebar (servers only) */}
          {activePane?.type === "server" && membersOpen ? (
            <div className="w-44 shrink-0 overflow-y-auto border-l border-border bg-muted/20 p-2">
              {(["online", "busy", "away", "offline"] as const).map((bucket) => {
                const bucketMembers = (members.data ?? []).filter((m) => m.status === bucket);
                if (bucketMembers.length === 0) return null;
                return (
                  <div key={bucket} className="mb-2">
                    <p className="px-2 pb-1 font-mono text-[0.6rem] font-medium tracking-widest text-muted-foreground uppercase">
                      {bucket} — {bucketMembers.length}
                    </p>
                    {bucketMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => (m.isMe ? undefined : startDm(m.id))}
                        disabled={m.isMe}
                        title={m.isMe ? undefined : `Message ${m.name}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                          bucket === "offline" ? "opacity-55" : "",
                          m.isMe
                            ? "cursor-default text-muted-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span className="relative shrink-0">
                          <Avatar size="sm">
                            {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
                            <AvatarFallback>{initials(m.name)}</AvatarFallback>
                          </Avatar>
                          <StatusDot status={m.status} className="absolute -right-0.5 -bottom-0.5 size-2" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {m.name}
                          {m.isMe ? " (you)" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
