import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve("web/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright"));

const BASE = "https://reddetail.gammablue-x.com";
const OUT = path.resolve(".scratch/promo/shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: "zh-CN", colorScheme: "dark" });
const login = await context.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", origin: BASE },
    data: { username: process.env.STG_USER, password: process.env.STG_PASS },
});
console.log("login", login.status());
const list = await context.request.get(`${BASE}/api/canvas/projects?page=1&pageSize=30`);
const data = await list.json().catch(() => ({}));
const raw = data?.data?.projects || [];
if (raw[0]) console.log("summary keys", Object.keys(raw[0]).join(","));
const items = raw.map((p) => ({ id: p.id, title: p.title || p.name, nodes: p.nodeCount ?? p.node_count ?? p.stats?.nodes ?? 0 }));
items.sort((a, b) => b.nodes - a.nodes);
console.log("canvases", JSON.stringify(items.slice(0, 6)));

const page = await context.newPage();
for (const c of items.slice(0, 3)) {
    try {
        await page.goto(`${BASE}/canvas/${encodeURIComponent(c.id)}`, { waitUntil: "networkidle", timeout: 60000 });
        await page.waitForTimeout(6000);
        await page.screenshot({ path: `${OUT}/canvas-${c.nodes}-fit.png` });
        console.log("shot canvas", c.nodes, c.title);
    } catch (e) {
        console.log("fail canvas", c.id, String(e).slice(0, 120));
    }
}
for (const p of ["/gallery", "/works"]) {
    try {
        await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${OUT}${p}-dark.png` });
        console.log("shot", p);
    } catch (e) {
        console.log("fail", p, String(e).slice(0, 120));
    }
}
await context.request.post(`${BASE}/api/auth/logout`, { headers: { origin: BASE } });
await browser.close();
