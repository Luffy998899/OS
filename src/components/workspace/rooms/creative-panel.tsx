"use client";

// The creative studio: two doors (Clients / Internal), each opening onto a
// space with the brand kit pinned, the infinite board, references & reels,
// scripts, competitor moat, the monthly timeline — and a green/red zone chip
// telling you whether advance content is prepared.

import { useState } from "react";
import {
  ArrowLeft,
  DoorOpen,
  ExternalLink,
  FileText,
  Film,
  Link2,
  Loader2,
  NotebookPen,
  Palette,
  Pin,
  PinOff,
  Plus,
  Presentation,
  ShieldHalf,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ItemKind = "reference" | "reel" | "note" | "script" | "timeline";

const ITEM_META: Record<ItemKind, { label: string; icon: typeof Link2; hint: string }> = {
  reference: { label: "References", icon: Link2, hint: "Statics & carousels worth stealing from" },
  reel: { label: "Reels", icon: Film, hint: "Reference reels — drop links, drag to the board" },
  note: { label: "Notes", icon: NotebookPen, hint: "Anyone can drop a note here" },
  script: { label: "Scripts", icon: FileText, hint: "The scripts folder — always present" },
  timeline: { label: "Monthly timeline", icon: Presentation, hint: "What ships this month and next" },
};

export function CreativePanel({
  initialDoor,
  onOpenBoard,
}: {
  initialDoor: "clients" | "internal";
  onOpenBoard: (docId: string) => void;
}) {
  const [spaceKey, setSpaceKey] = useState<string | null>(
    initialDoor === "internal" ? "internal" : null,
  );
  if (spaceKey) {
    return <SpaceView spaceKey={spaceKey} onBack={() => setSpaceKey(null)} onOpenBoard={onOpenBoard} />;
  }
  return <DoorView door={initialDoor} onEnter={setSpaceKey} />;
}

function DoorView({
  door,
  onEnter,
}: {
  door: "clients" | "internal";
  onEnter: (key: string) => void;
}) {
  const doors = trpc.creative.doors.useQuery();
  const open = trpc.creative.open.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const enter = (key: string) =>
    open.mutate({ key }, { onSuccess: () => onEnter(key) });

  if (doors.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {door === "clients"
          ? "Every client has a house in here — their whole social presence gets planned inside it."
          : "Auxa's own content space."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {door === "internal" ? (
          <DoorCard
            name="Internal — Auxa"
            green={doors.data?.internal.green ?? false}
            busy={open.isPending}
            onEnter={() => enter("internal")}
          />
        ) : (doors.data?.clients.length ?? 0) === 0 ? (
          <p className="col-span-2 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No clients yet — add one from the Clients page and their house appears here.
          </p>
        ) : (
          doors.data?.clients.map((c) => (
            <DoorCard key={c.key} name={c.name} green={c.green} busy={open.isPending} onEnter={() => enter(c.key)} />
          ))
        )}
      </div>
    </div>
  );
}

function DoorCard({
  name,
  green,
  busy,
  onEnter,
}: {
  name: string;
  green: boolean;
  busy: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      disabled={busy}
      onClick={onEnter}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-foreground/30",
        green ? "border-success/40" : "border-border",
      )}
    >
      <DoorOpen className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">Brand kit · board · timeline</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase",
          green ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
        )}
        title={green ? "Advance content prepared" : "Not ahead yet — plan next month"}
      >
        {green ? "green" : "red"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function SpaceView({
  spaceKey,
  onBack,
  onOpenBoard,
}: {
  spaceKey: string;
  onBack: () => void;
  onOpenBoard: (docId: string) => void;
}) {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const space = trpc.creative.space.useQuery({ key: spaceKey });
  const refresh = () => {
    utils.creative.space.invalidate({ key: spaceKey });
    utils.creative.doors.invalidate();
  };
  const addItem = trpc.creative.addItem.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const removeItem = trpc.creative.removeItem.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const togglePin = trpc.creative.togglePin.useMutation({ onSuccess: refresh });
  const saveCompetitor = trpc.creative.setCompetitorNotes.useMutation({
    onSuccess: () => {
      toast.success("Moat pinned.");
      refresh();
    },
  });

  const s = space.data;
  if (space.isLoading || !s) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const byKind = (kind: ItemKind) => s.items.filter((i) => i.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to the doors
        </button>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase",
              s.zone === "green" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
            )}
            title={s.zoneWhy}
          >
            {s.zone} zone
          </span>
          {s.boardDocId ? (
            <Button size="xs" onClick={() => onOpenBoard(s.boardDocId!)}>
              <Presentation className="size-3" />
              Open infinite board
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold">{s.name}</h3>
        <p className="text-xs text-muted-foreground">{s.zoneWhy}</p>
      </div>

      {/* Brand kit — always pinned on top */}
      <div className="rounded-xl border border-border p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <Palette className="size-3.5 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Brand kit</h4>
          <Pin className="size-3 text-muted-foreground" />
        </div>
        {s.brandKit.colors.length === 0 && s.brandKit.links.length === 0 && s.brandKit.fonts.length === 0 ? (
          <BrandKitEditor spaceId={s.id} initial={s.brandKit} canManage={canManage} onSaved={refresh} empty />
        ) : (
          <div className="space-y-2">
            {s.brandKit.colors.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {s.brandKit.colors.map((c) => (
                  <span key={c} title={c} className="size-6 rounded-md ring-1 ring-foreground/15" style={{ background: c }} />
                ))}
              </div>
            ) : null}
            {s.brandKit.fonts.length > 0 ? (
              <p className="text-xs text-muted-foreground">Fonts: {s.brandKit.fonts.join(" · ")}</p>
            ) : null}
            {s.brandKit.links.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {s.brandKit.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    {l.label || l.url}
                  </a>
                ))}
              </div>
            ) : null}
            {canManage ? <BrandKitEditor spaceId={s.id} initial={s.brandKit} canManage onSaved={refresh} /> : null}
          </div>
        )}
      </div>

      {/* Competitor research & moat — done once, pinned forever */}
      <div className="rounded-xl border border-border p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <ShieldHalf className="size-3.5 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Competitor research & moat</h4>
          <Pin className="size-3 text-muted-foreground" />
        </div>
        {canManage ? (
          <CompetitorEditor
            initial={s.competitorNotes ?? ""}
            saving={saveCompetitor.isPending}
            onSave={(notes) => saveCompetitor.mutate({ spaceId: s.id, notes })}
          />
        ) : s.competitorNotes ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{s.competitorNotes}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not researched yet.</p>
        )}
      </div>

      {/* Item rails */}
      <div className="grid gap-3 lg:grid-cols-2">
        {(Object.keys(ITEM_META) as ItemKind[]).map((kind) => (
          <ItemRail
            key={kind}
            kind={kind}
            items={byKind(kind)}
            months={s.months}
            busy={addItem.isPending}
            onAdd={(payload) => addItem.mutate({ spaceId: s.id, kind, ...payload })}
            onRemove={(id) => removeItem.mutate({ id })}
            onPin={(id) => togglePin.mutate({ id })}
          />
        ))}
      </div>
    </div>
  );
}

function ItemRail({
  kind,
  items,
  months,
  busy,
  onAdd,
  onRemove,
  onPin,
}: {
  kind: ItemKind;
  items: { id: string; title: string; url: string | null; content: string | null; monthKey: string | null; pinned: boolean; createdAt: Date | string }[];
  months: string[];
  busy: boolean;
  onAdd: (payload: { title: string; url?: string; content?: string; monthKey?: string }) => void;
  onRemove: (id: string) => void;
  onPin: (id: string) => void;
}) {
  const meta = ITEM_META[kind];
  const Icon = meta.icon;
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [monthKey, setMonthKey] = useState(months[0] ?? "");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      url: url.trim() || undefined,
      monthKey: kind === "timeline" ? monthKey : undefined,
    });
    setTitle("");
    setUrl("");
  };

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <h4 className="text-sm font-semibold">{meta.label}</h4>
        <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">{meta.hint}</p>
      ) : (
        <ul className="mb-2 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="group flex items-center gap-1.5 text-sm">
              {item.pinned ? <Pin className="size-3 shrink-0 text-warning" /> : null}
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                  {item.title}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              )}
              {kind === "timeline" && item.monthKey ? (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                  {item.monthKey}
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                  {relativeTime(item.createdAt)}
                </span>
              )}
              <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onPin(item.id)}>
                  {item.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </button>
                <button className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={() => onRemove(item.id)}>
                  <Trash2 className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={kind === "timeline" ? "Deliverable…" : `Add ${meta.label.toLowerCase().replace(/s$/, "")}…`}
          className="h-8 flex-1 text-xs"
        />
        {kind === "reference" || kind === "reel" || kind === "script" ? (
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="URL" className="h-8 w-28 text-xs" />
        ) : null}
        {kind === "timeline" ? (
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-1.5 font-mono text-xs"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
        <Button size="icon-sm" variant="outline" disabled={busy || !title.trim()} onClick={submit}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function BrandKitEditor({
  spaceId,
  initial,
  canManage,
  onSaved,
  empty,
}: {
  spaceId: string;
  initial: { colors: string[]; fonts: string[]; links: { label: string; url: string }[] };
  canManage: boolean;
  onSaved: () => void;
  empty?: boolean;
}) {
  const [editing, setEditing] = useState(!!empty);
  const [colors, setColors] = useState(initial.colors.join(", "));
  const [fonts, setFonts] = useState(initial.fonts.join(", "));
  const [links, setLinks] = useState(initial.links.map((l) => `${l.label} | ${l.url}`).join("\n"));
  const save = trpc.creative.setBrandKit.useMutation({
    onSuccess: () => {
      toast.success("Brand kit pinned.");
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!canManage) {
    return empty ? <p className="text-xs text-muted-foreground">No brand kit pinned yet.</p> : null;
  }
  if (!editing) {
    return (
      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
        Edit brand kit
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Colours: #1a1a2e, #e94560, …" className="h-8 font-mono text-xs" />
      <Input value={fonts} onChange={(e) => setFonts(e.target.value)} placeholder="Fonts: Archivo, Inter" className="h-8 text-xs" />
      <Textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        rows={2}
        placeholder={"Logo pack | https://drive…\nGuidelines | https://figma…"}
        className="font-mono text-xs"
      />
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              spaceId,
              colors: colors.split(",").map((c) => c.trim()).filter(Boolean),
              fonts: fonts.split(",").map((f) => f.trim()).filter(Boolean),
              links: links
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line) => {
                  const [label, url] = line.split("|").map((s) => s.trim());
                  return { label: label ?? "", url: url ?? label ?? "" };
                }),
            })
          }
        >
          Save kit
        </Button>
      </div>
    </div>
  );
}

function CompetitorEditor({
  initial,
  saving,
  onSave,
}: {
  initial: string;
  saving: boolean;
  onSave: (notes: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-1.5">
      <Textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Who they're up against, what the moat is, done once and kept current."
        className="text-xs"
      />
      <div className="flex justify-end">
        <Button size="xs" disabled={saving || value === initial} onClick={() => onSave(value)}>
          Pin it
        </Button>
      </div>
    </div>
  );
}
