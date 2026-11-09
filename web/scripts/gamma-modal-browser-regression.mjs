/** Isolated real-DOM regression; no Next build, app route, DB or external request. */
import assert from "node:assert/strict";
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
const temp = await mkdtemp(join(root, "node_modules/.cache/gamma-modal-regression-"));
const entry = join(temp, "main.tsx");
const dialogEntry = createRequire(require.resolve("radix-ui/package.json")).resolve("@radix-ui/react-dialog");
await writeFile(join(temp, "radix-dialog.ts"), `export * as Dialog from "${dialogEntry.replaceAll("\\", "/")}";`);
await writeFile(join(temp, "antd-modal.ts"), `export { default as Modal } from "${root.replaceAll("\\", "/")}/node_modules/antd/es/modal/index.js";`);
await writeFile(
    entry,
    `
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Modal, Drawer } from '${root.replaceAll("\\", "/")}/src/components/gamma-ui/gamma-ant-modal';
import { Form } from '${root.replaceAll("\\", "/")}/src/components/gamma-ui/gamma-ant-form';
const kind=new URLSearchParams(location.search).get('kind') || 'modal';
window.probe={mounts:0,cleanups:0,background:0,changes:0};
function Body(){
 const [count,setCount]=useState(0);
 const [form]=Form.useForm({value:'seed'});
 window.form=form;
 useEffect(()=>{window.probe.mounts++;return ()=>window.probe.cleanups++},[]);
 return <><input aria-label="Uncontrolled" defaultValue="initial"/><button onClick={()=>setCount(c=>c+1)}>Count {count}</button>
 <Form form={form} preserve={kind!=='no-preserve'} onValuesChange={()=>window.probe.changes++}>
 <Form.Item name="value" rules={[{required:true,message:'Required value'}]}><input aria-label="Form value"/></Form.Item>
 </Form><button onClick={()=>window.setChild(true)}>Open child</button>
 <Modal open={window.childOpen} title="Child" footer={null} onCancel={()=>window.setChild(false)}><input aria-label="Child input"/><button onClick={()=>window.setChild(false)}>Close child</button></Modal>
 </>;
}
function Harness(){
 const [open,setOpen]=useState(false),[child,setChild]=useState(false);
 window.childOpen=child;window.setChild=setChild;
 window.rapid=()=>{flushSync(()=>setChild(false));flushSync(()=>setChild(true))};
 window.closeAll=()=>{flushSync(()=>{setChild(false);setOpen(false)})};
 const dialogProps={open,title:'Main',onCancel:()=>setOpen(false),onClose:()=>setOpen(false),footer:<button onClick={()=>setOpen(false)}>Close main</button>,destroyOnHidden:kind==='destroy',forceRender:kind==='force'};
 return <><button id="background" onClick={()=>window.probe.background++}>Background</button><button id="open" onClick={()=>setOpen(true)}>Open main</button>
 {kind==='drawer'?<Drawer {...dialogProps}><Body/></Drawer>:<Modal {...dialogProps}><Body/></Modal>}</>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`,
);
const css = `body{margin:0;min-height:2600px;font:16px sans-serif}button,input{margin:8px;padding:8px}button{cursor:pointer}#root>button{position:relative}.ant-modal-mask,.ant-drawer-mask{position:fixed;inset:0;background:#0005;z-index:1000}.ant-modal-wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1000}.ant-modal{position:relative;background:white;padding:15px;pointer-events:auto;max-height:85vh;overflow:auto}.ant-drawer{position:fixed;right:0;top:0;height:100vh;background:white;z-index:1000;overflow:auto}.hidden,[data-state=closed]{display:none!important}.ant-modal-content,.ant-drawer-content{display:flex;flex-direction:column;min-height:0;flex:1}.ant-modal-body,.ant-drawer-body{flex:1;min-height:0;overflow:auto}.ant-modal-header,.ant-drawer-header{display:flex}.ant-modal-close,.ant-drawer-close{margin-left:auto}`;
const server = await createServer({
    configFile: false,
    root: temp,
    cacheDir: join(tmpdir(), "vozeb-gamma-modal-vite-cache"),
    resolve: {
        alias: [
            { find: /^radix-ui$/, replacement: join(temp, "radix-dialog.ts") },
            { find: /^antd$/, replacement: join(temp, "antd-modal.ts") },
            { find: "@", replacement: join(root, "src") },
        ],
        dedupe: ["react", "react-dom"],
    },
    server: { watch: { ignored: ["**/.e2e-artifacts/**", "**/.next*/**"] }, host: "127.0.0.1", port: 0, fs: { allow: [root, temp] } },
    optimizeDeps: { entries: [entry], include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "lucide-react", "antd/es/modal", "antd/es/config-provider/DisabledContext", "antd/es/form/context"] },
    plugins: [
        {
            name: "gamma-modal-fixture",
            configureServer(s) {
                s.middlewares.use((req, res, next) => {
                    if (req.url?.split("?")[0] !== "/__gamma-modal-harness") return next();
                    res.setHeader("Content-Type", "text/html");
                    res.end("<!doctype html><html><head><style>" + css + '</style></head><body><div id="root"></div><script type="module" src="/@fs/' + entry.replaceAll("\\", "/") + '"></script></body></html>');
                });
            },
        },
    ],
});
let browser;
const evidence = [];
try {
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__gamma-modal-harness`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log("Harness URL", url);
    const errors = [];
    page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("BROWSER:", e.message);
    });
    await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()));
    for (const kind of ["modal", "no-preserve", "drawer", "force", "destroy"]) {
        console.log("CASE", kind);
        await page.goto(url + "?kind=" + kind, { waitUntil: "commit" });
        await expect(page.locator("#open")).toBeVisible({ timeout: 120000 });
        if (kind === "force") {
            await expect.poll(() => page.evaluate(() => window.probe.mounts)).toBe(1);
            await expect(page.getByLabel("Uncontrolled")).toBeHidden();
            await page.locator("#background").click();
            assert.equal(await page.evaluate(() => window.probe.background), 1);
            assert.equal(await page.evaluate(() => document.body.style.pointerEvents), "");
        }
        await page.locator("#open").click();
        await page.getByLabel("Uncontrolled").fill("retained draft");
        assert.equal(await page.locator("#root").getAttribute("aria-hidden"), "true");
        await page.mouse.move(10, 400);
        await page.mouse.wheel(0, 450);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => scrollY), 0);
        await page.getByRole("button", { name: "Count 0", exact: true }).click();
        await page.getByLabel("Form value").fill("");
        await expect(page.getByText("Required value", { exact: true })).toBeVisible();
        const identity = await page.getByLabel("Uncontrolled").elementHandle();
        const changes = await page.evaluate(() => window.probe.changes);
        assert.equal(await page.evaluate(() => window.form.isFieldsTouched()), true);
        await page.getByRole("button", { name: "Close main", exact: true }).click();
        await expect(page.getByLabel("Uncontrolled")).toBeHidden();
        if (kind !== "destroy") assert.equal(await identity.evaluate((el) => el.isConnected), true);
        await page.locator("#background").click();
        await expect.poll(() => page.evaluate(() => document.body.style.pointerEvents)).toBe("");
        assert.equal(await page.locator("#root").getAttribute("aria-hidden"), null);
        console.log(
            "CLOSED",
            await page.evaluate(() => ({
                styles: document.body.getAttribute("style"),
                scrollLock: document.body.getAttribute("data-scroll-locked"),
                h: document.documentElement.scrollHeight,
                overlays: document.querySelectorAll(".ant-modal-mask,.ant-drawer-mask").length,
            })),
        );
        await page.mouse.move(10, 400);
        await page.mouse.wheel(0, 450);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
        await page.evaluate(() => scrollTo(0, 0));
        await page.locator("#open").click();
        if (kind === "destroy") {
            await expect(page.getByLabel("Uncontrolled")).toHaveValue("initial");
            await expect(page.getByRole("button", { name: "Count 0", exact: true })).toBeVisible();
            assert.equal(await page.evaluate(() => window.probe.mounts), 2);
        } else {
            await expect(page.getByLabel("Uncontrolled")).toHaveValue("retained draft");
            assert.equal(await page.getByLabel("Uncontrolled").evaluate((el, old) => el === old, identity), true);
            await expect(page.getByRole("button", { name: "Count 1", exact: true })).toBeVisible();
            await expect(page.getByText("Required value", { exact: true })).toBeVisible();
            assert.equal(await page.evaluate(() => window.form.isFieldsTouched()), true);
            assert.equal(await page.evaluate(() => window.probe.mounts), 1);
            assert.equal(await page.evaluate(() => window.probe.cleanups), 0);
            assert.equal(await page.evaluate(() => window.probe.changes), changes);
        }
        evidence.push({ kind, ...(await page.evaluate(() => window.probe)) });
    }
    await page.goto(url + "?kind=modal");
    await page.locator("#open").click();
    await page.getByRole("button", { name: "Open child", exact: true }).click();
    await page.getByLabel("Child input").focus();
    await page.evaluate(() => window.rapid());
    await expect(page.getByLabel("Child input")).toBeVisible();
    await page.getByLabel("Child input").focus();
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
        assert.equal(await page.evaluate(() => document.activeElement.closest("[role=dialog]")?.getAttribute("aria-labelledby") === document.querySelector('input[aria-label="Child input"]').closest("[role=dialog]").getAttribute("aria-labelledby")), true);
    }
    await page.getByRole("button", { name: "Close child", exact: true }).click();
    await expect(page.getByLabel("Child input")).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement.closest("[role=dialog]") !== null)).toBe(true);
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
        assert.equal(await page.evaluate(() => document.activeElement.closest("[role=dialog]") !== null), true);
    }
    await page.getByRole("button", { name: "Close main", exact: true }).click();
    await expect(page.locator("#open")).toBeFocused();
    await page.locator("#background").click();
    await page.locator("#open").click();
    await page.getByRole("button", { name: "Open child", exact: true }).click();
    await page.getByLabel("Child input").focus();
    await page.evaluate(() => window.closeAll());
    await expect(page.locator("#open")).toBeFocused();
    await page.locator("#background").click();
    await page.locator("#open").click();
    await expect(page.getByLabel("Uncontrolled")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Uncontrolled")).toBeHidden();
    await page.locator("#open").click();
    await page.locator(".ant-modal-mask").click({ position: { x: 8, y: 8 } });
    await expect(page.getByLabel("Uncontrolled")).toBeHidden();
    assert.deepEqual(errors, []);
    evidence.push({ kind: "nested-rapid-focus", passed: true });
    console.log(JSON.stringify({ passed: true, evidence }, null, 2));
} finally {
    await browser?.close();
    await server.close();
    assert.equal(resolve(temp).startsWith(resolve(root, "node_modules/.cache") + sep), true);
    await rm(temp, { recursive: true, force: true });
}
