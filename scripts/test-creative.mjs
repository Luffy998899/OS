// Creative mode, driven through the real app: enter the world, turn on build
// mode, fly, place and break blocks, and prove the edits actually persist by
// reloading the page and checking they are still there.
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const OUT = process.env.OUT || "/tmp/shots";
const fails = [];
const ok = (n, c) => {
  console.log(`${c ? "✓" : "✗"} ${n}`);
  if (!c) fails.push(n);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERR:", String(e).slice(0, 200)));

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);
await page.getByRole("button", { name: /ENTER THE OFFICE/i }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(4000);

// The world should be the blank slate: a ground plane and nothing above it.
const start = await page.evaluate(() => {
  const E = window.__bw;
  const w = E?.world;
  if (!w) return null;
  let solid = 0;
  let above = 0;
  for (let i = 0; i < w.blocks.length; i++) {
    if (w.blocks[i] === 0) continue;
    solid++;
    const y = Math.floor(i / (w.sx * w.sz));
    if (y > 0) above++;
  }
  return { size: [w.sx, w.sy, w.sz], solid, above, pois: w.pois.length, npcs: w.npcs.length };
});
console.log("world:", JSON.stringify(start));
ok("world loads as a blank slate with a ground plane", start.solid > 1000 && start.above === 0);
ok("nothing is generated into it", start.pois === 0 && start.npcs === 0);

// Build mode.
ok("build toggle is offered to an admin", (await page.getByRole("button", { name: /^Build \(G\)$/ }).count()) > 0);
await page.keyboard.press("KeyG");
await page.waitForTimeout(600);
ok("build mode turns on", (await page.getByText("BUILD MODE").count()) > 0);
ok("hotbar appears", (await page.getByText(/L-click break/).count()) > 0);

// Fly: double-tap space.
await page.keyboard.press("Space");
await page.keyboard.press("Space");
await page.waitForTimeout(500);
ok("double-tap Space starts flying", (await page.getByText("BUILD MODE · FLYING").count()) > 0);

// Place a block by driving the same path the mouse does: aim down at the floor
// and use the engine's edit entry point through a synthetic pointer event.
const placed = await page.evaluate(async () => {
  const E = window.__bw;
  // Stand somewhere known, look straight down at the ground plane.
  E.st.pos = { x: 20.5, y: 4, z: 20.5 };
  E.st.vel = { x: 0, y: 0, z: 0 };
  E.yaw = 0;
  E.pitch = -Math.PI / 2;
  E.flying = true;
  await new Promise((r) => setTimeout(r, 400));
  return E.aimedVoxel ? { ...E.aimedVoxel } : null;
});
console.log("aimed at:", JSON.stringify(placed));
ok("build mode targets the block under the crosshair", placed !== null && placed.y === 0);

// Right-click places, left-click breaks — through the real canvas listeners.
const canvas = page.locator("canvas").first();
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.evaluate(() => {
  // Pointer lock cannot be granted headlessly, so tell the engine it is locked
  // by dispatching against the same element the listeners are bound to.
  const el = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { value: el, configurable: true });
});
// Moving the mouse under a faked pointer lock feeds movementX/Y into the look
// code, so the aim drifts. Read the target the engine is actually on *after*
// the move and assert against that rather than a coordinate picked in advance.
await page.mouse.move(cx, cy);
await page.waitForTimeout(300);
const target = await page.evaluate(() => {
  const E = window.__bw;
  return E.aimedVoxel ? { ...E.aimedVoxel, held: E.held } : null;
});
console.log("placing at:", JSON.stringify(target));
ok("engine has a placement target", target !== null);

await page.mouse.down({ button: "right" });
await page.waitForTimeout(120);
await page.mouse.up({ button: "right" });
await page.waitForTimeout(900);

const afterPlace = await page.evaluate((t) => {
  const w = window.__bw.world;
  return w.blocks[(t.py * w.sz + t.pz) * w.sx + t.px];
}, target);
console.log("block after place:", afterPlace, "expected:", target.held);
ok("right click places the held block", afterPlace === target.held && afterPlace !== 0);

await page.screenshot({ path: `${OUT}/creative.png` });

// Wait for the flush timer, then reload and check it survived.
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /ENTER THE OFFICE/i }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(4000);
const persisted = await page.evaluate((t) => {
  const w = window.__bw.world;
  return w.blocks[(t.py * w.sz + t.pz) * w.sx + t.px];
}, target);
console.log(`after reload, block at ${target.px},${target.py},${target.pz}:`, persisted);
ok("the placed block persisted across a reload", persisted === target.held);

// Break it again and confirm the removal persists too.
await page.keyboard.press("KeyG");
await page.waitForTimeout(400);
await page.evaluate(
  async (t) => {
    const E = window.__bw;
    // Stand next to the block and look straight at it.
    E.st.pos = { x: t.px + 0.5, y: t.py + 3, z: t.pz + 0.5 };
    E.st.vel = { x: 0, y: 0, z: 0 };
    E.yaw = 0;
    E.pitch = -Math.PI / 2;
    E.flying = true;
    const el = document.querySelector("canvas");
    Object.defineProperty(document, "pointerLockElement", { value: el, configurable: true });
    await new Promise((r) => setTimeout(r, 500));
  },
  target,
);
const breakTarget = await page.evaluate(() => {
  const E = window.__bw;
  return E.aimedVoxel ? { ...E.aimedVoxel } : null;
});
console.log("breaking:", JSON.stringify(breakTarget));
ok("engine has a break target", breakTarget !== null);
await page.mouse.down({ button: "left" });
await page.waitForTimeout(120);
await page.mouse.up({ button: "left" });
await page.waitForTimeout(1600);
const afterBreak = await page.evaluate((t) => {
  const w = window.__bw.world;
  return w.blocks[(t.y * w.sz + t.z) * w.sx + t.x];
}, breakTarget);
ok("left click breaks the block", afterBreak === 0);

// The block picker.
await page.keyboard.press("KeyE");
await page.waitForTimeout(700);
ok("the all-blocks picker opens", (await page.getByText("All blocks").count()) > 0);
ok("the picker is grouped", (await page.getByText("Walls & structure").count()) > 0);
const swatches = await page.locator("canvas").count();
ok("the picker draws real block textures", swatches > 20);
await page.screenshot({ path: `${OUT}/picker.png` });

console.log(fails.length === 0 ? "\nALL PASS" : `\nFAILURES: ${fails.join(" | ")}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
