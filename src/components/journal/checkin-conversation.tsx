"use client";

// The daily check-in, as a conversation. The interviewer asks about the day
// one question at a time; when it has enough it writes the report, files it,
// and notifies the admins. Works with or without a model configured — without
// one it runs the scripted interview and assembles the report locally.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Turn } from "@/lib/ai/checkin";

export function CheckinConversation() {
  const currentUser = useCurrentUser();
  const utils = trpc.useUtils();
  const state = trpc.journal.checkinState.useQuery();
  const [history, setHistory] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [finished, setFinished] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const reply = trpc.journal.checkinReply.useMutation({ onError: (e) => toast.error(e.message) });
  const finish = trpc.journal.checkinFinish.useMutation({
    onSuccess: () => {
      setFinished(true);
      utils.journal.listMine.invalidate();
      utils.journal.checkinState.invalidate();
      toast.success("Check-in filed — your manager has it.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Open with the first question once we know today's state.
  useEffect(() => {
    if (state.data && history.length === 0 && !state.data.done) {
      setHistory([{ role: "assistant", content: state.data.opening }]);
    }
  }, [state.data, history.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, finished]);

  const busy = reply.isPending || finish.isPending;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Turn[] = [...history, { role: "user", content: text }];
    setHistory(next);
    setDraft("");

    const res = await reply.mutateAsync({ history: next });
    if (res.done || !res.question) {
      const done = await finish.mutateAsync({ history: next });
      setHistory([
        ...next,
        {
          role: "assistant",
          content: `Thanks — that's logged.\n\n${done.report.summary}`,
        },
      ]);
      return;
    }
    setHistory([...next, { role: "assistant", content: res.question }]);
  };

  if (state.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Already filed today.
  if (state.data?.done && !finished) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/5 p-4">
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Today&apos;s check-in is filed</p>
            <p className="mt-1 text-sm text-muted-foreground">{state.data.done.summary}</p>
            {state.data.done.blockers ? (
              <p className="mt-1.5 text-xs text-destructive">
                Blocked: {state.data.done.blockers}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
              submitted {relativeTime(state.data.done.submittedAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[62vh] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-1 pb-2.5">
        <Sparkles className="size-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {state.data?.aiEnabled
            ? "Your AI manager is asking — answer in your own words."
            : "Answer in your own words. Your report goes to the admins when we're done."}
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
        {history.map((t, i) => (
          <div
            key={i}
            className={cn("flex gap-2.5", t.role === "user" ? "justify-end" : "justify-start")}
          >
            {t.role === "assistant" ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.6rem] font-bold text-background">
                AI
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                t.role === "user"
                  ? "rounded-br-sm bg-foreground text-background"
                  : "rounded-bl-sm bg-muted",
              )}
            >
              {t.content}
            </div>
            {t.role === "user" ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6rem] font-bold">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </span>
            ) : null}
          </div>
        ))}
        {busy ? (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {finish.isPending ? "Writing your report…" : "Thinking…"}
          </div>
        ) : null}
      </div>

      {finished ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <Check className="size-4 text-success" />
          Report filed and sent to your manager.
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
            className="max-h-32 min-h-11 flex-1 resize-none text-sm"
            disabled={busy}
          />
          <Button onClick={() => void send()} disabled={busy || draft.trim().length === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
