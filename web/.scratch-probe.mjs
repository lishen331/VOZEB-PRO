import { chromium } from "@playwright/test";
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 1600, height: 950 } });
await c.request.post("http://localhost:3000/api/auth/login", { data: { username: "admin", password: "12345678" } });
const p = await c.newPage();
for (const path of ["/create", "/canvas"]) {
  await p.goto("http://localhost:3000" + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  for (const t of [5, 15, 30]) {
    await p.waitForTimeout(t === 5 ? 5000 : 10000);
    console.log(path, t + "s", await p.evaluate(() => { const v = document.querySelector(".gm-ambient-media video"); return { mounted: !!v, ready: v?.classList.contains("is-ready"), readyState: v?.readyState, networkState: v?.networkState, paused: v?.paused, pageVideos: document.querySelectorAll("video").length }; }));
  }
}
// 全屏画布不应有背景层
const res = await c.request.get("http://localhost:3000/api/canvas/projects").catch(() => null);
await b.close();
