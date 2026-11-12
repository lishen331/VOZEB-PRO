import { chromium } from "@playwright/test";

const out = process.argv[2] || ".";
const only = process.argv[3] ? process.argv[3].split(",") : null;
const BASE = "http://localhost:3000";
const pages = ["/", "/create", "/works", "/assets", "/canvas", "/profile"];
const variants = [
    { tag: "light", theme: "light", viewport: { width: 1600, height: 950 } },
    { tag: "dark", theme: "dark", viewport: { width: 1600, height: 950 } },
    { tag: "mobile", theme: "light", viewport: { width: 390, height: 844 }, mobile: true },
];

const browser = await chromium.launch();
for (const variant of variants) {
    const context = await browser.newContext({ viewport: variant.viewport, isMobile: variant.mobile, hasTouch: variant.mobile, colorScheme: variant.theme });
    await context.addInitScript((theme) => {
        try {
            localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme }, version: 0 }));
        } catch {}
    }, variant.theme);
    const login = await context.request.post(`${BASE}/api/auth/login`, { data: { username: "admin", password: "12345678" } });
    if (!login.ok()) throw new Error(`login failed ${login.status()}`);
    const page = await context.newPage();
    for (const path of pages) {
        const name = `${variant.tag}${path === "/" ? "-home" : path.replaceAll("/", "-")}`;
        if (only && !only.some((item) => name.includes(item))) continue;
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
        await page.waitForSelector(".gm-ambient-backdrop", { state: "attached", timeout: 120000 }).catch(() => undefined);
        await page.waitForSelector(".gm-ambient-media video.is-ready", { state: "attached", timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
        await page.waitForLoadState("domcontentloaded");
        const state = await page.evaluate(() => ({
            url: location.pathname,
            ambient: Boolean(document.querySelector(".gm-ambient-backdrop")),
            videoReady: Boolean(document.querySelector(".gm-ambient-media video.is-ready")),
        }));
        console.log(name, JSON.stringify(state));
        await page.screenshot({ path: `${out}/${name}.png` });
    }
    await context.close();
}
await browser.close();
