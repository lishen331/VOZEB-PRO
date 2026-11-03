import { chromium } from "@playwright/test";
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1600, height: 950 } });
await c.request.post("http://localhost:3000/api/auth/login", { data: { username: "admin", password: "12345678" } });
const p = await c.newPage();
await p.goto("http://localhost:3000/canvas", { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(6000);
const href = "/canvas/ambient-probe-nonexistent";
if (href) { await p.goto("http://localhost:3000" + href, { waitUntil: "domcontentloaded", timeout: 180000 }); await p.waitForTimeout(8000); }
console.log("fullscreen", href, await p.evaluate(() => ({ backdrop: document.querySelectorAll(".gm-ambient-backdrop").length, ambient: document.querySelectorAll(".gm-ambient").length })));
await b.close();
