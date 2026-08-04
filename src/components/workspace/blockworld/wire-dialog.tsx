"use client";

// Wiring a block to the Work OS.
//
// This is what makes a built office more than scenery. Aim at any block in
// build mode, press R, and choose what pressing E on it should open — a task
// wall, a client's booth, the bell schedule. The block keeps its material and
// gains a job.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Unplug, Zap } from "lucide-react";
import { BLOCKS } from "@/lib/blockworld/blocks";
import {
  bindingToPoi,
  CREATIVE_DOORS,
  PANEL_CATALOG,
  panelMeta,
  type PanelMeta,
} from "@/lib/blockworld/panels";
import type { Poi } from "@/lib/blockworld/types";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export type WireCell = { x: number; y: number; z: number; blockId: number };

export function WireDialog({
  cell,
  existing,
  onClose,
  onSave,
  onUnwire,
  saving,
}: {
  cell: WireCell;
  /** The binding already on this block, if it has one. */
  existing: Poi | null;
  onClose: () => void;
  onSave: (poi: NonNullable<ReturnType<typeof bindingToPoi>>) => void;
  onUnwire: () => void;
  saving: boolean;
}) {
  const [panel, setPanel] = useState<string | null>(existing?.panel ?? null);
  const [refId, setRefId] = useState<string | null>(existing?.refId ?? null);
  const [label, setLabel] = useState(existing?.label ?? "");
  const targets = trpc.world.targets.useQuery(undefined, { staleTime: 60_000 });

  const meta: PanelMeta | null = panel ? panelMeta(panel) : null;

  // Switching panel invalidates whatever the old one pointed at, and the
  // label follows the catalogue until the builder types their own.
  const choose = (m: PanelMeta) => {
    setPanel(m.panel);
    setRefId(null);
    setLabel((cur) => {
      const wasDefault = !cur.trim() || PANEL_CATALOG.some((p) => p.label === cur);
      return wasDefault ? m.label : cur;
    });
  };

  const options = useMemo(() => {
    if (!meta) return [];
    switch (meta.target) {
      case "room":
        return targets.data?.rooms ?? [];
      case "client":
        return targets.data?.clients ?? [];
      case "project":
        return targets.data?.projects ?? [];
      case "creativeDoor":
        return CREATIVE_DOORS;
      default:
        return [];
    }
  }, [meta, targets.data]);

  const ready = panel ? bindingToPoi(cell, panel, refId, label) : null;

  const block = BLOCKS[cell.blockId];

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background text-foreground shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Zap className="size-4 text-[#d19a2a]" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">Wire this block</h2>
            <p className="truncate text-xs text-muted-foreground">
              {block?.label ?? "Block"} at {cell.x}, {cell.y}, {cell.z}
              {existing ? ` — currently opens ${existing.label}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase hover:text-foreground"
          >
            esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className="mb-2 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
              What should E open?
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PANEL_CATALOG.map((p) => (
                <button
                  key={p.panel}
                  onClick={() => choose(p)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    panel === p.panel
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50 hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">{p.label}</p>
                  <p
                    className={cn(
                      "text-[0.68rem]",
                      panel === p.panel ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {p.blurb}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {meta && meta.target !== "none" ? (
            <div>
              <p className="mb-2 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                Which {meta.target === "creativeDoor" ? "wing" : meta.target}?
              </p>
              {targets.isLoading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to point at yet — add a {meta.target} in the CRM first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {options.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setRefId(t.id);
                        setLabel((cur) =>
                          !cur.trim() || PANEL_CATALOG.some((p) => p.label === cur) ? t.name : cur,
                        );
                      }}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors",
                        refId === t.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/50",
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {panel ? (
            <div>
              <p className="mb-2 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                Sign on it
              </p>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={48}
                placeholder={meta?.label ?? "Label"}
                className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">
                This is the prompt you see when you walk up to it.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {existing ? (
            <button
              onClick={onUnwire}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
            >
              <Unplug className="size-3.5" />
              Unwire
            </button>
          ) : null}
          <button
            onClick={() => ready && onSave(ready)}
            disabled={!ready || saving}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {existing ? "Rewire" : "Wire it up"}
          </button>
        </div>
      </div>
    </div>
  );
}
