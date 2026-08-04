"use client";

// The map-design surfaces: fill a volume, letter a wall, name a room.
//
// Placing an office one block at a time is not designing a map. These are the
// tools that make the whole floorplate reachable — a two-corner fill for the
// structure, a sign for the lettering, and a region so the world knows what
// the place you built is called and which room in the CRM it is.

import { useMemo, useState } from "react";
import { Boxes, Loader2, MapPin, Type } from "lucide-react";
import { BLOCKS } from "@/lib/blockworld/blocks";
import {
  boxSize,
  boxVolume,
  FILL_MODES,
  MAX_FILL,
  type Box,
  type FillMode,
} from "@/lib/blockworld/build-ops";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const shellClass =
  "absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]";
const cardClass =
  "flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-background text-foreground shadow-2xl";
const headClass = "flex items-center gap-3 border-b border-border px-5 py-3";
const escClass =
  "ml-auto rounded px-2 py-0.5 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase hover:text-foreground";
const fieldClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";
const primaryClass =
  "ml-auto flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity disabled:opacity-40";
const labelClass =
  "mb-2 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase";

// ---------------------------------------------------------------------------

export function FillDialog({
  box,
  blockId,
  onClose,
  onFill,
}: {
  box: Box;
  /** The hotbar block, which is what a fill uses unless you change it here. */
  blockId: number;
  onClose: () => void;
  /** `raise` grows the marked box upward, so a footprint can become a room. */
  onFill: (mode: FillMode, blockId: number, raise: number) => void;
}) {
  const [mode, setMode] = useState<FillMode>("solid");
  const [id, setId] = useState(blockId);
  const [q, setQ] = useState("");
  // Corners are marked on blocks, and on a flat floor both land at the same
  // level — so the box you mark is one deep. Raising it here is how a footprint
  // becomes a room without flying up to mark the ceiling.
  const [raise, setRaise] = useState(0);
  const grown: Box = { min: box.min, max: { ...box.max, y: box.max.y + raise } };
  const size = boxSize(grown);
  const volume = boxVolume(grown);
  const tooBig = volume > MAX_FILL;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return BLOCKS.map((b, i) => ({ ...b, id: i }))
      .slice(1)
      .filter((b) => b.label.toLowerCase().includes(needle) || b.key.includes(needle))
      .slice(0, 12);
  }, [q]);

  return (
    <div className={shellClass} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cardClass}>
        <div className={headClass}>
          <Boxes className="size-4 text-[#7cc4ff]" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">Fill the selection</h2>
            <p className="truncate text-xs text-muted-foreground">
              {size.w} × {size.h} × {size.d} — {volume.toLocaleString()} blocks, from{" "}
              {grown.min.x},{grown.min.y},{grown.min.z}
            </p>
          </div>
          <button onClick={onClose} className={escClass}>
            esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className={labelClass}>What to build</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {FILL_MODES.map((m) => (
                <button
                  key={m.mode}
                  onClick={() => setMode(m.mode)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    mode === m.mode
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50 hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">{m.label}</p>
                  <p
                    className={cn(
                      "text-[0.68rem]",
                      mode === m.mode ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {m.blurb}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelClass}>
              Height — {size.h} {size.h === 1 ? "block" : "blocks"}
            </p>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={raise}
              onChange={(e) => setRaise(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              Grows the box upward from what you marked. A footprint plus four is a room.
            </p>
          </div>

          {mode !== "clear" ? (
            <div>
              <p className={labelClass}>Material — {BLOCKS[id]?.label ?? "—"}</p>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search for a different block…"
                className={fieldClass}
              />
              {matches.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {matches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setId(b.id);
                        setQ("");
                      }}
                      className="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:border-foreground"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tooBig ? (
            <p className="rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive">
              That is {volume.toLocaleString()} blocks. One fill writes at most{" "}
              {MAX_FILL.toLocaleString()} — mark a smaller box, or build it in passes.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          <p className="text-[0.68rem] text-muted-foreground">Z undoes the last one.</p>
          <button
            onClick={() => onFill(mode, id, raise)}
            disabled={tooBig}
            className={primaryClass}
          >
            <Boxes className="size-3.5" />
            {mode === "clear" ? "Clear it" : "Build it"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export type SignDraft = {
  id?: string;
  x: number;
  y: number;
  z: number;
  face: "n" | "s" | "e" | "w";
  text: string;
  size: number;
  color: string | null;
  bg: string | null;
};

const FACES: { face: SignDraft["face"]; label: string }[] = [
  { face: "n", label: "North" },
  { face: "e", label: "East" },
  { face: "s", label: "South" },
  { face: "w", label: "West" },
];

export function SignDialog({
  draft,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  draft: SignDraft;
  saving: boolean;
  onClose: () => void;
  onSave: (s: SignDraft) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(draft.text);
  const [face, setFace] = useState(draft.face);
  const [size, setSize] = useState(draft.size);

  return (
    <div className={shellClass} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cardClass}>
        <div className={headClass}>
          <Type className="size-4 text-[#ffd166]" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">
              {draft.id ? "Edit this sign" : "Letter this wall"}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              On the block at {draft.x}, {draft.y}, {draft.z}
            </p>
          </div>
          <button onClick={onClose} className={escClass}>
            esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className={labelClass}>Text</p>
            <input
              autoFocus
              value={text}
              maxLength={64}
              onChange={(e) => setText(e.target.value)}
              placeholder="RECEPTION"
              className={fieldClass}
            />
          </div>
          <div>
            <p className={labelClass}>Which way it faces</p>
            <div className="flex flex-wrap gap-1.5">
              {FACES.map((f) => (
                <button
                  key={f.face}
                  onClick={() => setFace(f.face)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs transition-colors",
                    face === f.face
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              The side a reader stands on. Aimed at a wall, this is filled in for you.
            </p>
          </div>
          <div>
            <p className={labelClass}>Height — {size.toFixed(2)} blocks</p>
            <input
              type="range"
              min={0.3}
              max={2}
              step={0.05}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {draft.id ? (
            <button
              onClick={onDelete}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <button
            onClick={() => onSave({ ...draft, text: text.trim(), face, size })}
            disabled={saving || text.trim().length === 0}
            className={primaryClass}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Type className="size-3.5" />}
            {draft.id ? "Save" : "Put it up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export type RegionDraft = {
  key: string;
  label: string;
  roomId: string | null;
  lair: boolean;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

export function RegionDialog({
  draft,
  existing,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  draft: RegionDraft;
  /** Regions already named, so a builder can re-cut one instead of duplicating it. */
  existing: { key: string; label: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: (r: RegionDraft) => void;
  onDelete: (key: string) => void;
}) {
  const [label, setLabel] = useState(draft.label);
  const [roomId, setRoomId] = useState<string | null>(draft.roomId);
  const [lair, setLair] = useState(draft.lair);
  // A volume marked on the floor is one block deep, and the people standing in
  // it are a block above that — so it would name nothing. Default a fresh
  // region to head height and let the builder raise the roof from there.
  const [height, setHeight] = useState(() =>
    draft.key ? draft.max.y - draft.min.y : Math.max(5, draft.max.y - draft.min.y),
  );
  const targets = trpc.world.targets.useQuery(undefined, { staleTime: 60_000 });
  const volume = { min: draft.min, max: { ...draft.max, y: draft.min.y + height } };
  const size = { ...boxSize(volume), h: height };

  // The key is what makes re-saving a region an update rather than a new one,
  // so it follows the name unless the builder is editing a region that exists.
  const key =
    draft.key ||
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  const clash = !draft.key && existing.some((r) => r.key === key);

  return (
    <div className={shellClass} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cardClass}>
        <div className={headClass}>
          <MapPin className="size-4 text-[#8fe388]" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">Name this space</h2>
            <p className="truncate text-xs text-muted-foreground">
              {size.w} × {size.h} × {size.d} from {draft.min.x},{draft.min.y},{draft.min.z}
            </p>
          </div>
          <button onClick={onClose} className={escClass}>
            esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className={labelClass}>What it is called</p>
            <input
              autoFocus
              value={label}
              maxLength={48}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Reception"
              className={fieldClass}
            />
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              Shown in the corner while you stand inside it.
            </p>
          </div>

          <div>
            <p className={labelClass}>Room it belongs to</p>
            {targets.isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setRoomId(null)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors",
                    roomId === null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50",
                  )}
                >
                  Not a room
                </button>
                {(targets.data?.rooms ?? []).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRoomId(r.id);
                      if (!label.trim()) setLabel(r.name);
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      roomId === r.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50",
                    )}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              Link it and everyone standing here counts as being in that room.
            </p>
          </div>

          <div>
            <p className={labelClass}>
              How tall — {height} {height === 1 ? "block" : "blocks"}
            </p>
            <input
              type="range"
              min={1}
              max={24}
              step={1}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              Reaches up from the floor you marked. Anyone inside counts as here.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lair} onChange={(e) => setLair(e.target.checked)} />
            The Upside Down — red light, fog and spores inside this volume
          </label>

          {clash ? (
            <p className="rounded-lg border border-[#d19a2a]/40 px-3 py-2 text-xs text-[#d19a2a]">
              A space called “{label.trim()}” already exists. Saving re-cuts it to this box.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {draft.key ? (
            <button
              onClick={() => onDelete(draft.key)}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <button
            onClick={() =>
              onSave({ ...draft, key, label: label.trim(), roomId, lair, max: volume.max })
            }
            disabled={saving || label.trim().length === 0}
            className={primaryClass}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MapPin className="size-3.5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
