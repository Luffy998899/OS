"use client";

// Placing a district.
//
// A district is a building or a room somebody wrote down once — Dev City, the
// video bay, the managing heads room. Nothing appears in the world unless an
// admin puts it there, and once it is down it is ordinary blocks: editable,
// movable, deletable, exactly like anything laid by hand.

import { useState } from "react";
import { Building2, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export type DistrictOption = {
  key: string;
  label: string;
  blurb: string;
  size: { w: number; h: number; d: number };
};

export function DistrictPicker({
  districts,
  at,
  busy,
  onClose,
  onPlace,
}: {
  districts: DistrictOption[];
  /** Where the builder is standing — the default corner to build from. */
  at: { x: number; y: number; z: number };
  busy: boolean;
  onClose: () => void;
  onPlace: (key: string, origin: { x: number; y: number; z: number }) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const district = districts.find((d) => d.key === chosen) ?? null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-background text-foreground shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Building2 className="size-4 text-[#7cc4ff]" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">Place a district</h2>
            <p className="truncate text-xs text-muted-foreground">
              It lands with its north-west corner where you are standing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase hover:text-foreground"
          >
            esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {districts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to place.</p>
          ) : null}
          {districts.map((d) => (
            <button
              key={d.key}
              onClick={() => setChosen(d.key)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                chosen === d.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground/50 hover:bg-muted",
              )}
            >
              <p className="text-sm font-medium">{d.label}</p>
              <p
                className={cn(
                  "text-[0.68rem]",
                  chosen === d.key ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {d.blurb}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-[0.6rem]",
                  chosen === d.key ? "text-background/60" : "text-muted-foreground/70",
                )}
              >
                {d.size.w} × {d.size.h} × {d.size.d}
              </p>
            </button>
          ))}

          {district ? (
            <p className="rounded-lg border border-[#d19a2a]/40 px-3 py-2 text-xs text-[#d19a2a]">
              Anything already standing inside {district.size.w} × {district.size.d} blocks
              from here gets replaced. Placing the same district again re-cuts it rather
              than layering on top.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          <p className="font-mono text-[0.65rem] text-muted-foreground">
            {at.x}, {at.y}, {at.z}
          </p>
          <button
            onClick={() => district && onPlace(district.key, at)}
            disabled={!district || busy}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MapPin className="size-3.5" />
            )}
            Build it here
          </button>
        </div>
      </div>
    </div>
  );
}
