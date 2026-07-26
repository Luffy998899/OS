"use client";

import { useEffect, useRef } from "react";
import type { Character } from "@/lib/characters";
import { crewSprite, type Orientation } from "./sprites";
import { cn } from "@/lib/utils";

/**
 * Renders the exact sprite the 3D floor draws, so the crewmate on your profile
 * card is the crewmate people see walking past them.
 */
export function CrewmateAvatar({
  character,
  size = 64,
  orientation = 0,
  status = "online",
  className,
}: {
  character: Character;
  size?: number;
  orientation?: Orientation;
  status?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bitmap = crewSprite(character, orientation, status);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(size * (bitmap.w / bitmap.h));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${size}px`;

    const image = ctx.createImageData(bitmap.w, bitmap.h);
    new Uint32Array(image.data.buffer).set(bitmap.px);
    const off = document.createElement("canvas");
    off.width = bitmap.w;
    off.height = bitmap.h;
    off.getContext("2d")?.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [character, size, orientation, status]);

  return (
    <canvas
      ref={ref}
      className={cn("shrink-0", className)}
      aria-label={`${character.name} crewmate`}
    />
  );
}
