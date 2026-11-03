import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve("web/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright"));

const BASE = "https://reddetail.gammablue-x.com";
const OUT = path.resolve(".scratch/promo/footage");
mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] || "probe";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: mode === "stills" ? 2 : 1, locale: "zh-CN", colorScheme: "dark" });
const login = await context.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", origin: BASE },
    data: { username: process.env.STG_USER, password: process.env.STG_PASS },
});
console.log("login", login.status());
const page = await context.newPage();

async function open(p, wait = 4000) {
    const res = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(wait);
    return { status: res?.status(), url: page.url().replace(BASE, "") };
}

async function sequence(name, frames, step) {
    mkdirSync(`${OUT}/${name}`, { recursive: true });
    for (let i = 0; i < frames; i++) {
        await step(i);
        await page.waitForTimeout(40);
        await page.screenshot({ path: `${OUT}/${name}/${String(i).padStart(3, "0")}.jpg`, type: "jpeg", quality: 88 });
    }
    console.log("seq", name, frames);
}

try {
    if (mode === "probe") {
        for (const p of ["/practice/character", "/practice/scene", "/practice/storyboard-image", "/practice/storyboard-video", "/practice/scripts", "/learning", "/one-click-film", "/drama-lab"]) {
            try { console.log("probe", p, JSON.stringify(await open(p, 1500))); } catch (e) { console.log("probe fail", p, String(e).slice(0, 80)); }
        }
    }
    if (mode === "stills") {
        const list = (process.argv[3] || "").split(",").filter(Boolean);
        for (const p of list) {
            const r = await open(p, 5000);
            const name = p.replace(/^\//, "").replace(/[\/\[\]]/g, "_");
            await page.screenshot({ path: `${OUT}/still-${name}.jpg`, type: "jpeg", quality: 90 });
            console.log("still", p, JSON.stringify(r));
        }
    }
    if (mode === "seq") {
        await open("/canvas/canvas-WmR3bVtPvHApM6ahOUTSQ", 7000);
        await page.mouse.move(960, 540);
        await sequence("canvas-zoom", 75, async () => page.mouse.wheel(0, -14));
        await open("/canvas/canvas-nocHKI8mt4IzNtvGYV9O-", 8000);
        await page.mouse.move(960, 540);
        await sequence("canvas-wide", 75, async () => page.mouse.wheel(0, 10));
        await open("/gallery", 4000);
        await page.mouse.move(960, 600);
        await sequence("gallery-scroll", 75, async () => page.mouse.wheel(0, 9));
        await open("/works", 4000);
        await page.mouse.move(960, 600);
        await sequence("works-scroll", 60, async () => page.mouse.wheel(0, 8));
    }
} finally {
    await context.request.post(`${BASE}/api/auth/logout`, { headers: { origin: BASE } });
    await browser.close();
}
