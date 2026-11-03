import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve("web/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright"));

const BASE = "https://reddetail.gammablue-x.com";
const OUT = path.resolve(".scratch/promo/shots");
mkdirSync(OUT, { recursive: true });
const PAGES = (process.argv[2] || "/home,/practice,/canvas,/image,/video,/one-click-film,/drama-lab,/learning,/teaching,/works,/gallery,/ip-library,/prompts,/create").split(",");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "zh-CN", colorScheme: "light" });
const login = await context.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", origin: BASE },
    data: { username: process.env.STG_USER, password: process.env.STG_PASS },
});
console.log("login", login.status());
const page = await context.newPage();
for (const p of PAGES) {
    try {
        const res = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(2500);
        const name = p.replace(/^\//, "").replace(/[\/\[\]]/g, "_") || "root";
        await page.screenshot({ path: `${OUT}/${name}.png` });
        console.log("shot", p, res?.status(), "->", page.url().replace(BASE, ""));
    } catch (e) {
        console.log("fail", p, String(e).slice(0, 120));
    }
}
await context.request.post(`${BASE}/api/auth/logout`, { headers: { origin: BASE } });
await browser.close();
