// Walks the rebuilt office and captures a few frames, so the layout and the
// new textures can be eyeballed rather than only asserted.
import { chromium } from "@playwright/test";
const BASE = process.env.APP_URL || "http://localhost:3000";
const OUT = process.env.OUT || "/tmp/shots";
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

const info = await page.evaluate(() => {
  const E = window.__bw;
  if (!E?.world) return null;
  return {
    size: [E.world.sx, E.world.sy, E.world.sz],
    pois: E.world.pois.length,
    regions: E.world.regions.length,
    npcs: E.world.npcs.length,
    spawn: E.st.pos,
  };
});
console.log("world:", JSON.stringify(info));

// A few vantage points: the lobby looking up the corridor, then inside rooms.
const shots = [
  ["lobby", null],
  ["corridor", { x: 36.5, y: 1, z: 40.5, yaw: 0, pitch: 0 }],
  ["conference", { x: 20, y: 1, z: 20, yaw: Math.PI / 2, pitch: -0.1 }],
  ["devwing", { x: 50, y: 1, z: 20, yaw: -Math.PI / 2, pitch: -0.05 }],
];
for (const [name, pose] of shots) {
  if (pose) {
    await page.evaluate((p) => {
      const E = window.__bw;
      E.st.pos = { x: p.x, y: p.y, z: p.z };
      E.st.vel = { x: 0, y: 0, z: 0 };
      E.yaw = p.yaw;
      E.pitch = p.pitch;
    }, pose);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot:", name);
}
await browser.close();
