import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve("web/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright"));

const FFMPEG = "D:/Claude code programe/VOZEB-PRO/LocalMiniDrama/backend-node/tools/ffmpeg/ffmpeg.exe";
const PAGE = pathToFileURL(path.resolve(".scratch/promo/promo.html")).href;
const FPS = 30;
const DURATION = 58;
const mode = process.argv[2] || "stills";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(PAGE);
await page.evaluate(() => document.fonts.ready);

if (mode === "stills") {
    const times = (process.argv[3] || "3,8,16,27,36,45,51,56").split(",").map(Number);
    for (const t of times) {
        await page.evaluate((v) => window.render(v), t);
        await page.screenshot({ path: `.scratch/promo/stills/t${String(t).padStart(2, "0")}.png` });
        console.log("still", t);
    }
} else {
    const out = path.resolve(".scratch/promo/vozeb-pro-promo.mp4");
    const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const total = FPS * DURATION;
    for (let i = 0; i < total; i++) {
        await page.evaluate((v) => window.render(v), i / FPS);
        const buf = await page.screenshot({ type: "jpeg", quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
        if (i % 150 === 0) console.log(`frame ${i}/${total}`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg exit " + c)))));
    console.log("done", out);
}
await browser.close();
