"use client";

// Team chat. Three columns, the way every workplace chat app reads: the space
// rail, the channel list, and the conversation. Mounts full-height inside a page
// or inside the workspace overlay, so both share one implementation.

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Loader2, MessageSquare, SendHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { groupMessages, serverInitials, unreadLabel } from "@/lib/chat";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function timeOf(at: Date | string): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const list = trpc.chat.list.useQuery(undefined, { refetchInterval: 15_000 });
  const [serverId, setServerId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const servers = useMemo(() => list.data ?? [], [list.data]);
  const activeServer = servers.find((s) => s.id === serverId) ?? servers[0] ?? null;
  const activeChannel =
    activeServer?.channels.find((c) => c.id === channelId) ?? activeServer?.channels[0] ?? null;

  const messages = trpc.chat.messages.useQuery(
    { channelId: activeChannel?.id ?? "" },
    { enabled: !!activeChannel, refetchInterval: 4000 },
  );

  const markRead = trpc.chat.markRead.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate();
      utils.chat.unreadTotal.invalidate();
    },
  });
  const send = trpc.chat.send.useMutation({
    onSuccess: () => {
      setDraft("");
      utils.chat.messages.invalidate();
      utils.chat.list.invalidate();
    },
  });

  // Opening a channel clears its badge, and so does every message that lands
  // while you are looking at it — but only once per newest message, or the
  // invalidate/refetch pair would chase its own tail.
  const marked = useRef<string | null>(null);
  const newestId = messages.data?.[messages.data.length - 1]?.id ?? "empty";
  useEffect(() => {
    if (!activeChannel) return;
    const stamp = `${activeChannel.id}:${newestId}`;
    if (marked.current === stamp) return;
    marked.current = stamp;
    markRead.mutate({ channelId: activeChannel.id });
    // markRead is a stable mutation handle; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id, newestId]);

  // Pin the transcript to the newest line, the way a chat log should sit.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, activeChannel?.id]);

  const groups = useMemo(() => groupMessages(messages.data ?? []), [messages.data]);
  const canSend = draft.trim().length > 0 && !!activeChannel && !send.isPending;

  const submit = () => {
    if (!canSend || !activeChannel) return;
    send.mutate({ channelId: activeChannel.id, body: draft.trim() });
  };

  return (
    <div
      className={cn(
        "flex min-h-0 overflow-hidden rounded-xl border border-border bg-background",
        className,
      )}
    >
      {/* Space rail */}
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-muted/40 py-3">
        {servers.map((s) => {
          const active = s.id === activeServer?.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                setServerId(s.id);
                setChannelId(s.channels[0]?.id ?? null);
              }}
              title={`${s.name}${s.description ? ` — ${s.description}` : ""}`}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-xl text-xs font-semibold transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
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

      {/* Channel list */}
      <div className="flex w-52 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{activeServer?.name ?? "Chat"}</p>
            {activeServer?.description ? (
              <p className="truncate text-[0.7rem] text-muted-foreground">
                {activeServer.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-1 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
            Channels
          </p>
          {activeServer?.channels.map((c) => {
            const active = c.id === activeChannel?.id;
            const unread = c.unreadCount > 0 && !active;
            return (
              <button
                key={c.id}
                onClick={() => setChannelId(c.id)}
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
          {list.isLoading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <p className="shrink-0 text-sm font-semibold">{activeChannel?.name ?? "—"}</p>
          {activeChannel?.topic ? (
            <>
              <span className="h-4 w-px shrink-0 bg-border" />
              <p className="truncate text-xs text-muted-foreground">{activeChannel.topic}</p>
            </>
          ) : null}
          {activeChannel?.lastMessageAt ? (
            <p className="ml-auto shrink-0 text-[0.7rem] text-muted-foreground">
              Active {relativeTime(activeChannel.lastMessageAt)}
            </p>
          ) : null}
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {messages.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <MessageSquare className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">
                Nothing in #{activeChannel?.name ?? "this channel"} yet
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {activeChannel?.topic ?? "Start the thread — everyone in this space sees it."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const head = g.messages[0];
                return (
                  <div key={g.key} className="flex items-start gap-2.5">
                    <Avatar size="sm" className="mt-0.5 shrink-0">
                      {head.user.avatarUrl ? <AvatarImage src={head.user.avatarUrl} alt="" /> : null}
                      <AvatarFallback>{initials(head.user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">{head.user.name}</span>
                        <span className="text-[0.7rem] text-muted-foreground tabular-nums">
                          {timeOf(g.at)}
                        </span>
                      </p>
                      {g.messages.map((m) => (
                        <p key={m.id} className="text-sm break-words whitespace-pre-wrap">
                          {m.body}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-lg border border-input px-2.5 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              disabled={!activeChannel}
              placeholder={
                activeChannel ? `Message #${activeChannel.name}` : "Pick a channel to start"
              }
              className="field-sizing-content max-h-32 min-h-6 w-full resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button size="icon-sm" disabled={!canSend} onClick={submit} aria-label="Send message">
              {send.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SendHorizontal className="size-3.5" />
              )}
            </Button>
          </div>
          <p className="mt-1 px-1 text-[0.7rem] text-muted-foreground">
            Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </div>
    </div>
  );
}
