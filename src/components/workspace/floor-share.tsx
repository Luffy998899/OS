"use client";

// What the client sees at /f/<token>: their floor's progress and a chat-like
// request box. Every message gets an acknowledgement from the on-floor agent
// (Claude when configured, a steady concierge line otherwise), and the team
// converts requests into real floor tasks.

import { useState } from "react";
import { Building2, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FloorSharePage({ token }: { token: string }) {
  const floor = trpc.project.byToken.useQuery({ token }, { retry: 1, refetchInterval: 30_000 });
  const utils = trpc.useUtils();
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const request = trpc.project.requestTask.useMutation({
    onSuccess: () => {
      setBody("");
      utils.project.byToken.invalidate({ token });
    },
  });

  if (floor.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f1ea]">
        <Loader2 className="size-6 animate-spin text-[#8a8371]" />
      </div>
    );
  }
  if (floor.isError || !floor.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#f4f1ea] text-[#3a362e]">
        <Building2 className="size-8 opacity-40" />
        <p className="font-medium">This floor link isn't valid any more.</p>
        <p className="text-sm opacity-60">Ask your project team for a fresh one.</p>
      </div>
    );
  }

  const p = floor.data;
  const pct = p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#26231d]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="font-mono text-[0.65rem] tracking-[0.2em] uppercase opacity-50">
          Auxa · Floor {p.floor} · {p.buildingKey === "pipeline" ? "Pipeline tower" : "Completed tower"}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold">{p.name}</h1>
        <p className="mt-0.5 text-sm opacity-60">
          {p.clientName ?? ""}
          {p.deadline ? ` · interior hand-over ${relativeTime(p.deadline)}` : ""}
        </p>

        <div className="mt-5 rounded-xl border border-[#d9d2c2] bg-white/70 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Build progress</span>
            <span className="font-mono text-xs opacity-60">
              {p.progress.done}/{p.progress.total} tasks · {pct}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8e2d2]">
            <div className="h-full rounded-full bg-[#5f8f6a] transition-all" style={{ width: `${pct}%` }} />
          </div>
          {p.siteUrl ? (
            <a
              href={p.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#4a6d8c] hover:underline"
            >
              <ExternalLink className="size-3.5" />
              View the current build
            </a>
          ) : null}
        </div>

        {/* The request thread */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Drop a request on the floor</h2>
          <p className="text-xs opacity-60">
            Tell the on-floor agent what you need — the team triages every request into the build plan.
          </p>

          <div className="mt-3 space-y-3">
            {p.requests.map((r) => (
              <div key={r.id} className="space-y-1.5">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#3a4a3f] px-3.5 py-2 text-sm text-[#f4f1ea]">
                  <p className="mb-0.5 font-mono text-[0.6rem] tracking-wide opacity-60">
                    {r.author} · {relativeTime(r.createdAt)}
                  </p>
                  {r.body}
                </div>
                {r.reply ? (
                  <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm border border-[#d9d2c2] bg-white px-3.5 py-2 text-sm">
                    <p className="mb-0.5 flex items-center gap-1 font-mono text-[0.6rem] tracking-wide opacity-50">
                      <Sparkles className="size-2.5" />
                      floor agent
                      {r.status === "converted" ? " · added to the build plan" : ""}
                    </p>
                    {r.reply}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name"
              className="h-9 w-48 rounded-lg border border-[#d9d2c2] bg-white px-3 text-sm outline-none focus:border-[#8a8371]"
            />
            <div className="flex gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="e.g. Can we add a WhatsApp button on the contact page?"
                className="flex-1 resize-none rounded-lg border border-[#d9d2c2] bg-white px-3 py-2 text-sm outline-none focus:border-[#8a8371]"
              />
              <button
                disabled={request.isPending || body.trim().length < 3 || author.trim().length === 0}
                onClick={() => request.mutate({ token, author: author.trim(), body: body.trim() })}
                className={cn(
                  "flex h-fit items-center gap-1.5 self-end rounded-lg bg-[#3a4a3f] px-4 py-2 text-sm font-medium text-white transition-opacity",
                  (request.isPending || body.trim().length < 3 || !author.trim()) && "opacity-50",
                )}
              >
                {request.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send
              </button>
            </div>
            {request.isError ? (
              <p className="text-xs text-[#a33d35]">{request.error.message}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-10 text-center font-mono text-[0.6rem] tracking-widest uppercase opacity-40">
          Powered by Auxa — the agency operating system
        </p>
      </div>
    </div>
  );
}
