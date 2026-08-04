// Blocky Minecraft-style rigs for remote players: seven textured boxes, a
// chest status lamp and an optional name-tag sprite. Every texture is a tiny
// canvas painted from the character's hue, so a rig costs ~90 triangles and
// zero asset fetches.

import * as THREE from "three";
import { paintSkinFace } from "./textures";

export type PlayerRig = {
  group: THREE.Group;
  setPose(walkPhase: number, moving: boolean, dt: number): void;
  /** Sit the rig down: thighs forward, shins down, arms resting on the desk. */
  setSeated(seated: boolean): void;
  /**
   * Keep a seated figure working. `t` is elapsed seconds; the arms tap and the
   * head shifts, which is the whole difference between somebody editing and a
   * mannequin propped at a desk.
   */
  setWorking(t: number): void;
  setHeading(yaw: number): void;
  setStatus(status: string): void;
  dispose(): void;
};

const STATUS_COLOR: Record<string, number> = {
  online: 0x4fae5a,
  busy: 0xe0a13a,
  away: 0x8a8f98,
};

// Parts use Minecraft proportions and stack to 2.0 units; the body group is
// scaled by 0.9 so the assembled figure stands exactly 1.8 units tall.
const BODY_SCALE = 0.9;
/** Peak limb swing in radians. */
const SWING = 0.7;
/** Time constant (seconds) for limbs easing back to rest once idle. */
const EASE_S = 0.15;
/** Resting outward arm tilt so arms hang slightly clear of the torso. */
const ARM_TILT = 0.08;

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

/** Tiny deterministic PRNG so the same hue always paints the same outfit. */
function seeded(seed: number): Rand {
  let a = (seed * 7919 + 17) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d");
  if (!c) throw new Error("2d canvas context unavailable");
  c.imageSmoothingEnabled = false;
  return [el, c];
}

/** Scatter single-pixel noise inside a rect so flat faces read as pixel art. */
function speckle(
  c: Ctx,
  r: Rand,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colors: string[],
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[(r() * colors.length) | 0];
    c.fillRect(x0 + ((r() * w) | 0), y0 + ((r() * h) | 0), 1, 1);
  }
}

/** Outfit palette derived from the character hue. Skin follows paintSkinFace. */
function outfit(hue: number) {
  const h = ((hue % 360) + 360) % 360;
  const hairH = (h * 137 + 43) % 360; // hashed so hair isn't just the shirt hue
  return {
    shirt: `hsl(${h}, 62%, 50%)`,
    shirtDark: `hsl(${h}, 62%, 42%)`,
    shirtLight: `hsl(${h}, 56%, 58%)`,
    pants: `hsl(${h}, 22%, 36%)`,
    pantsDark: `hsl(${h}, 22%, 30%)`,
    pantsLight: `hsl(${h}, 20%, 42%)`,
    shoe: `hsl(${h}, 12%, 16%)`,
    shoeLight: `hsl(${h}, 12%, 24%)`,
    skin: `hsl(${h}, 45%, 68%)`,
    skinDark: `hsl(${h}, 45%, 58%)`,
    hair: `hsl(${hairH}, 30%, 18%)`,
    hairDark: `hsl(${hairH}, 32%, 12%)`,
    hairLight: `hsl(${hairH}, 26%, 25%)`,
  };
}

type Outfit = ReturnType<typeof outfit>;

function paintTorso(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.shirt;
  c.fillRect(0, 0, 8, 8);
  c.fillStyle = o.shirtLight;
  c.fillRect(0, 0, 8, 1); // collar
  c.fillStyle = o.shirtDark;
  c.fillRect(0, 7, 8, 1); // hem
  speckle(c, r, 0, 1, 8, 6, [o.shirtDark, o.shirtLight], 8);
  return el;
}

function paintLeg(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.pants;
  c.fillRect(0, 0, 8, 6);
  c.fillStyle = o.shoe;
  c.fillRect(0, 6, 8, 2);
  speckle(c, r, 0, 0, 8, 6, [o.pantsDark, o.pantsLight], 7);
  speckle(c, r, 0, 6, 8, 2, [o.shoeLight], 3);
  return el;
}

function paintArm(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.shirt;
  c.fillRect(0, 0, 8, 3); // short sleeve
  c.fillStyle = o.shirtDark;
  c.fillRect(0, 2, 8, 1);
  c.fillStyle = o.skin;
  c.fillRect(0, 3, 8, 5);
  speckle(c, r, 0, 0, 8, 2, [o.shirtLight, o.shirtDark], 3);
  speckle(c, r, 0, 3, 8, 5, [o.skinDark], 5);
  return el;
}

function paintHeadSide(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.skin;
  c.fillRect(0, 0, 8, 8);
  c.fillStyle = o.hair;
  c.fillRect(0, 0, 8, 3);
  speckle(c, r, 0, 0, 8, 3, [o.hairDark, o.hairLight], 4);
  speckle(c, r, 0, 3, 8, 5, [o.skinDark], 4);
  return el;
}

function paintHeadTop(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.hair;
  c.fillRect(0, 0, 8, 8);
  speckle(c, r, 0, 0, 8, 8, [o.hairDark, o.hairLight], 9);
  return el;
}

function paintHeadBottom(o: Outfit, r: Rand): HTMLCanvasElement {
  const [el, c] = makeCanvas(8, 8);
  c.fillStyle = o.skinDark;
  c.fillRect(0, 0, 8, 8);
  speckle(c, r, 0, 0, 8, 8, [o.skin], 4);
  return el;
}

/** Trace a full-radius pill path; caller fills and strokes it. */
function pill(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  c.beginPath();
  c.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  c.arc(x + w - r, y + r, r, Math.PI * 1.5, Math.PI / 2);
  c.closePath();
}

function paintNameTag(name: string): { canvas: HTMLCanvasElement; w: number; h: number } {
  const font = "600 28px system-ui, sans-serif";
  const [, measure] = makeCanvas(1, 1);
  measure.font = font;
  const textW = Math.ceil(measure.measureText(name).width);
  const h = 46;
  const w = Math.max(h, textW + 30);
  const [canvas, c] = makeCanvas(w, h);
  c.fillStyle = "rgba(14, 16, 22, 0.82)";
  pill(c, 1, 1, w - 2, h - 2);
  c.fill();
  c.strokeStyle = "rgba(255, 255, 255, 0.16)";
  c.lineWidth = 2;
  c.stroke();
  c.font = font;
  c.fillStyle = "#f4f6f8";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(name, w / 2, h / 2 + 1);
  return { canvas, w, h };
}

export function createPlayerRig(opts: {
  name: string;
  hue: number;
  showName?: boolean;
}): PlayerRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const texOf = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const matOf = (canvas: HTMLCanvasElement): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ map: texOf(canvas) });
    materials.push(m);
    return m;
  };
  const boxOf = (w: number, h: number, d: number, shiftY = 0): THREE.BoxGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (shiftY !== 0) g.translate(0, shiftY, 0);
    geometries.push(g);
    return g;
  };

  const o = outfit(opts.hue);
  const r = seeded(Math.round(((opts.hue % 360) + 360) % 360) + 1);

  const group = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(BODY_SCALE);
  group.add(body);

  // Legs pivot at the hip (geometry shifted down so the box hangs below it).
  const legMat = matOf(paintLeg(o, r));
  const legGeo = boxOf(0.25, 0.75, 0.25, -0.375);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.name = "legL";
  legL.position.set(-0.125, 0.75, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.name = "legR";
  legR.position.set(0.125, 0.75, 0);

  const torso = new THREE.Mesh(boxOf(0.5, 0.75, 0.25), matOf(paintTorso(o, r)));
  torso.name = "torso";
  torso.position.y = 1.125;

  // Arms pivot at the very top, level with the torso's shoulders.
  const armMat = matOf(paintArm(o, r));
  const armGeo = boxOf(0.2, 0.7, 0.2, -0.35);
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.name = "armL";
  armL.position.set(-0.35, 1.5, 0);
  armL.rotation.z = -ARM_TILT;
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.name = "armR";
  armR.position.set(0.35, 1.5, 0);
  armR.rotation.z = ARM_TILT;

  // BoxGeometry material order is [+x, -x, +y, -y, +z, -z]; the rig faces -z
  // at yaw 0, so the painted face goes on index 5.
  const headSide = matOf(paintHeadSide(o, r));
  const head = new THREE.Mesh(boxOf(0.5, 0.5, 0.5), [
    headSide,
    headSide,
    matOf(paintHeadTop(o, r)),
    matOf(paintHeadBottom(o, r)),
    headSide,
    matOf(paintSkinFace(opts.hue)),
  ]);
  head.name = "head";
  head.position.y = 1.75;

  const lampMat = new THREE.MeshLambertMaterial({ color: STATUS_COLOR.online });
  lampMat.emissive.setHex(STATUS_COLOR.online).multiplyScalar(0.5);
  materials.push(lampMat);
  const lamp = new THREE.Mesh(boxOf(0.08, 0.08, 0.08), lampMat);
  lamp.name = "lamp";
  lamp.position.set(0.14, 1.32, -0.15); // proud of the chest's front (-z) face

  body.add(legL, legR, torso, armL, armR, head, lamp);

  if (opts.showName) {
    const tag = paintNameTag(opts.name);
    const tex = texOf(tag.canvas);
    tex.magFilter = THREE.LinearFilter; // pixel-art filtering shimmers on text
    tex.minFilter = THREE.LinearFilter;
    const tagMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    materials.push(tagMat);
    const sprite = new THREE.Sprite(tagMat);
    sprite.position.y = 2.15;
    sprite.scale.set(0.011 * tag.w, 0.011 * tag.h, 1);
    group.add(sprite);
  }

  const limbs = [armL, armR, legL, legR];
  let seated = false;

  return {
    group,

    setPose(walkPhase, moving, dt) {
      if (seated) return; // the seated pose is fixed
      if (moving) {
        const s = Math.sin(walkPhase) * SWING;
        armL.rotation.x = s;
        armR.rotation.x = -s;
        legL.rotation.x = -s;
        legR.rotation.x = s;
      } else {
        const k = Math.min(1, dt / EASE_S);
        for (const limb of limbs) limb.rotation.x -= limb.rotation.x * k;
      }
    },

    setWorking(t) {
      if (!seated) return;
      // Two hands at slightly different rates so it reads as typing rather
      // than a metronome, plus a slow lean toward the screen.
      const rest = -Math.PI / 3;
      armL.rotation.x = rest + Math.sin(t * 9.0) * 0.10;
      armR.rotation.x = rest + Math.sin(t * 11.3 + 1.1) * 0.10;
      head.rotation.x = Math.sin(t * 0.7) * 0.05 + 0.08;
      head.rotation.y = Math.sin(t * 0.31) * 0.12;
    },

    setSeated(next) {
      if (next === seated) return;
      seated = next;
      if (next) {
        // Knees forward, shins hanging, arms angled onto the desk. Placement
        // owns the height drop onto the chair, not the pose.
        legL.rotation.x = -Math.PI / 2;
        legR.rotation.x = -Math.PI / 2;
        armL.rotation.x = -Math.PI / 3;
        armR.rotation.x = -Math.PI / 3;
      } else {
        for (const limb of limbs) limb.rotation.x = 0;
      }
    },

    setHeading(yaw) {
      // Contract yaw turns clockwise from above; three's rotation.y is
      // counterclockwise, so negate. yaw 0 keeps the rig facing -z.
      group.rotation.y = -yaw;
    },

    setStatus(status) {
      const c = STATUS_COLOR[status] ?? STATUS_COLOR.online;
      lampMat.color.setHex(c);
      lampMat.emissive.setHex(c).multiplyScalar(0.5);
    },

    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
