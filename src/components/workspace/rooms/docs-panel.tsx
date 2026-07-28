"use client";

// The writing desk, in-game. Scripts and notes get written right here without
// leaving the floor; whiteboards open the full Miro-style canvas in a new tab
// so the game keeps running behind them.

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  NotebookPen,
  Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DocsPanel() {
  const utils = trpc.useUtils();
  const docs = trpc.document.list.useQuery();
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState<"doc" | "whiteboard" | null>(null);

  const create = trpc.document.create.useMutation({
    onSuccess: (d) => {
      utils.document.list.invalidate();
      setTitle("");
      setCreating(null);
      if (d.type === "doc") {
        setOpenId(d.id);
      } else {
        window.open(`/documents/${d.id}`, "_blank", "noopener");
        toast.success("Board opened in a new tab — the floor keeps running here.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  if (openId) {
    return <ScriptEditor docId={openId} onBack={() => setOpenId(null)} />;
  }

  const rows = docs.data ?? [];
  const scripts = rows.filter((d) => d.type === "doc");
  const boards = rows.filter((d) => d.type === "whiteboard");

  return (
    <div className="space-y-4">
      {/* New document */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
        <div className="min-w-40 flex-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Write it here — scripts save straight from the desk.
          </p>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reel script — Zen Salon launch"
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim().length > 0) {
                setCreating("doc");
                create.mutate({ title: title.trim(), type: "doc", visibility: "team" });
              }
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={title.trim().length === 0 || create.isPending}
          onClick={() => {
            setCreating("doc");
            create.mutate({ title: title.trim(), type: "doc", visibility: "team" });
          }}
        >
          {create.isPending && creating === "doc" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <NotebookPen className="size-3.5" />
          )}
          New script
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={title.trim().length === 0 || create.isPending}
          onClick={() => {
            setCreating("whiteboard");
            create.mutate({
              title: title.trim(),
              type: "whiteboard",
              visibility: "team",
              template: "blank",
            });
          }}
        >
          {create.isPending && creating === "whiteboard" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Presentation className="size-3.5" />
          )}
          New board
        </Button>
      </div>

      {docs.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <FileText className="size-3.5" />
              Scripts & notes
            </h3>
            {scripts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Nothing written yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {scripts.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => setOpenId(d.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-foreground/30"
                    >
                      <span className="min-w-0 truncate font-medium">{d.title}</span>
                      <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                        {relativeTime(d.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Presentation className="size-3.5" />
              Whiteboards
            </h3>
            {boards.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                No boards yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {boards.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/documents/${d.id}`}
                      target="_blank"
                      rel="noopener"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/30"
                    >
                      <span className="min-w-0 truncate font-medium">{d.title}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[0.65rem] text-muted-foreground">
                        {relativeTime(d.updatedAt)}
                        <ExternalLink className="size-3" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** The in-game script editor: a focused page with debounced autosave. */
function ScriptEditor({ docId, onBack }: { docId: string; onBack: () => void }) {
  const doc = trpc.document.byId.useQuery({ id: docId });
  const save = trpc.document.updateContent.useMutation();
  const [value, setValue] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (doc.data && value === null) setValue(doc.data.content ?? "");
  }, [doc.data, value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate({ id: docId, content: v }, { onSuccess: () => setSaved(true) });
    }, 800);
  };

  if (doc.isLoading || value === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All documents
        </button>
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-[0.65rem] uppercase",
            saved ? "text-success" : "text-muted-foreground",
          )}
        >
          {saved ? <Check className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
          {saved ? "saved" : "saving"}
        </span>
      </div>
      <h3 className="font-display text-lg font-semibold">{doc.data?.title}</h3>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!doc.data?.canEdit}
        placeholder="INT. STUDIO — DAY&#10;&#10;Write the script here. It autosaves."
        className="min-h-[46vh] flex-1 resize-none font-mono text-sm leading-relaxed"
      />
    </div>
  );
}
