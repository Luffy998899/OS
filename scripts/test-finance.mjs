import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

// 1) Create a service
await page.goto(`${BASE}/admin/services`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Add service/i }).click();
await page.getByLabel("Name").fill("Web design");
await page.getByLabel("Category").fill("web-dev");
await page.getByLabel(/Base price/i).fill("10000");
await page.getByRole("button", { name: /^Add service$/ }).click();
await page.waitForTimeout(800);
const hasService = /Web design/.test(await page.locator("body").innerText());
console.log("[finance] service created:", hasService);

// 2) Create an invoice via the builder
let invoiceId = null;
page.on("response", async (r) => {
  if (r.url().includes("invoice.create") && r.request().method() === "POST") {
    try {
      const b = await r.json();
      invoiceId = b?.[0]?.result?.data?.json?.id ?? invoiceId;
    } catch {}
  }
});

await page.goto(`${BASE}/admin/invoices/new`, { waitUntil: "networkidle" });
await page.getByLabel("Name").fill("Acme Corp");
await page.getByLabel("Email").fill("billing@acme.test");
// Add a line from the service catalog
await page.getByRole("button", { name: /Suggest from services/i }).click();
await page.getByRole("menuitem", { name: /Web design/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Create invoice/i }).click();
await page.waitForURL(`${BASE}/admin/invoices`, { timeout: 15000 });
await page.waitForTimeout(800);
const listText = await page.locator("body").innerText();
console.log("[finance] invoice in list:", /INV\//.test(listText));
console.log("[finance] invoice id captured:", !!invoiceId);

// 3) PDF endpoint
if (invoiceId) {
  const res = await page.request.get(`${BASE}/api/invoices/${invoiceId}/pdf`);
  const ct = res.headers()["content-type"] || "";
  const buf = await res.body();
  console.log("[finance] pdf status:", res.status(), "type:", ct, "bytes:", buf.length);
}

// 4) Mark paid via row menu
await page.locator("table tbody tr").first().getByRole("button").last().click();
await page.getByRole("menuitem", { name: /Mark as paid/i }).click();
await page.waitForTimeout(800);

// 5) Ledger reflects it
await page.goto(`${BASE}/admin/ledger`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const ledgerText = await page.locator("body").innerText();
console.log("[finance] ledger shows invoice:", /INV\//.test(ledgerText));
console.log("[finance] ledger collected non-zero:", /Collected[\s\S]*11,800/.test(ledgerText) || /₹11,800/.test(ledgerText));

await page.screenshot({ path: "screenshots/ledger.png", fullPage: true });
await browser.close();
console.log("done");
