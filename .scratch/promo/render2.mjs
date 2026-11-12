import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve("web/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright"));

const FFMPEG = "D:/Claude code programe/VOZEB-PRO/LocalMiniDrama/backend-node/tools/ffmpeg/ffmpeg.exe";
const DIR = path.resolve(".scratch/promo");
const PAGE = pathToFileURL(path.join(DIR, "promo2.html")).href;
const MUSIC = path.join(DIR, "music/Voxel_Revolution.mp3");
const FPS = 30;
const DURATION = 59;
const mode = process.argv[2] || "stills";

const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(PAGE);
await page.evaluate(() => document.fonts.ready);

if (mode === "stills") {
    mkdirSync(path.join(DIR, "stills2"), { recursive: true });
    const times = (process.argv[3] || "3,10,17,19,26,34,41,44,48,53,57").split(",").map(Number);
    for (const t of times) {
        await page.evaluate((v) => window.render(v), t);
        await page.screenshot({ path: path.join(DIR, "stills2", `t${String(t).padStart(2, "0")}.jpg`), type: "jpeg", quality: 80 });
        console.log("still", t);
    }
} else {
    const out = path.join(DIR, "vozeb-pro-promo-v2.mp4");
    const ff = spawn(
        FFMPEG,
        ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-i", MUSIC,
            "-map", "0:v", "-map", "1:a", "-t", String(DURATION),
            "-af", `afade=t=in:st=0:d=0.3,afade=t=out:st=${DURATION - 2.5}:d=2.5`,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out],
        { stdio: ["pipe", "inherit", "inherit"] },
    );
    const total = FPS * DURATION;
    for (let i = 0; i < total; i++) {
        await page.evaluate((v) => window.render(v), i / FPS);
        const buf = await page.screenshot({ type: "jpeg", quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
        if (i % 300 === 0) console.log(`frame ${i}/${total}`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg exit " + c)))));
    console.log("done", out);
}
await browser.close();
