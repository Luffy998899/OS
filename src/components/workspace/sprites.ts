// Sprite factory for the first-person floor.
//
// The renderer works on a raw pixel buffer, so everything drawn in the world has
// to arrive as pixels: characters, boards, props. Each one is painted once into
// an offscreen canvas, read back as a Uint32 view and cached — after the first
// frame, drawing a crewmate is a memory copy with a depth test.

import type { Character } from "@/lib/characters";

export type SpriteBitmap = { w: number; h: number; px: Uint32Array };

/** 0 facing you, 1 their left side, 2 their back, 3 their right side. */
export type Orientation = 0 | 1 | 2 | 3;

const CHAR_W = 52;
const CHAR_H = 64;
const cache = new Map<string, SpriteBitmap>();

function bake(
  key: string,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): SpriteBitmap {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { w: 1, h: 1, px: new Uint32Array(1) };
  paint(ctx);
  const image = ctx.getImageData(0, 0, w, h);
  const bitmap: SpriteBitmap = { w, h, px: new Uint32Array(image.data.buffer.slice(0)) };
  cache.set(key, bitmap);
  return bitmap;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

export function crewSprite(
  character: Character,
  orientation: Orientation,
  status: string,
): SpriteBitmap {
  return bake(
    `crew:${character.id}:${orientation}:${status}`,
    CHAR_W,
    CHAR_H,
    (ctx) => paintCrewmate(ctx, character, orientation, status),
  );
}

function paintCrewmate(
  ctx: CanvasRenderingContext2D,
  c: Character,
  orientation: Orientation,
  status: string,
) {
  const side = orientation === 1 || orientation === 3;
  const back = orientation === 2;
  const flip = orientation === 3;

  ctx.save();
  if (flip) {
    ctx.translate(CHAR_W, 0);
    ctx.scale(-1, 1);
  }

  const cx = CHAR_W / 2;
  const bodyTop = 14;
  const bodyBottom = 56;
  const bodyW = side ? 24 : 30;

  // Legs first so the suit overlaps them.
  ctx.fillStyle = c.suitDark;
  if (side) {
    roundRect(ctx, cx - 10, bodyBottom - 4, 10, 12, 3);
    roundRect(ctx, cx + 2, bodyBottom - 4, 9, 11, 3);
  } else {
    roundRect(ctx, cx - 11, bodyBottom - 4, 10, 12, 3);
    roundRect(ctx, cx + 1, bodyBottom - 4, 10, 12, 3);
  }

  // Backpack — the silhouette cue that tells you which way someone is facing.
  ctx.fillStyle = c.suitDark;
  if (side) {
    roundRect(ctx, cx + bodyW / 2 - 4, bodyTop + 10, 11, 22, 5);
  } else if (back) {
    roundRect(ctx, cx - 11, bodyTop + 8, 22, 26, 7);
  }

  // Body: a bean. Wider at the shoulders, tucked at the feet.
  const grad = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
  grad.addColorStop(0, c.suitLight);
  grad.addColorStop(0.45, c.suit);
  grad.addColorStop(1, c.suitDark);
  ctx.fillStyle = grad;
  roundRect(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyBottom - bodyTop, bodyW / 2.2);

  // Suit trim across the chest.
  ctx.fillStyle = c.suitLight;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(cx - bodyW / 2 + 2, bodyTop + 26, bodyW - 4, 2);
  ctx.globalAlpha = 1;

  if (back) {
    ctx.fillStyle = c.suitDark;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx - 1.5, bodyTop + 6, 3, 22);
    ctx.globalAlpha = 1;
  } else {
    // Visor
    const vw = side ? 13 : 19;
    const vx = side ? cx - bodyW / 2 - 1 : cx - vw / 2;
    ctx.fillStyle = "#2b3038";
    roundRect(ctx, vx - 1.5, bodyTop + 5.5, vw + 3, 14, 6);
    const vg = ctx.createLinearGradient(vx, bodyTop + 6, vx + vw, bodyTop + 19);
    vg.addColorStop(0, "#ffffff");
    vg.addColorStop(0.35, c.visor);
    vg.addColorStop(1, "#7f9aad");
    ctx.fillStyle = vg;
    roundRect(ctx, vx, bodyTop + 7, vw, 11, 5);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    roundRect(ctx, vx + 2, bodyTop + 8.5, vw * 0.32, 3.5, 2);
  }

  paintAccessory(ctx, c, cx, bodyTop, side, back);

  // Status pip on the shoulder — readable across the floor at a glance.
  ctx.fillStyle = STATUS_PIP[status] ?? STATUS_PIP.away;
  ctx.beginPath();
  ctx.arc(cx + bodyW / 2 - 4, bodyTop + 24, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Contact shadow so they sit on the floor instead of hovering over it.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, CHAR_H - 2, 15, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const STATUS_PIP: Record<string, string> = {
  online: "#4fae5a",
  busy: "#e0a13a",
  away: "#9a9384",
};

function paintAccessory(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  bodyTop: number,
  side: boolean,
  back: boolean,
) {
  ctx.fillStyle = c.accessoryColor;
  ctx.strokeStyle = c.accessoryColor;
  const top = bodyTop;

  switch (c.accessory) {
    case "antenna":
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, top + 1);
      ctx.quadraticCurveTo(cx + 4, top - 8, cx + 1, top - 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 1, top - 13, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cap":
      roundRect(ctx, cx - 13, top - 5, 26, 8, 4);
      if (!back) ctx.fillRect(cx - 2, top + 1, 16, 3);
      break;
    case "headset":
      roundRect(ctx, cx - 15, top - 3, 5, 12, 2);
      roundRect(ctx, cx + 10, top - 3, 5, 12, 2);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, top + 2, 14, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    case "crown":
      ctx.beginPath();
      ctx.moveTo(cx - 10, top);
      ctx.lineTo(cx - 10, top - 9);
      ctx.lineTo(cx - 5, top - 4);
      ctx.lineTo(cx, top - 11);
      ctx.lineTo(cx + 5, top - 4);
      ctx.lineTo(cx + 10, top - 9);
      ctx.lineTo(cx + 10, top);
      ctx.closePath();
      ctx.fill();
      break;
    case "bandana":
      roundRect(ctx, cx - 13, top + 1, 26, 5, 2);
      ctx.beginPath();
      ctx.moveTo(cx - 12, top + 4);
      ctx.lineTo(cx - 19, top + 10);
      ctx.lineTo(cx - 12, top + 9);
      ctx.closePath();
      ctx.fill();
      break;
    case "horns":
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + dir * 9, top + 1);
        ctx.quadraticCurveTo(cx + dir * 16, top - 6, cx + dir * 11, top - 10);
        ctx.quadraticCurveTo(cx + dir * 12, top - 3, cx + dir * 6, top + 1);
        ctx.fill();
      }
      break;
    case "halo":
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, top - 10, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "bun":
      ctx.beginPath();
      ctx.arc(cx + (side ? 8 : 0), top - 4, 6.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "beanie":
      roundRect(ctx, cx - 12, top - 6, 24, 10, 5);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(cx - 12, top + 1, 24, 3);
      break;
    case "shades":
      if (!back) {
        roundRect(ctx, cx - 11, top + 8, 22, 6, 2);
        ctx.fillRect(cx - 1, top + 9, 2, 3);
      }
      break;
    case "tuft":
      for (const dx of [-5, 0, 5]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx, top + 2);
        ctx.lineTo(cx + dx + 2, top - 7);
        ctx.lineTo(cx + dx + 4, top + 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "visor-lamp":
      ctx.beginPath();
      ctx.arc(cx + (side ? -9 : 0), top + 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(cx + (side ? -9 : 0), top + 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "flower":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + 7 + Math.cos(a) * 4, top - 3 + Math.sin(a) * 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(cx + 7, top - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "none":
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** A room's mission board: sticky notes on a stand, lit up when work is waiting. */
export function missionBoardSprite(opts: {
  accent: string;
  missions: number;
  bounties: number;
  highlighted: boolean;
}): SpriteBitmap {
  const notes = Math.min(6, opts.missions);
  const key = `board:${opts.accent}:${notes}:${Math.min(3, opts.bounties)}:${opts.highlighted}`;
  return bake(key, 64, 96, (ctx) => {
    // Legs
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(20, 70, 5, 26);
    ctx.fillRect(39, 70, 5, 26);
    ctx.fillRect(14, 92, 36, 4);

    if (opts.highlighted) {
      ctx.fillStyle = "rgba(255, 214, 102, 0.28)";
      roundRect(ctx, 2, 2, 60, 74, 8);
    }

    // Frame + surface
    ctx.fillStyle = "#6b6152";
    roundRect(ctx, 6, 6, 52, 66, 4);
    ctx.fillStyle = "#f7f2e6";
    roundRect(ctx, 9, 9, 46, 60, 2);

    // Accent header
    ctx.fillStyle = opts.accent;
    ctx.fillRect(9, 9, 46, 8);

    // Sticky notes, one per open mission
    const palette = ["#ffd166", "#8fd3e6", "#f0a5b8", "#b6e08f"];
    for (let i = 0; i < notes; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      ctx.fillStyle = palette[i % palette.length];
      roundRect(ctx, 13 + col * 15, 22 + row * 16, 12, 12, 1.5);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(15 + col * 15, 25 + row * 16, 8, 1);
      ctx.fillRect(15 + col * 15, 28 + row * 16, 6, 1);
    }
    if (notes === 0) {
      ctx.fillStyle = "#cfc8b8";
      ctx.fillRect(16, 30, 32, 2);
      ctx.fillRect(16, 38, 24, 2);
    }

    // Bounty flags pinned to the corner
    for (let i = 0; i < Math.min(3, opts.bounties); i++) {
      ctx.fillStyle = "#e0574f";
      ctx.beginPath();
      ctx.moveTo(48, 20 + i * 9);
      ctx.lineTo(58, 23 + i * 9);
      ctx.lineTo(48, 26 + i * 9);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** The bounty board itself — the wall everyone walks to when they need work. */
export function bountyBoardSprite(open: number, hot: boolean): SpriteBitmap {
  const posters = Math.min(6, open);
  return bake(`bounty:${posters}:${hot}`, 88, 112, (ctx) => {
    ctx.fillStyle = "#4b4338";
    ctx.fillRect(14, 84, 7, 28);
    ctx.fillRect(67, 84, 7, 28);
    ctx.fillRect(8, 108, 72, 4);

    if (hot) {
      ctx.fillStyle = "rgba(224, 87, 79, 0.25)";
      roundRect(ctx, 0, 0, 88, 92, 10);
    }

    // Cork board
    ctx.fillStyle = "#7a5c3a";
    roundRect(ctx, 4, 4, 80, 84, 5);
    ctx.fillStyle = "#c79a63";
    roundRect(ctx, 8, 8, 72, 76, 3);

    // Header plate
    ctx.fillStyle = "#26241f";
    ctx.fillRect(8, 8, 72, 14);
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOUNTIES", 44, 18);

    // Pinned posters
    for (let i = 0; i < posters; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 12 + col * 23;
      const y = 27 + row * 28;
      ctx.save();
      ctx.translate(x + 10, y + 12);
      ctx.rotate(((i % 3) - 1) * 0.06);
      ctx.fillStyle = "#fdfbf5";
      roundRect(ctx, -10, -12, 20, 24, 1.5);
      ctx.fillStyle = i === 0 && hot ? "#e0574f" : "#9a9384";
      ctx.fillRect(-7, -9, 14, 3);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      for (let l = 0; l < 4; l++) ctx.fillRect(-7, -3 + l * 3, l === 3 ? 8 : 14, 1);
      ctx.fillStyle = "#e0574f";
      ctx.beginPath();
      ctx.arc(0, -11, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (posters === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("board is clear", 44, 52);
    }
  });
}

export function plantSprite(variant: number): SpriteBitmap {
  return bake(`plant:${variant}`, 40, 56, (ctx) => {
    ctx.fillStyle = "#a3714a";
    ctx.beginPath();
    ctx.moveTo(13, 38);
    ctx.lineTo(27, 38);
    ctx.lineTo(25, 55);
    ctx.lineTo(15, 55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a5c3a";
    ctx.fillRect(12, 36, 16, 4);
    const greens = ["#4a8f57", "#5da368", "#3d7a49"];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42 + (variant % 3) * 0.08;
      ctx.fillStyle = greens[i % greens.length];
      ctx.save();
      ctx.translate(20, 37);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -14, 4.5, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

export function monitorSprite(accent: string): SpriteBitmap {
  return bake(`monitor:${accent}`, 36, 30, (ctx) => {
    ctx.fillStyle = "#3a3940";
    roundRect(ctx, 3, 1, 30, 20, 2);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(5, 3, 26, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 4; i++) ctx.fillRect(7, 6 + i * 3, 14 + ((i * 5) % 9), 1.5);
    ctx.fillStyle = "#2b2a30";
    ctx.fillRect(16, 21, 4, 6);
    ctx.fillRect(10, 27, 16, 3);
  });
}

export function coolerSprite(): SpriteBitmap {
  return bake("cooler", 32, 60, (ctx) => {
    ctx.fillStyle = "#dfe9ee";
    roundRect(ctx, 8, 2, 16, 22, 4);
    ctx.fillStyle = "#8fd3e6";
    roundRect(ctx, 10, 5, 12, 17, 3);
    ctx.fillStyle = "#f2f0ea";
    roundRect(ctx, 6, 24, 20, 34, 3);
    ctx.fillStyle = "#5a6570";
    ctx.fillRect(13, 32, 6, 5);
  });
}

export function clearSpriteCache() {
  cache.clear();
}
