"use client";

import { useState } from "react";
import { Loader2, Send, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";

const PROMPTS = [
  "What did you get done today?",
  "What's still pending?",
  "Anything blocking you or the team?",
];

export function JournalView() {
  const [content, setContent] = useState("");
  const entries = trpc.journal.listMine.useQuery();
  const utils = trpc.useUtils();

  const create = trpc.journal.create.useMutation({
    onSuccess: () => {
      utils.journal.listMine.invalidate();
      setContent("");
      toast.success("Check-in logged.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Reflect"
        title="Daily check-in"
        description="Tell the AI manager about your day — completions, pending work, and blockers."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="gap-3">
            <div className="flex items-center gap-2 px-5">
              <Sparkles className="size-4" />
              <h2 className="font-heading text-sm font-semibold">Today&rsquo;s check-in</h2>
            </div>
            <div className="px-5">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder={PROMPTS.join("\n")}
              />
              <div className="mt-2 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled
                  title="Voice check-in (Deepgram) — coming soon"
                >
                  <Mic className="size-4" />
                  Voice (soon)
                </Button>
                <Button
                  disabled={content.trim().length < 1 || create.isPending}
                  onClick={() => create.mutate({ content })}
                >
                  {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Log check-in
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="gap-0 py-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold">Your history</h2>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {(entries.data?.length ?? 0) === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No check-ins yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {entries.data?.map((e) => (
                  <li key={e.id} className="px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(new Date(e.createdAt), "dd MMM yyyy, HH:mm")}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{e.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
