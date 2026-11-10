import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer } = await import(pathToFileURL(viteRequire.resolve("vite")).href);
const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "node_modules/.cache"), { recursive: true });
const temp = await mkdtemp(join(root, "node_modules/.cache/canvas-resolution-"));
const entry = join(temp, "main.tsx");
await writeFile(
    entry,
    `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CanvasImageSettingsPopover} from '@/app/(user)/canvas/components/canvas-image-settings-popover';
import {CanvasVideoSettingsPopover} from '@/app/(user)/canvas/components/canvas-video-settings-popover';
import {usePublicSessionStore} from '@/stores/use-public-session-store';
import {CANVAS_UI_FEATURES} from '@/lib/canvas-ui-features';
import {defaultConfig} from '@/stores/use-config-store';
import {buildCanvasNodeConfig,canvasImageConfigPatch} from '@/app/(user)/canvas/utils/canvas-node-config';
import {applyNodeConfigPatch,buildGenerationConfig,buildImageGenerationMetadata} from '@/app/(user)/canvas/[id]/canvas-page-utils';
window.setCanvasFlag=(id,enabled)=>usePublicSessionStore.setState(s=>({payload:{...s.payload,settings:{...s.payload?.settings,featureModules:{...s.payload?.settings?.featureModules,[id]:enabled}}}}));
const initial={id:'fixture',type:'image',title:'Fixture',position:{x:0,y:0},width:340,height:240,metadata:{quality:'medium',resolution:'2k',size:'16:9'}};
function Harness(){const [node,setNode]=useState(()=>JSON.parse(localStorage.getItem('fixture')||JSON.stringify(initial)));const [video,setVideo]=useState({video:{quality:'720',size:'16:9',seconds:5}});
const global={...defaultConfig,imageResolution:'2k',imageModel:'image-fixture',imageModels:['image-fixture'],models:['image-fixture']};const config=buildCanvasNodeConfig(global,node,'image','image-fixture');window.snapshot=node;
const update=(next)=>{setNode(next);localStorage.setItem('fixture',JSON.stringify(next))};return <main><h1>Canvas generation parameters regression</h1><CanvasImageSettingsPopover config={config} placement='bottomLeft' onConfigChange={(k,v)=>update(applyNodeConfigPatch(node,canvasImageConfigPatch(k,v)))}/><button id='generate' onClick={()=>{const next=buildGenerationConfig(global,node,'image');window.submission=next;update({...node,metadata:{...node.metadata,...buildImageGenerationMetadata('generation',next,1,[])}})}}>Simulate generation snapshot</button><div style={{marginTop:30}}><CanvasVideoSettingsPopover config={{...global,vquality:video.video.quality,size:video.video.size,videoSeconds:String(video.video.seconds)}} references={[]} placement='bottomLeft' onMetadataChange={()=>{}} onConfigChange={(k,v)=>setVideo({video:{...video.video,...(k==='vquality'?{quality:v}:k==='size'?{size:v}:{})}})}/></div></main>}
createRoot(document.getElementById('root')).render(<Harness/>);
`,
);
const server = await createServer({
    configFile: false,
    root: temp,
    cacheDir: join(tmpdir(), "vozeb-canvas-parameter-cache"),
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": join(root, "src") }, dedupe: ["react", "react-dom"] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, temp] } },
    optimizeDeps: { entries: [entry], include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "antd", "lucide-react"] },
    plugins: [
        {
            name: "fixture",
            configureServer(s) {
                s.middlewares.use((req, res, next) => {
                    if (req.url?.split("?")[0] !== "/__fixture") return next();
                    res.setHeader("Content-Type", "text/html");
                    res.end(
                        '<!doctype html><style>body{margin:0;font:14px sans-serif}main{padding:16px;max-width:100%;box-sizing:border-box}button{max-width:100%}.ant-popover{max-width:calc(100vw - 16px)}</style><div id="root"></div><script type="module" src="/@fs/' +
                            entry.replaceAll("\\", "/") +
                            '"></script>',
                    );
                });
            },
        },
    ],
});
let browser;
const results = [];
try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 390, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", (e) => {
            errors.push(e.message);
            console.error("BROWSER", e.message);
        });
        page.on("console", (m) => {
            if (m.type() === "error") console.error("CONSOLE", m.text());
        });
        page.on("requestfailed", (r) => console.error("REQUEST", r.url(), r.failure()?.errorText));
        await page.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort()));
        await page.goto("http://127.0.0.1:" + server.httpServer.address().port + "/__fixture");
        const image = page.getByRole("button", { name: /^图片设置：/ });
        await expect(image).toBeVisible({ timeout: 120000 });
        await image.click();
        await expect(page.getByRole("button", { name: "打开图片自定义像素尺寸", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "选择图片清晰度 4K", exact: true }).click();
        await expect(page.getByRole("button", { name: "选择图片清晰度 4K", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(image).toContainText("4K");
        await image.click();
        await page.locator("#generate").click();
        expect(await page.evaluate(() => window.submission.imageResolution)).toBe("4k");
        expect(await page.evaluate(() => window.snapshot.metadata.resolution)).toBe("4k");
        await expect(image).toContainText("4K");
        await page.reload();
        await expect(image).toContainText("4K");
        await page.getByRole("button", { name: /^视频设置：/ }).click();
        await expect(page.getByRole("button", { name: "选择视频清晰度 720P", exact: true })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "输入自定义视频清晰度" })).toHaveCount(0);
        await page.getByRole("button", { name: "选择视频清晰度 1080P", exact: true }).click();
        await expect(page.getByRole("button", { name: "选择视频清晰度 1080P", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "打开视频自定义像素尺寸", exact: true })).toHaveCount(0);
        await page.evaluate(() => window.setCanvasFlag("canvas-ui-video-custom-resolution", true));
        await expect(page.getByRole("textbox", { name: "输入自定义视频清晰度" })).toBeVisible();
        await page.getByRole("button", { name: "打开视频自定义像素尺寸", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "自定义视频宽度", exact: true })).toBeVisible();
        await page.evaluate(() => window.setCanvasFlag("canvas-ui-video-custom-resolution", false));
        await expect(page.getByRole("textbox", { name: "输入自定义视频清晰度" })).toHaveCount(0);
        await expect(page.getByRole("textbox", { name: "自定义视频宽度", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: /^视频设置：/ }).click();
        await image.click();
        await expect(page.getByRole("button", { name: "打开图片自定义像素尺寸", exact: true })).toHaveCount(0);
        await page.evaluate(() => window.setCanvasFlag("canvas-ui-image-custom-resolution", true));
        await page.getByRole("button", { name: "打开图片自定义像素尺寸", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "自定义图片宽度", exact: true })).toBeVisible();
        await page.evaluate(() => window.setCanvasFlag("canvas-ui-image-custom-resolution", false));
        await expect(page.getByRole("textbox", { name: "自定义图片宽度", exact: true })).toHaveCount(0);
        await expect(image).toContainText("4K");
        expect(errors).toEqual([]);
        results.push({ width, resolution: "4k", snapshot: "4k", reload: "4k", customVideoQuality: false, errors });
        await page.close();
    }
    console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
    if (browser) await browser.close();
    await server.close();
    const checked = resolve(temp);
    if (!checked.startsWith(resolve(root, "node_modules/.cache") + sep)) throw Error("Invalid cleanup");
    await rm(checked, { recursive: true, force: true });
}
