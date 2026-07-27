// Sprite factory for the first-person floor — v2.
//
// v1 crewmates were flat paper cutouts; v2 draws proper outlined capsule
// crewmates (think crew of a cartoon space station): two-tone suit shading, a
// glass visor with a glare, a backpack that tells you which way someone faces,
// four walk frames, and headgear per character. Props got the same treatment —
// every room's furniture is drawn here once, cached as pixels, and blitted by
// the renderer with depth testing.

import type { Character } from "@/lib/characters";

export type SpriteBitmap = { w: number; h: number; px: Uint32Array };

/** 0 facing you, 1 their left side, 2 their back, 3 their right side. */
export type Orientation = 0 | 1 | 2 | 3;
/** 0 idle · 1 step A · 2 pass · 3 step B */
export type WalkFrame = 0 | 1 | 2 | 3;

const CHAR_W = 76;
const CHAR_H = 96;
const OUTLINE = "#26211b";

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
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  paint(ctx);
  const image = ctx.getImageData(0, 0, w, h);
  const bitmap: SpriteBitmap = { w, h, px: new Uint32Array(image.data.buffer.slice(0)) };
  cache.set(key, bitmap);
  return bitmap;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function outlined(
  ctx: CanvasRenderingContext2D,
  fill: string,
  draw: () => void,
  lineWidth = 2.5,
) {
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

const STATUS_PIP: Record<string, string> = {
  online: "#4fae5a",
  busy: "#e0a13a",
  away: "#9a9384",
};

// ---------------------------------------------------------------------------
// Crew v2
// ---------------------------------------------------------------------------

export function crewSprite(
  character: Character,
  orientation: Orientation,
  status: string,
  frame: WalkFrame = 0,
): SpriteBitmap {
  return bake(
    `crew2:${character.id}:${orientation}:${status}:${frame}`,
    CHAR_W,
    CHAR_H,
    (ctx) => paintCrewmate(ctx, character, orientation, status, frame),
  );
}

function paintCrewmate(
  ctx: CanvasRenderingContext2D,
  c: Character,
  orientation: Orientation,
  status: string,
  frame: WalkFrame,
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
  const bodyW = side ? 34 : 44;
  const bodyTop = 14;
  const bodyBottom = 80;
  // Walk cycle: legs swap, body dips a hair on the passing frame.
  const stride = frame === 1 ? 5 : frame === 3 ? -5 : 0;
  const dip = frame === 2 ? 1.5 : 0;

  // Contact shadow
  ctx.fillStyle = "rgba(20,16,10,0.30)";
  ctx.beginPath();
  ctx.ellipse(cx, CHAR_H - 4, 19, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs — stubby boots under the capsule; the striding boot lifts a little.
  const legY = bodyBottom - 6 + dip;
  const legH = CHAR_H - 8 - legY;
  const liftL = Math.max(0, stride);
  const liftR = Math.max(0, -stride);
  outlined(ctx, c.suitDark, () => rr(ctx, cx - (side ? 12 : 15), legY, 13, legH - liftL, 5), 2);
  outlined(ctx, c.suitDark, () => rr(ctx, cx + (side ? -1 : 2), legY, 13, legH - liftR, 5), 2);

  // Backpack: the silhouette cue. Back view wears it front-and-centre; side
  // view carries the tank on the trailing edge.
  if (back) {
    outlined(ctx, c.suitDark, () => rr(ctx, cx - 16, bodyTop + 14, 32, 40, 9));
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    rr(ctx, cx - 12, bodyTop + 18, 10, 32, 5);
    ctx.fill();
  } else if (side) {
    outlined(ctx, c.suitDark, () => rr(ctx, cx + bodyW / 2 - 6, bodyTop + 16, 14, 34, 6));
  }

  // Body — the capsule. Gradient does the studio lighting.
  const grad = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
  grad.addColorStop(0, c.suitLight);
  grad.addColorStop(0.42, c.suit);
  grad.addColorStop(1, c.suitDark);
  rr(ctx, cx - bodyW / 2, bodyTop + dip, bodyW, bodyBottom - bodyTop, bodyW / 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Belly highlight + belt.
  if (!back) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx - bodyW * 0.16, bodyTop + 40 + dip, bodyW * 0.24, 16, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(cx - bodyW / 2 + 3, bodyTop + 46 + dip, bodyW - 6, 3.5);

  // Arm mitt — swings opposite the near leg.
  const armSwing = frame === 1 ? 4 : frame === 3 ? -4 : 0;
  if (side) {
    outlined(ctx, c.suit, () => rr(ctx, cx - bodyW / 2 - 5, bodyTop + 28 + armSwing + dip, 12, 22, 6), 2);
  } else {
    outlined(ctx, c.suit, () => rr(ctx, cx - bodyW / 2 - 6, bodyTop + 26 + armSwing + dip, 11, 24, 6), 2);
    outlined(ctx, c.suit, () => rr(ctx, cx + bodyW / 2 - 5, bodyTop + 26 - armSwing + dip, 11, 24, 6), 2);
  }

  // Visor — the face of the whole design. Glass, tint, one hard glare.
  if (!back) {
    const vw = side ? 20 : 30;
    const vh = 17;
    const vx = side ? cx - bodyW / 2 - 3 : cx - vw / 2;
    const vy = bodyTop + 10 + dip;
    outlined(ctx, "#20242c", () => rr(ctx, vx - 2, vy - 2, vw + 4, vh + 4, 8), 2);
    const vg = ctx.createLinearGradient(vx, vy, vx + vw * 0.6, vy + vh);
    vg.addColorStop(0, "#ffffff");
    vg.addColorStop(0.3, c.visor);
    vg.addColorStop(1, shade(c.visor, -46));
    ctx.fillStyle = vg;
    rr(ctx, vx, vy, vw, vh, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    rr(ctx, vx + 3, vy + 2.5, vw * 0.34, 4.5, 2.5);
    ctx.fill();
  }

  paintAccessory(ctx, c, cx, bodyTop + dip, side, back);

  // Status pip.
  ctx.beginPath();
  ctx.arc(cx + bodyW / 2 - 2, bodyTop + 6 + dip, 4, 0, Math.PI * 2);
  ctx.fillStyle = STATUS_PIP[status] ?? STATUS_PIP.away;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/** Lighten (+) or darken (−) a hex colour. */
function shade(hex: string, amt: number): string {
  const v = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (v & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function paintAccessory(
  ctx: CanvasRenderingContext2D,
  c: Character,
  cx: number,
  top: number,
  side: boolean,
  back: boolean,
) {
  ctx.fillStyle = c.accessoryColor;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;

  switch (c.accessory) {
    case "antenna":
      ctx.beginPath();
      ctx.moveTo(cx, top + 2);
      ctx.quadraticCurveTo(cx + 5, top - 9, cx + 2, top - 14);
      ctx.strokeStyle = c.accessoryColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      outlined(ctx, c.accessoryColor, () => {
        ctx.beginPath();
        ctx.arc(cx + 2, top - 16, 4, 0, Math.PI * 2);
      }, 1.5);
      break;
    case "cap":
      outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 16, top - 7, 32, 10, 5), 2);
      if (!back) outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 2, top + 1, 20, 4.5, 2), 1.5);
      break;
    case "headset":
      outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 19, top - 2, 7, 14, 3), 1.5);
      outlined(ctx, c.accessoryColor, () => rr(ctx, cx + 12, top - 2, 7, 14, 3), 1.5);
      ctx.strokeStyle = c.accessoryColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, top + 4, 17, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      break;
    case "crown":
      outlined(ctx, c.accessoryColor, () => {
        ctx.beginPath();
        ctx.moveTo(cx - 12, top - 1);
        ctx.lineTo(cx - 12, top - 11);
        ctx.lineTo(cx - 6, top - 5);
        ctx.lineTo(cx, top - 13);
        ctx.lineTo(cx + 6, top - 5);
        ctx.lineTo(cx + 12, top - 11);
        ctx.lineTo(cx + 12, top - 1);
        ctx.closePath();
      }, 1.5);
      break;
    case "bandana":
      outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 16, top + 1, 32, 6, 3), 1.5);
      outlined(ctx, c.accessoryColor, () => {
        ctx.beginPath();
        ctx.moveTo(cx - 14, top + 5);
        ctx.lineTo(cx - 23, top + 12);
        ctx.lineTo(cx - 14, top + 10);
        ctx.closePath();
      }, 1.5);
      break;
    case "horns":
      for (const dir of [-1, 1]) {
        outlined(ctx, c.accessoryColor, () => {
          ctx.beginPath();
          ctx.moveTo(cx + dir * 11, top + 1);
          ctx.quadraticCurveTo(cx + dir * 19, top - 7, cx + dir * 13, top - 13);
          ctx.quadraticCurveTo(cx + dir * 14, top - 4, cx + dir * 7, top + 1);
          ctx.closePath();
        }, 1.5);
      }
      break;
    case "halo":
      ctx.strokeStyle = c.accessoryColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, top - 12, 12, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "bun":
      outlined(ctx, c.accessoryColor, () => {
        ctx.beginPath();
        ctx.arc(cx + (side ? 10 : 0), top - 5, 7.5, 0, Math.PI * 2);
      }, 1.5);
      break;
    case "beanie":
      outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 15, top - 8, 30, 12, 6), 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(cx - 15, top + 1, 30, 3.5);
      break;
    case "shades":
      if (!back) {
        outlined(ctx, c.accessoryColor, () => rr(ctx, cx - 14, top + 11, 28, 7, 3), 1.5);
      }
      break;
    case "tuft":
      for (const dx of [-6, 0, 6]) {
        outlined(ctx, c.accessoryColor, () => {
          ctx.beginPath();
          ctx.moveTo(cx + dx - 2, top + 2);
          ctx.lineTo(cx + dx + 1, top - 9);
          ctx.lineTo(cx + dx + 4, top + 2);
          ctx.closePath();
        }, 1.5);
      }
      break;
    case "visor-lamp":
      outlined(ctx, c.accessoryColor, () => {
        ctx.beginPath();
        ctx.arc(cx + (side ? -11 : 0), top + 4, 4, 0, Math.PI * 2);
      }, 1.5);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = c.accessoryColor;
      ctx.beginPath();
      ctx.arc(cx + (side ? -11 : 0), top + 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "flower":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = c.accessoryColor;
        ctx.beginPath();
        ctx.arc(cx + 9 + Math.cos(a) * 4.5, top - 4 + Math.sin(a) * 4.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(cx + 9, top - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "none":
    default:
      break;
  }
}

/** The resident editor, permanently in the chair, lit by the timeline. */
export function seatedEditorSprite(frame: 0 | 1): SpriteBitmap {
  return bake(`npc-editor:${frame}`, 88, 96, (ctx) => {
    // Chair
    outlined(ctx, "#3a3630", () => rr(ctx, 26, 44, 40, 40, 8), 2);
    outlined(ctx, "#4a453e", () => rr(ctx, 22, 26, 10, 48, 4), 2);
    // Body (seated capsule, side-on facing the desk to the left)
    const suit = "#8a6fd0";
    outlined(ctx, suit, () => rr(ctx, 30, 26, 34, 44, 16), 2.5);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(33, 56, 28, 3);
    // Visor glowing from the screen
    outlined(ctx, "#20242c", () => rr(ctx, 22, 32, 20, 15, 7), 2);
    const vg = ctx.createLinearGradient(22, 32, 40, 46);
    vg.addColorStop(0, "#e8fbff");
    vg.addColorStop(1, "#6fc3dd");
    ctx.fillStyle = vg;
    rr(ctx, 24, 34, 16, 11, 5);
    ctx.fill();
    // Headphones
    outlined(ctx, "#26211b", () => rr(ctx, 40, 24, 8, 12, 3), 1.5);
    ctx.strokeStyle = "#26211b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(38, 34, 15, Math.PI * 1.2, Math.PI * 1.9);
    ctx.stroke();
    // The grading hand, nudging a dial (two frames).
    const hy = frame === 0 ? 52 : 56;
    outlined(ctx, suit, () => rr(ctx, 16, hy, 12, 10, 5), 1.5);
    // Legs tucked
    outlined(ctx, "#5d4a9e", () => rr(ctx, 30, 66, 13, 18, 5), 2);
    outlined(ctx, "#5d4a9e", () => rr(ctx, 46, 66, 13, 18, 5), 2);
    ctx.fillStyle = "rgba(20,16,10,0.3)";
    ctx.beginPath();
    ctx.ellipse(46, 90, 24, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export function missionBoardSprite(opts: {
  accent: string;
  missions: number;
  bounties: number;
  highlighted: boolean;
}): SpriteBitmap {
  const notes = Math.min(6, opts.missions);
  const key = `board2:${opts.accent}:${notes}:${Math.min(3, opts.bounties)}:${opts.highlighted}`;
  return bake(key, 64, 96, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(20, 70, 5, 26);
    ctx.fillRect(39, 70, 5, 26);
    ctx.fillRect(14, 92, 36, 4);
    if (opts.highlighted) {
      ctx.fillStyle = "rgba(255, 214, 102, 0.25)";
      rr(ctx, 2, 2, 60, 74, 8);
      ctx.fill();
    }
    outlined(ctx, "#6b6152", () => rr(ctx, 6, 6, 52, 66, 4), 2);
    ctx.fillStyle = "#f7f2e6";
    rr(ctx, 9, 9, 46, 60, 2);
    ctx.fill();
    ctx.fillStyle = opts.accent;
    ctx.fillRect(9, 9, 46, 8);
    const palette = ["#ffd166", "#8fd3e6", "#f0a5b8", "#b6e08f"];
    for (let i = 0; i < notes; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      ctx.fillStyle = palette[i % palette.length];
      rr(ctx, 13 + col * 15, 22 + row * 16, 12, 12, 1.5);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(15 + col * 15, 25 + row * 16, 8, 1);
      ctx.fillRect(15 + col * 15, 28 + row * 16, 6, 1);
    }
    if (notes === 0) {
      ctx.fillStyle = "#cfc8b8";
      ctx.fillRect(16, 30, 32, 2);
      ctx.fillRect(16, 38, 24, 2);
    }
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

export function bountyBoardSprite(open: number, hot: boolean): SpriteBitmap {
  const posters = Math.min(6, open);
  return bake(`bounty2:${posters}:${hot}`, 88, 112, (ctx) => {
    ctx.fillStyle = "#4b4338";
    ctx.fillRect(14, 84, 7, 28);
    ctx.fillRect(67, 84, 7, 28);
    ctx.fillRect(8, 108, 72, 4);
    if (hot) {
      ctx.fillStyle = "rgba(224, 87, 79, 0.22)";
      rr(ctx, 0, 0, 88, 92, 10);
      ctx.fill();
    }
    outlined(ctx, "#7a5c3a", () => rr(ctx, 4, 4, 80, 84, 5), 2.5);
    ctx.fillStyle = "#c79a63";
    rr(ctx, 8, 8, 72, 76, 3);
    ctx.fill();
    ctx.fillStyle = "#26241f";
    ctx.fillRect(8, 8, 72, 14);
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOUNTIES", 44, 18);
    for (let i = 0; i < posters; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      ctx.save();
      ctx.translate(22 + col * 23, 39 + row * 28);
      ctx.rotate(((i % 3) - 1) * 0.06);
      ctx.fillStyle = "#fdfbf5";
      rr(ctx, -10, -12, 20, 24, 1.5);
      ctx.fill();
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

/** The video bay's UP NEXT whiteboard, one line per queued cut. */
export function queueBoardSprite(queued: number, hot: boolean): SpriteBitmap {
  const lines = Math.min(6, queued);
  return bake(`queue:${lines}:${hot}`, 76, 104, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(16, 80, 6, 24);
    ctx.fillRect(54, 80, 6, 24);
    outlined(ctx, "#e8e2d4", () => rr(ctx, 4, 4, 68, 78, 4), 2.5);
    ctx.fillStyle = "#e0a862";
    ctx.fillRect(4, 4, 68, 13);
    ctx.fillStyle = "#26211b";
    ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("UP NEXT", 38, 13.5);
    for (let i = 0; i < lines; i++) {
      const y = 25 + i * 9;
      ctx.fillStyle = i === 0 && hot ? "#e0574f" : "#8f8778";
      ctx.beginPath();
      ctx.arc(12, y + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(18, y, 34 + ((i * 13) % 14), 2.5);
    }
    if (lines === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("queue clear", 38, 46);
    }
  });
}

/** Editing rig: triple monitor with a timeline scrubbing across the middle. */
export function editRigSprite(accent: string, active: boolean): SpriteBitmap {
  return bake(`editrig:${accent}:${active}`, 64, 40, (ctx) => {
    outlined(ctx, "#2c2a30", () => rr(ctx, 2, 2, 60, 26, 3), 2);
    const glow = active ? "#9fe0f0" : "#3f4750";
    for (const [x, w] of [
      [5, 17],
      [24, 16],
      [42, 17],
    ] as const) {
      ctx.fillStyle = glow;
      ctx.globalAlpha = active ? 0.95 : 0.6;
      ctx.fillRect(x, 5, w, 18);
      ctx.globalAlpha = 1;
    }
    if (active) {
      ctx.fillStyle = accent;
      ctx.fillRect(26, 17, 12, 3.5);
      ctx.fillStyle = "#fdfbf5";
      ctx.fillRect(30, 15, 1.5, 7);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = 0; i < 3; i++) ctx.fillRect(7 + i * 5, 8 + i * 3, 12, 1.5);
    }
    ctx.fillStyle = "#2c2a30";
    ctx.fillRect(28, 28, 8, 6);
    ctx.fillRect(20, 34, 24, 4);
  });
}

export function conferenceScreenSprite(hasMeeting: boolean): SpriteBitmap {
  return bake(`confscreen:${hasMeeting}`, 96, 84, (ctx) => {
    ctx.fillStyle = "#4b4338";
    ctx.fillRect(44, 66, 8, 18);
    ctx.fillRect(30, 82, 36, 3);
    outlined(ctx, "#2c2a30", () => rr(ctx, 4, 4, 88, 58, 4), 2.5);
    ctx.fillStyle = hasMeeting ? "#3c2f2f" : "#38404a";
    rr(ctx, 8, 8, 80, 50, 2);
    ctx.fill();
    ctx.fillStyle = hasMeeting ? "#ff8f85" : "#9fd7e8";
    ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(hasMeeting ? "URGENT MEETING" : "ANNOUNCEMENTS", 48, 24);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 3; i++) ctx.fillRect(16, 32 + i * 8, 42 + ((i * 17) % 22), 2.5);
    if (hasMeeting) {
      ctx.fillStyle = "#e0574f";
      ctx.beginPath();
      ctx.arc(78, 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function chairSprite(): SpriteBitmap {
  return bake("chair", 40, 52, (ctx) => {
    outlined(ctx, "#4a453e", () => rr(ctx, 8, 4, 24, 22, 6), 2);
    outlined(ctx, "#3a3630", () => rr(ctx, 6, 26, 28, 10, 4), 2);
    ctx.strokeStyle = "#26211b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, 36);
    ctx.lineTo(20, 44);
    ctx.stroke();
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      ctx.beginPath();
      ctx.moveTo(20, 44);
      ctx.lineTo(20 + Math.sin(a) * 12, 50);
      ctx.stroke();
    }
  });
}

/** Studio door with a sign — the creative room's Clients / Internal portals. */
export function studioDoorSprite(label: "CLIENTS" | "INTERNAL", tint: string): SpriteBitmap {
  return bake(`door:${label}`, 72, 112, (ctx) => {
    outlined(ctx, "#8a6f52", () => rr(ctx, 8, 8, 56, 100, 4), 2.5);
    ctx.fillStyle = "#a98a66";
    rr(ctx, 13, 13, 46, 90, 3);
    ctx.fill();
    // Porthole
    outlined(ctx, "#cfe6ee", () => {
      ctx.beginPath();
      ctx.arc(36, 44, 11, 0, Math.PI * 2);
    }, 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(32, 40, 4, 0, Math.PI * 2);
    ctx.fill();
    // Handle
    ctx.fillStyle = "#26211b";
    rr(ctx, 52, 60, 5, 12, 2.5);
    ctx.fill();
    // Sign
    ctx.fillStyle = tint;
    rr(ctx, 14, 16, 44, 14, 3);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    rr(ctx, 14, 16, 44, 14, 3);
    ctx.stroke();
    ctx.fillStyle = "#1e1a14";
    ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 36, 26);
  });
}

/** The infinite board — a huge framed canvas covered in scribbles and stickies. */
export function infiniteBoardSprite(): SpriteBitmap {
  return bake("infboard", 96, 100, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(18, 78, 6, 22);
    ctx.fillRect(72, 78, 6, 22);
    outlined(ctx, "#6b6152", () => rr(ctx, 4, 4, 88, 76, 4), 2.5);
    ctx.fillStyle = "#fdfbf5";
    rr(ctx, 8, 8, 80, 68, 2);
    ctx.fill();
    // Scribbles
    ctx.strokeStyle = "#4f7fe0";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(14, 30);
    ctx.quadraticCurveTo(30, 12, 44, 28);
    ctx.quadraticCurveTo(52, 38, 66, 24);
    ctx.stroke();
    ctx.strokeStyle = "#e0574f";
    ctx.beginPath();
    ctx.arc(28, 52, 9, 0, Math.PI * 1.6);
    ctx.stroke();
    // Stickies
    for (const [x, y, c] of [
      [52, 44, "#ffd166"],
      [66, 48, "#b6e08f"],
      [58, 60, "#f0a5b8"],
    ] as const) {
      ctx.fillStyle = c;
      rr(ctx, x, y, 12, 12, 1);
      ctx.fill();
    }
    ctx.fillStyle = "#63c98a";
    ctx.fillRect(12, 66, 22, 4);
  });
}

/** The task wall — a kanban of cards, one column per state. */
export function taskWallSprite(count: number): SpriteBitmap {
  const cards = Math.min(9, Math.max(0, count));
  return bake(`taskwall:${cards}`, 88, 100, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(18, 78, 6, 22);
    ctx.fillRect(64, 78, 6, 22);
    outlined(ctx, "#4c5560", () => rr(ctx, 4, 4, 80, 76, 4), 2.5);
    ctx.fillStyle = "#5d6772";
    rr(ctx, 8, 8, 72, 68, 2);
    ctx.fill();
    const cols = ["#9a9384", "#5fa4d0", "#63c98a"];
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = cols[c];
      ctx.fillRect(12 + c * 23, 12, 20, 4);
    }
    for (let i = 0; i < cards; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      ctx.fillStyle = "#f2ede1";
      rr(ctx, 12 + col * 23, 20 + row * 18, 20, 14, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(14 + col * 23, 24 + row * 18, 14, 1.5);
      ctx.fillRect(14 + col * 23, 28 + row * 18, 10, 1.5);
    }
  });
}

/** The managing-heads approvals counter, brass bell included. */
export function approvalDeskSprite(pending: number): SpriteBitmap {
  return bake(`approvals:${Math.min(9, pending)}`, 96, 72, (ctx) => {
    outlined(ctx, "#8a6f52", () => rr(ctx, 4, 26, 88, 40, 5), 2.5);
    ctx.fillStyle = "#a98a66";
    ctx.fillRect(8, 30, 80, 8);
    // Bell
    outlined(ctx, "#e0b13a", () => {
      ctx.beginPath();
      ctx.arc(24, 24, 7, Math.PI, 0);
      ctx.lineTo(31, 27);
      ctx.lineTo(17, 27);
      ctx.closePath();
    }, 1.8);
    ctx.fillStyle = "#26211b";
    ctx.fillRect(23, 14, 2.5, 4);
    // Sign
    ctx.fillStyle = "#26241f";
    rr(ctx, 40, 12, 48, 15, 3);
    ctx.fill();
    ctx.fillStyle = "#f7f2e6";
    ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("APPROVALS", 64, 22);
    if (pending > 0) {
      ctx.fillStyle = "#e0574f";
      ctx.beginPath();
      ctx.arc(88, 12, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(String(Math.min(9, pending)), 88, 15);
    }
  });
}

/** Outreach ops desk — sector map pinned above the phones. */
export function outreachDeskSprite(pending: number): SpriteBitmap {
  return bake(`outreach:${Math.min(20, pending)}`, 92, 96, (ctx) => {
    // Map board
    outlined(ctx, "#6b6152", () => rr(ctx, 8, 4, 76, 46, 4), 2);
    ctx.fillStyle = "#dfe8dc";
    rr(ctx, 12, 8, 68, 38, 2);
    ctx.fill();
    ctx.strokeStyle = "#9db89a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 30);
    ctx.quadraticCurveTo(40, 12, 76, 26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 42);
    ctx.quadraticCurveTo(48, 30, 74, 40);
    ctx.stroke();
    const pins = Math.min(6, Math.max(1, Math.ceil(pending / 4)));
    for (let i = 0; i < pins; i++) {
      ctx.fillStyle = i === 0 ? "#e0574f" : "#4f7fe0";
      ctx.beginPath();
      ctx.arc(20 + ((i * 23) % 56), 16 + ((i * 11) % 24), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Desk + phone
    outlined(ctx, "#8a6f52", () => rr(ctx, 10, 58, 72, 30, 5), 2.5);
    outlined(ctx, "#26211b", () => rr(ctx, 22, 50, 18, 10, 3), 1.5);
    ctx.fillStyle = "#4fae5a";
    ctx.beginPath();
    ctx.arc(66, 56, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function phoneBoothSprite(): SpriteBitmap {
  return bake("booth", 56, 110, (ctx) => {
    outlined(ctx, "#b03047", () => rr(ctx, 6, 4, 44, 102, 5), 2.5);
    ctx.fillStyle = "#8fd3e6";
    rr(ctx, 12, 14, 32, 52, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(15, 17, 8, 46);
    ctx.fillStyle = "#7d1e30";
    rr(ctx, 12, 72, 32, 28, 3);
    ctx.fill();
    ctx.fillStyle = "#f7f2e6";
    ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OTP", 28, 88);
  });
}

export function cameraRigSprite(): SpriteBitmap {
  return bake("camrig", 72, 100, (ctx) => {
    // Tripod
    ctx.strokeStyle = "#26211b";
    ctx.lineWidth = 3.5;
    for (const dx of [-18, 0, 18]) {
      ctx.beginPath();
      ctx.moveTo(36, 52);
      ctx.lineTo(36 + dx, 96);
      ctx.stroke();
    }
    // Camera body
    outlined(ctx, "#2c2a30", () => rr(ctx, 16, 28, 34, 24, 4), 2.5);
    outlined(ctx, "#3f4750", () => rr(ctx, 48, 32, 16, 14, 3), 2);
    ctx.fillStyle = "#8fd3e6";
    ctx.beginPath();
    ctx.arc(58, 39, 4, 0, Math.PI * 2);
    ctx.fill();
    // Reels
    for (const cx of [24, 40]) {
      outlined(ctx, "#3f4750", () => {
        ctx.beginPath();
        ctx.arc(cx, 22, 8, 0, Math.PI * 2);
      }, 2);
    }
    // Tally light
    ctx.fillStyle = "#e0574f";
    ctx.beginPath();
    ctx.arc(20, 32, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function lightRigSprite(): SpriteBitmap {
  return bake("lightrig", 60, 104, (ctx) => {
    ctx.strokeStyle = "#26211b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, 44);
    ctx.lineTo(30, 88);
    ctx.stroke();
    for (const dx of [-14, 0, 14]) {
      ctx.beginPath();
      ctx.moveTo(30, 88);
      ctx.lineTo(30 + dx, 100);
      ctx.stroke();
    }
    // Softbox glowing
    ctx.fillStyle = "rgba(255, 240, 200, 0.35)";
    rr(ctx, 2, 0, 56, 46, 6);
    ctx.fill();
    outlined(ctx, "#3a3630", () => rr(ctx, 8, 4, 44, 38, 4), 2.5);
    const g = ctx.createLinearGradient(0, 4, 0, 42);
    g.addColorStop(0, "#fff8e2");
    g.addColorStop(1, "#f0d9a0");
    ctx.fillStyle = g;
    rr(ctx, 12, 8, 36, 30, 2);
    ctx.fill();
  });
}

/** The school clock — bakes per minute so the hands are honest. */
export function bigClockSprite(hours: number, minutes: number): SpriteBitmap {
  const key = `clock:${hours}:${minutes}`;
  return bake(key, 84, 96, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(39, 76, 6, 20);
    outlined(ctx, "#8a6f52", () => {
      ctx.beginPath();
      ctx.arc(42, 40, 36, 0, Math.PI * 2);
    }, 3);
    ctx.fillStyle = "#fdfbf5";
    ctx.beginPath();
    ctx.arc(42, 40, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#26211b";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const big = i % 3 === 0;
      ctx.save();
      ctx.translate(42 + Math.sin(a) * 26, 40 - Math.cos(a) * 26);
      ctx.rotate(a);
      ctx.fillRect(-1, -(big ? 4 : 2.5), 2, big ? 8 : 5);
      ctx.restore();
    }
    const mA = (minutes / 60) * Math.PI * 2;
    const hA = (((hours % 12) + minutes / 60) / 12) * Math.PI * 2;
    ctx.strokeStyle = "#26211b";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(42, 40);
    ctx.lineTo(42 + Math.sin(hA) * 14, 40 - Math.cos(hA) * 14);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(42, 40);
    ctx.lineTo(42 + Math.sin(mA) * 22, 40 - Math.cos(mA) * 22);
    ctx.stroke();
    ctx.fillStyle = "#e0574f";
    ctx.beginPath();
    ctx.arc(42, 40, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function schoolBellSprite(ringing: boolean): SpriteBitmap {
  return bake(`bell:${ringing}`, 56, 72, (ctx) => {
    ctx.fillStyle = "#5a5144";
    ctx.fillRect(25, 44, 6, 28);
    if (ringing) {
      ctx.strokeStyle = "#e0a13a";
      ctx.lineWidth = 2;
      for (const r of [22, 27]) {
        ctx.beginPath();
        ctx.arc(28, 24, r, -0.4, 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(28, 24, r, Math.PI - 0.6, Math.PI + 0.4);
        ctx.stroke();
      }
    }
    outlined(ctx, "#e0b13a", () => {
      ctx.beginPath();
      ctx.arc(28, 22, 15, Math.PI, 0);
      ctx.lineTo(45, 34);
      ctx.lineTo(11, 34);
      ctx.closePath();
    }, 2.5);
    ctx.fillStyle = "#26211b";
    ctx.beginPath();
    ctx.arc(28, 38, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Glass tower door for the developer city. */
export function towerDoorSprite(label: string, tint: string): SpriteBitmap {
  return bake(`towerdoor:${label}`, 84, 116, (ctx) => {
    // Awning
    outlined(ctx, tint, () => rr(ctx, 4, 4, 76, 16, 4), 2);
    ctx.fillStyle = "#1e1a14";
    ctx.font = "bold 8.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label.toUpperCase().slice(0, 18), 42, 15);
    // Double glass doors
    outlined(ctx, "#4c5560", () => rr(ctx, 12, 24, 60, 88, 3), 2.5);
    for (const x of [16, 44]) {
      ctx.fillStyle = "#9fc6d8";
      rr(ctx, x, 28, 24, 80, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(x + 3, 31, 6, 74);
      ctx.fillStyle = "#26211b";
      rr(ctx, x + (x === 16 ? 18 : 2), 62, 4, 14, 2);
      ctx.fill();
    }
  });
}

export function plantSprite(variant: number): SpriteBitmap {
  return bake(`plant2:${variant}`, 44, 60, (ctx) => {
    outlined(ctx, "#a3714a", () => {
      ctx.beginPath();
      ctx.moveTo(13, 40);
      ctx.lineTo(31, 40);
      ctx.lineTo(28, 58);
      ctx.lineTo(16, 58);
      ctx.closePath();
    }, 2);
    ctx.fillStyle = "#8a5c3a";
    ctx.fillRect(12, 38, 20, 4);
    const greens = ["#4a8f57", "#5da368", "#3d7a49"];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42 + (variant % 3) * 0.08;
      ctx.fillStyle = greens[i % greens.length];
      ctx.save();
      ctx.translate(22, 39);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -15, 5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  });
}

export function monitorSprite(accent: string): SpriteBitmap {
  return bake(`monitor2:${accent}`, 36, 30, (ctx) => {
    outlined(ctx, "#2c2a30", () => rr(ctx, 3, 1, 30, 20, 2.5), 1.8);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(5, 3, 26, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i < 4; i++) ctx.fillRect(7, 6 + i * 3, 14 + ((i * 5) % 9), 1.5);
    ctx.fillStyle = "#2b2a30";
    ctx.fillRect(16, 21, 4, 6);
    ctx.fillRect(10, 27, 16, 3);
  });
}

export function coolerSprite(): SpriteBitmap {
  return bake("cooler2", 32, 60, (ctx) => {
    outlined(ctx, "#dfe9ee", () => rr(ctx, 8, 2, 16, 22, 4), 1.8);
    ctx.fillStyle = "#8fd3e6";
    rr(ctx, 10, 5, 12, 17, 3);
    ctx.fill();
    outlined(ctx, "#f2f0ea", () => rr(ctx, 6, 24, 20, 34, 3), 1.8);
    ctx.fillStyle = "#5a6570";
    ctx.fillRect(13, 32, 6, 5);
  });
}

export function clearSpriteCache() {
  cache.clear();
}
