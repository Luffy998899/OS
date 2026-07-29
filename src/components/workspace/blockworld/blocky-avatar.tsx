"use client";

// The lobby portrait: a chunky voxel bust painted on canvas — the same person
// you become in the world, head and shoulders, pixel by pixel.

import { useEffect, useRef } from "react";
import type { Character } from "@/lib/characters";

const STATUS_COLOR: Record<string, string> = {
  online: "#4fae5a",
  busy: "#e0a13a",
  away: "#8a8f98",
};

export function BlockyAvatar({
  character,
  size = 84,
  status = "online",
}: {
  character: Character;
  size?: number;
  status?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const G = 16; // pixel grid
    canvas.width = G;
    canvas.height = G;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, G, G);

    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };

    // Torso (shoulders up).
    px(3, 11, 10, 5, character.suit);
    px(3, 11, 10, 1, character.suitLight); // collar
    px(3, 12, 2, 4, character.suitDark); // left arm shade
    px(11, 12, 2, 4, character.suit);
    // Head.
    const skin = "#e8b98a";
    const skinShade = "#caa075";
    px(4, 2, 8, 8, skin);
    px(11, 2, 1, 8, skinShade);
    // Hair.
    px(4, 2, 8, 2, character.suitDark);
    px(4, 4, 1, 2, character.suitDark);
    // Eyes.
    px(6, 6, 1, 2, "#2b2622");
    px(9, 6, 1, 2, "#2b2622");
    px(6, 6, 1, 1, "#ffffff");
    px(9, 6, 1, 1, "#ffffff");
    // Mouth.
    px(7, 9, 2, 1, skinShade);
    // Accessory hint: a headband in the accessory color when not "none".
    if (character.accessory !== "none") {
      px(4, 3, 8, 1, character.accessoryColor);
    }
    // Status lamp on the chest.
    px(7, 13, 2, 2, STATUS_COLOR[status] ?? STATUS_COLOR.online);
  }, [character, status]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="rounded-xl border border-border bg-muted/40"
      aria-label={`${character.name} avatar`}
    />
  );
}
