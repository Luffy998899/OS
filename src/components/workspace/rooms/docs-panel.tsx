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
  Lock,
  NotebookPen,
  Presentation,
  Save,
  TriangleAlert,
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

type SaveState = "saving" | "saved" | "error";

/** The in-game script editor: debounced autosave with an explicit save path. */
function ScriptEditor({ docId, onBack }: { docId: string; onBack: () => void }) {
  const utils = trpc.useUtils();
  const doc = trpc.document.byId.useQuery({ id: docId });
  const [value, setValue] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("saved");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<string | null>(null);
  // Monotonic sequence per keystroke; only the ack for the newest edit may
  // flip the header to "saved", so a stale ack can't mask a newer failure.
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  // Newest sequence already handed to the mutation — keeps flush-on-unmount
  // from double-firing after flush-on-back; rolled back on error so retry works.
  const sentSeq = useRef(0);

  // Callbacks live on useMutation (not mutate) so they still run when the
  // flush fires during unmount cleanup.
  const save = trpc.document.updateContent.useMutation({
    onMutate: () => ({ seq: sentSeq.current }),
    onSuccess: (data, vars, ctx) => {
      if (ctx.seq < savedSeq.current) return; // an older save acked late
      savedSeq.current = ctx.seq;
      utils.document.byId.setData({ id: docId }, (prev) =>
        prev
          ? { ...prev, content: vars.content, updatedAt: new Date(data.updatedAt) }
          : prev,
      );
      utils.document.list.invalidate();
      if (ctx.seq === editSeq.current) setState("saved");
    },
    onError: (e, _vars, ctx) => {
      if (!ctx || ctx.seq === sentSeq.current) sentSeq.current = savedSeq.current;
      if (ctx && ctx.seq < editSeq.current) return; // superseded by a newer edit
      setState("error");
      toast.error(`Save failed — ${e.message}`);
    },
  });

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const v = valueRef.current;
    if (v === null) return;
    if (editSeq.current <= savedSeq.current || editSeq.current <= sentSeq.current) return;
    setState("saving");
    sentSeq.current = editSeq.current;
    save.mutate({ id: docId, content: v });
  };

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    if (doc.data && value === null) {
      setValue(doc.data.content ?? "");
      valueRef.current = doc.data.content ?? "";
    }
  }, [doc.data, value]);

  // Edits typed in the last 800ms must not die with the component: flush
  // (which also clears the timer) instead of just clearing the debounce.
  useEffect(() => {
    return () => {
      flushRef.current();
    };
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (editSeq.current <= savedSeq.current) return;
      e.preventDefault();
      e.returnValue = ""; // legacy Chrome only shows the prompt with returnValue set
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const onChange = (v: string) => {
    if (!doc.data?.canEdit) return;
    setValue(v);
    valueRef.current = v;
    editSeq.current += 1;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flush();
    }, 800);
  };

  if (doc.isLoading || value === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canEdit = doc.data?.canEdit ?? false;

  return (
    <div
      className="flex h-full flex-col gap-2"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          flush();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            flush();
            onBack();
          }}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All documents
        </button>
        {canEdit && (
          <div className="flex items-center gap-2">
            {state === "error" ? (
              <button
                onClick={flush}
                className="flex items-center gap-1 font-mono text-[0.65rem] text-destructive uppercase transition-colors hover:underline"
              >
                <TriangleAlert className="size-3" />
                not saved — retry
              </button>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1 font-mono text-[0.65rem] uppercase",
                  state === "saved" ? "text-success" : "text-muted-foreground",
                )}
              >
                {state === "saved" ? (
                  <Check className="size-3" />
                ) : (
                  <Loader2 className="size-3 animate-spin" />
                )}
                {state === "saved" ? "saved" : "saving…"}
              </span>
            )}
            <Button size="sm" disabled={state === "saved"} onClick={flush}>
              <Save className="size-3.5" />
              Save
            </Button>
          </div>
        )}
      </div>
      <h3 className="font-display text-lg font-semibold">{doc.data?.title}</h3>
      {!canEdit && (
        <p className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          View only — ask the owner for edit access
        </p>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!canEdit}
        placeholder="INT. STUDIO — DAY&#10;&#10;Write the script here. It autosaves."
        className="min-h-[46vh] flex-1 resize-none font-mono text-sm leading-relaxed"
      />
    </div>
  );
}
