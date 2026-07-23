import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const marker = "reconcile the outstanding invoices for billing";
await page.getByPlaceholder(/Ask the dev team/i).fill(`Please ${marker} ASAP`);
await page.getByRole("button", { name: /Send as owner/i }).click();
await page.waitForTimeout(1500);

// Verify it landed in the review queue on Assign & Plan
await page.goto(`${BASE}/admin/assign`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const text = await page.locator("body").innerText();
const inQueue = /Reconcile|reconcile|invoices/i.test(text);
const hasWhatsappSource = /Whatsapp/i.test(text);
console.log("draft appeared in review queue:", inQueue);
console.log("has whatsapp-sourced item:", hasWhatsappSource);

await browser.close();
console.log(inQueue && hasWhatsappSource ? "PASS" : "CHECK");
