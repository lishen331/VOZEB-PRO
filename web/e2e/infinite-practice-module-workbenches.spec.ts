import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { createAuthenticatedE2EContext, e2eProjectContextOptions, E2E_PRACTICE_PASSWORD } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

test.describe.configure({ mode: "serial" });

test("学校成员使用六个独立的无限练习工作台", async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const managerUsername = `practice_manager_${suffix}`;
    const teacherUsername = `practice_teacher_${suffix}`;
    const schoolResponse = await page.request.post("/api/admin/schools", {
        data: { name: `无限练习验收学校 ${suffix}`, profile: { purpose: "e2e-infinite-practice" }, administrator: { username: managerUsername, displayName: `练习管理员 ${suffix}`, password: E2E_PRACTICE_PASSWORD } },
    });
    expect(schoolResponse.ok(), await schoolResponse.text()).toBe(true);
    const managerContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: managerUsername, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
    try {
        const membersResponse = await managerContext.request.post("/api/school/members", { data: { rows: [{ username: teacherUsername, displayName: `练习老师 ${suffix}`, password: E2E_PRACTICE_PASSWORD, role: "teacher" }] } });
        expect(membersResponse.ok(), await membersResponse.text()).toBe(true);
        const teacherContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: teacherUsername, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
        try {
            const rolePage = await teacherContext.newPage();
            await installPracticeFixtures(rolePage, moduleFixtureCapabilities());
            await rolePage.goto("/practice", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByRole("heading", { name: "无限练习", exact: true })).toBeVisible();
            const entry = rolePage.locator("[data-practice-single-entry]");
            await expect(entry).toHaveCount(1);
            await expect(entry).toContainText("单项练习");
            await expect(entry).toContainText("6 类练习");
            const overflow = await rolePage.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
            expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);

            for (const hiddenPath of ["/practice/script", "/practice/music"]) {
                const hidden = await rolePage.goto(hiddenPath, { waitUntil: "domcontentloaded" });
                // Streaming notFound responses keep HTTP 200; assert the denial UI and indexing exclusion, not only transport status.
                expect([200, 404]).toContain(hidden?.status());
                await expect(rolePage.getByRole("heading", { name: "页面不存在", exact: true })).toBeVisible();
                await expect(rolePage.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
                await expect(rolePage.getByRole("tablist", { name: "单项练习模块切换" })).toHaveCount(0);
            }

            await rolePage.goto("/practice", { waitUntil: "domcontentloaded" });
            await entry.click();
            await expect(rolePage).toHaveURL(/\/practice\/character$/);
            const switcher = rolePage.getByRole("tablist", { name: "单项练习模块切换" });
            await expect(switcher.getByRole("tab")).toHaveText(["角色", "场景", "道具", "分镜图", "分镜视频", "音频"]);
            await switcher.getByRole("tab", { name: "场景", exact: true }).click();
            await expect(rolePage).toHaveURL(/\/practice\/scene$/);
            await switcher.getByRole("tab", { name: "角色", exact: true }).click();
            await expect(rolePage).toHaveURL(/\/practice\/character$/);
            await expect(rolePage.getByText("等待生成角色图", { exact: true })).toBeVisible();
            const boxes = await rolePage.locator('[aria-label="练习工具"], [aria-label="当前结果"]').evaluateAll((nodes) =>
                nodes.map((node) => {
                    const r = node.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, right: r.right };
                }),
            );
            if ((testInfo.project.use.viewport?.width || 1280) >= 1024) {
                expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
                expect(boxes[1].x).toBeGreaterThan(boxes[0].right);
            } else {
                expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
            }
            await expect(rolePage.getByRole("spinbutton", { name: "宽", exact: false })).toHaveCount(1);
            await expect(rolePage.getByRole("spinbutton", { name: "宽", exact: false })).toHaveValue("720");
            await expect(rolePage.getByRole("textbox", { name: "正视图指令", exact: true })).toHaveCount(0);
            await rolePage.getByText("多视图", { exact: true }).click();
            await expect(rolePage.getByRole("textbox", { name: "正视图指令", exact: true })).toBeVisible();
            await expect(rolePage.getByRole("spinbutton", { name: /合并图宽度/ })).toHaveValue("1350");
            await expect(rolePage.getByRole("spinbutton")).toHaveCount(2);
            await rolePage.getByLabel("主形象参考图（必需）", { exact: true }).setInputFiles({ name: "character.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
            const multiSubmit = rolePage.waitForRequest((request) => request.url().endsWith("/api/practice/sessions") && request.method() === "POST");
            await rolePage.getByRole("button", { name: "生成角色多视图", exact: true }).click();
            const multiBody = (await multiSubmit).postDataJSON();
            expect(multiBody.workflowCode).toBe("character_multi_view");
            expect(multiBody.input.width).toBe(1350);
            expect(multiBody.input.height).toBe(2400);
            await expect(rolePage.getByRole("img", { name: "练习结果" })).toBeVisible();
            await rolePage.getByText("主形象", { exact: true }).click();
            await expect(rolePage.getByRole("textbox", { name: "正视图指令", exact: true })).toHaveCount(0);
            await expect(rolePage.getByRole("spinbutton", { name: "宽", exact: false })).toHaveValue("720");
            await rolePage.getByLabel("角色设定", { exact: true }).fill("角色设定测试");
            await rolePage.getByRole("button", { name: "生成提示词", exact: true }).click();
            await expect(rolePage.getByRole("textbox", { name: "角色描述", exact: true })).toHaveValue("可编辑的角色提示词");
            await rolePage.getByRole("textbox", { name: "角色描述", exact: true }).fill("用户最终编辑的提示词");
            await rolePage.locator("[data-practice-workbench]").evaluate((node) => {
                node.scrollTop = 0;
            });
            await rolePage.screenshot({ path: testInfo.outputPath("character-form.png") });
            const mainSubmit = rolePage.waitForRequest((request) => request.url().endsWith("/api/practice/sessions") && request.method() === "POST");
            await rolePage.getByRole("button", { name: "生成角色主视图", exact: true }).click();
            const mainBody = (await mainSubmit).postDataJSON();
            expect(mainBody.input.prompt).toBe("用户最终编辑的提示词");
            expect(mainBody.input).not.toHaveProperty("frontPrompt");
            await expect(rolePage.getByRole("textbox", { name: "角色描述", exact: true })).toHaveValue("用户最终编辑的提示词");
            await rolePage.reload();
            await expect(rolePage.getByRole("img", { name: "练习结果" })).toBeVisible();
            await rolePage.goto("/practice/character");
            await expect(rolePage).toHaveURL(/sessionId=/);
            await expect(rolePage.getByRole("img", { name: "练习结果" })).toBeVisible();

            await rolePage.goto("/practice/scene", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成场景图", { exact: true })).toBeVisible();
            await rolePage.goto("/practice/prop", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成道具图", { exact: true })).toBeVisible();

            await rolePage.goto("/practice/storyboard-image", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成分镜图", { exact: true })).toBeVisible();
            await rolePage.getByLabel("主场景图（必需）").setInputFiles({ name: "scene.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
            await rolePage.getByLabel("画面描述").fill("雨夜车站，中景");
            await rolePage.getByRole("button", { name: "生成分镜图", exact: true }).click();
            await expect(rolePage.getByRole("img", { name: "练习结果" })).toBeVisible();

            await rolePage.goto("/practice/storyboard-video", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成分镜视频", { exact: true })).toBeVisible();
            await expect(rolePage.getByRole("button", { name: "生成分镜视频", exact: true })).toBeDisabled();
            await rolePage.getByLabel("分镜图（必需）", { exact: true }).setInputFiles({ name: "video.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
            await rolePage.getByLabel("视频提示词", { exact: true }).fill("缓慢推进");
            await expect(rolePage.getByRole("switch", { name: "启用台词音频", exact: true })).toBeChecked();
            await expect(rolePage.locator("audio").first()).toBeVisible();
            await expect(rolePage.getByRole("button", { name: "生成分镜视频", exact: true })).toBeEnabled();
            await rolePage.getByRole("combobox", { name: "配音音色", exact: true }).click();
            await rolePage.getByText("不使用音频", { exact: true }).click();
            await expect(rolePage.getByRole("switch", { name: "启用台词音频", exact: true })).not.toBeChecked();
            const videoWithAudioSubmit = rolePage.waitForRequest((request) => request.url().endsWith("/api/practice/sessions") && request.method() === "POST");
            // The voice selector is hidden while audio is disabled. Re-enable through its visible switch.
            await rolePage.getByRole("switch", { name: "启用台词音频", exact: true }).check();
            await expect(rolePage.locator("audio").first()).toBeVisible();
            await rolePage.getByRole("button", { name: "生成分镜视频", exact: true }).click();
            const videoWithAudioBody = (await videoWithAudioSubmit).postDataJSON();
            expect(videoWithAudioBody.input.audioEnabled).toBe(true);
            expect(videoWithAudioBody.references).toEqual(expect.arrayContaining([expect.objectContaining({ type: "asset", inputKey: "audio" })]));

            await rolePage.goto("/practice/dubbing", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成配音", { exact: true })).toBeVisible();
            await rolePage.getByLabel("配音文本").fill("欢迎来到练习课堂。");
            const happy = rolePage.getByRole("slider", { name: "台词 1 开心", exact: true });
            await happy.focus();
            await happy.press("ArrowRight");
            await expect(happy).toHaveValue("0.01");
            await rolePage.getByText("六维情绪", { exact: true }).scrollIntoViewIfNeeded();
            await rolePage.screenshot({ path: testInfo.outputPath("emotion-sliders.png") });
            const audioSubmit = rolePage.waitForRequest((request) => request.url().endsWith("/api/practice/sessions") && request.method() === "POST");

            await rolePage.getByRole("button", { name: "开始配音", exact: true }).click();
            const audioBody = (await audioSubmit).postDataJSON();
            expect(audioBody.input.lines[0].emotion.happy).toBe(0.01);
            expect(audioBody.input.lines[0].text).toBe("欢迎来到练习课堂。");
            await expect(rolePage.locator("audio").first()).toBeVisible();
            await rolePage.goto("/practice/storyboard-video");
            await rolePage.getByRole("switch", { name: "启用台词音频", exact: true }).check();
            await expect(rolePage.getByRole("link", { name: "去配音", exact: true })).toHaveAttribute("href", "/practice/dubbing");
            await rolePage.getByRole("combobox", { name: "配音音色", exact: true }).click();
            await rolePage.getByText("引用历史配音", { exact: true }).click();
            await rolePage.getByRole("combobox", { name: "历史配音", exact: true }).click();
            await expect(rolePage.getByText(/dubbing ·/).last()).toBeVisible();
            await rolePage.keyboard.press("Escape");

            for (const moduleKind of ["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"]) {
                await rolePage.goto(`/practice/${moduleKind}`, { waitUntil: "domcontentloaded" });
                await expect(rolePage.getByText("开源模型", { exact: false }).first()).toBeVisible();
                const geometry = await rolePage.locator('[aria-label="练习工具"], [aria-label="当前结果"]').evaluateAll((nodes) =>
                    nodes.map((node) => {
                        const r = node.getBoundingClientRect();
                        return { left: r.left, top: r.top, right: r.right, width: r.width };
                    }),
                );
                expect(geometry.every((box) => box.left >= 0 && box.right <= (testInfo.project.use.viewport?.width || 1280))).toBe(true);
                if ((testInfo.project.use.viewport?.width || 1280) >= 1024) expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(2);
                if (["character", "scene", "prop", "storyboard-image", "storyboard-video"].includes(moduleKind)) {
                    const labels: Record<string, [string, string]> = {
                        character: ["角色设定", "角色描述"],
                        scene: ["场景设定", "场景描述"],
                        prop: ["道具设定", "道具描述"],
                        "storyboard-image": ["分镜脚本", "画面描述"],
                        "storyboard-video": ["分镜脚本", "视频提示词"],
                    };
                    const [brief, prompt] = labels[moduleKind];
                    await rolePage.getByRole("textbox", { name: brief, exact: true }).fill("本模块需求");
                    const optimized = rolePage.waitForRequest((request) => request.url().endsWith("/api/practice/prompt-optimization"));
                    await rolePage.getByRole("button", { name: "生成提示词", exact: true }).click();
                    expect((await optimized).postDataJSON().prompt).toContain(prompt);
                    await expect(rolePage.getByRole("textbox", { name: prompt, exact: true })).toHaveValue("可编辑的角色提示词");
                }
                await rolePage.screenshot({ path: testInfo.outputPath(`${moduleKind}-layout.png`) });
            }
            const mobileNavigation = (rolePage.viewportSize()?.width || 0) < 1024;
            if (mobileNavigation) await rolePage.getByRole("button", { name: "打开导航菜单", exact: true }).click();
            await rolePage.getByRole("button", { name: /切换到(?:深色|黑夜)主题/ }).click();
            await expect(rolePage.getByRole("button", { name: /切换到(?:浅色|白昼|白色)主题/ })).toBeVisible();
            await rolePage.evaluate(async () => {
                // 只等待有限次数的过渡动画；循环装饰动画没有 finished 终态，不能参与验收等待。
                const finiteAnimations = document.getAnimations().filter((animation) => {
                    const iterations = animation.effect?.getComputedTiming().iterations;
                    return iterations !== Infinity;
                });
                await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
            });
            if (mobileNavigation) {
                await rolePage.keyboard.press("Escape");
                await expect(rolePage.getByRole("dialog", { name: "导航菜单", exact: true })).toBeHidden();
            }
            await rolePage.screenshot({ path: testInfo.outputPath("audio-dark.png") });
            await rolePage.close();
        } finally {
            await teacherContext.close();
        }
    } finally {
        await managerContext.close();
    }
});

test("没有学校成员身份的账号不能访问无限练习", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
        const response = await context.request.get("/api/practice/modules");
        expect(response.status()).toBe(401);
        const page = await context.newPage();
        const denied = await page.goto("/practice", { waitUntil: "domcontentloaded" });
        expect(denied?.status()).toBe(200);
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    } finally {
        await context.close();
    }
});

async function installPracticeFixtures(page: import("@playwright/test").Page, modules: ReturnType<typeof moduleFixtureCapabilities>) {
    const saved = new Map<string, Record<string, unknown>>();
    await page.route("**/api/practice/prompt-optimization", (route) => route.fulfill({ json: { code: 200, data: { prompt: "可编辑的角色提示词" }, msg: "ok" } }));
    await page.route("**/api/practice/modules", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { modules, projects: { canvas: false, drama: false } }, msg: "ok" }) }));
    await page.route("**/api/practice/sessions**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
            const url = new URL(request.url());
            const id = url.pathname.split("/").at(-1)!;
            if (id !== "sessions") return route.fulfill({ json: { code: 0, data: { session: saved.get(id) }, msg: "ok" } });
            const sessions = [...saved.values()].filter((session) => !url.searchParams.get("module") || session.module === url.searchParams.get("module")).reverse();
            return route.fulfill({ json: { code: 0, data: { sessions, total: sessions.length, page: 1, pageSize: 24 }, msg: "ok" } });
        }
        const body = request.postDataJSON() as { module?: string; mode?: string; input?: Record<string, unknown> };
        const moduleName = body.module || "script";
        const media = ["character", "scene", "prop", "storyboard-image"].includes(moduleName)
            ? { kind: "image", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=" }
            : moduleName === "dubbing"
              ? { kind: "audio", url: "data:audio/wav;base64,UklGRgAAAAAA" }
              : undefined;
        const session = {
            id: `fixture-${moduleName}-${saved.size}`,
            title: moduleName,
            module: moduleName,
            mode: body.mode || "workflow",
            input: body.input || {},
            status: body.mode === "manual" ? "draft" : "success",
            ...(media ? { result: { status: "success", media } } : {}),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        saved.set(session.id, session);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { session }, msg: "ok" }) });
    });
}

function moduleFixtureCapabilities() {
    return [
        {
            module: "character",
            mode: "workflow",
            available: true,
            models: [{ id: "image-one", label: "图片模型" }],
            inputSchema: [
                { key: "prompt", label: "角色描述", type: "textarea", required: true },
                { key: "width", label: "宽", type: "number", required: true, defaultValue: 720 },
                { key: "height", label: "高", type: "number", required: true, defaultValue: 1280 },
            ],
            workflowOptions: [
                {
                    code: "character_main_view",
                    label: "角色主视图",
                    inputSchema: [
                        { key: "prompt", label: "角色描述", type: "textarea", required: true },
                        { key: "width", label: "宽", type: "number", required: true, defaultValue: 720 },
                        { key: "height", label: "高", type: "number", required: true, defaultValue: 1280 },
                    ],
                },
                {
                    code: "character_multi_view",
                    label: "角色多视图",
                    inputSchema: [
                        { key: "prompt", label: "角色描述", type: "textarea", required: false },
                        { key: "frontPrompt", label: "正视图指令", type: "text", required: false, defaultValue: "正视图" },
                        { key: "width", label: "合并图宽度", type: "number", required: false, defaultValue: 1350 },
                        { key: "height", label: "合并图高度", type: "number", required: false, defaultValue: 2400 },
                    ],
                },
            ],
            outputType: "image",
        },
        {
            module: "scene",
            mode: "workflow",
            available: true,
            models: [{ id: "image-one", label: "图片模型" }],
            inputSchema: [{ key: "prompt", label: "场景描述", type: "textarea", required: true }],
            outputType: "image",
        },
        {
            module: "prop",
            mode: "workflow",
            available: true,
            models: [{ id: "image-one", label: "图片模型" }],
            inputSchema: [{ key: "prompt", label: "道具描述", type: "textarea", required: true }],
            outputType: "image",
        },
        {
            module: "storyboard-image",
            mode: "workflow",
            available: true,
            models: [
                { id: "image-one", label: "图片模型" },
                { id: "image-two", label: "备用图片模型" },
            ],
            inputSchema: [{ key: "prompt", label: "画面描述", type: "textarea", required: true }],
            outputType: "image",
        },
        {
            module: "storyboard-video",
            mode: "workflow",
            available: true,
            models: [{ id: "video-one", label: "视频模型" }],
            inputSchema: [
                { key: "referenceImage", label: "参考图片", type: "image", required: true },
                { key: "prompt", label: "视频提示词", type: "textarea", required: true },
            ],
            outputType: "video",
        },
        { module: "dubbing", mode: "workflow", available: true, models: [{ id: "voice-one", label: "配音模型" }], inputSchema: [{ key: "text", label: "配音文本", type: "textarea", required: true }], outputType: "audio" },
    ] as const;
}

test("局部编辑历史可回看、恢复和学习，不会自动重复生成", async ({ browser, page }, testInfo) => {
    const suffix = randomUUID().slice(0, 8);
    const managerUsername = `edit_mgr_${suffix}`;
    const studentUsername = `edit_student_${suffix}`;
    const createSchool = await page.request.post("/api/admin/schools", { data: { name: `局部编辑 ${suffix}`, administrator: { username: managerUsername, displayName: managerUsername, password: E2E_PRACTICE_PASSWORD } } });
    expect(createSchool.ok(), await createSchool.text()).toBe(true);
    const manager = await createAuthenticatedE2EContext(browser, BASE_URL, { username: managerUsername, password: E2E_PRACTICE_PASSWORD });
    try {
        const response = await manager.request.post("/api/school/members", { data: { rows: [{ username: studentUsername, displayName: studentUsername, password: E2E_PRACTICE_PASSWORD, role: "student" }] } });
        expect(response.ok(), await response.text()).toBe(true);
    } finally {
        await manager.close();
    }
    const student = await createAuthenticatedE2EContext(browser, BASE_URL, { username: studentUsername, password: E2E_PRACTICE_PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    try {
        const tab = await student.newPage();
        const path = "/api/reference-assets/permanent/fixtures/";
        const resultsPath = "/api/generation-log-assets/permanent/fixtures/";
        const source = await sharp({ create: { width: 96, height: 64, channels: 4, background: "#f6a700" } })
            .png()
            .toBuffer();
        const maskPixels = Buffer.alloc(96 * 64 * 4, 255);
        maskPixels[(32 * 96 + 48) * 4 + 3] = 0;
        const mask = await sharp(maskPixels, { raw: { width: 96, height: 64, channels: 4 } })
            .png()
            .toBuffer();
        await tab.route(/\/api\/(?:reference-assets|generation-log-assets)\/permanent\/fixtures\//, (route) => route.fulfill({ contentType: "image/png", body: route.request().url().includes("mask.png") ? mask : source }));
        const records = ["换成绿色", "换成蓝色"].map((prompt, i) => ({
            id: `fixture-edit-${i}`,
            prompt,
            createdAt: Date.UTC(2026, 10, 26, 3, 5 - i),
            model: "fixture-image",
            sourceUrl: `${path}source-${i}.png`,
            maskUrl: `${path}mask.png`,
            image: { url: `${resultsPath}result-${i}.png`, width: 96, height: 64, storageKey: "", bytes: source.length, mimeType: "image/png" },
        }));
        let generates = 0;
        let saves = 0;
        await tab.route("**/api/practice/image-tools", (route) => {
            if (route.request().method() !== "GET") generates++;
            return route.fulfill({ json: { records } });
        });
        await tab.route("**/api/library-assets", (route) => {
            if (route.request().method() === "POST") saves++;
            return route.continue();
        });
        await tab.goto("/practice/local-edit");
        const list = tab.getByRole("region", { name: "最近练习" });
        const draft = tab.getByPlaceholder("例如：把选中区域改为金属材质，保持原图光影");
        await expect(list.getByRole("button")).toHaveCount(2);
        await draft.fill("不要覆盖的草稿");
        await list.getByRole("button", { name: /换成蓝色/ }).click();
        await expect(draft).toHaveValue("不要覆盖的草稿");
        await expect(tab.getByAltText("原图", { exact: true })).toHaveAttribute("src", records[1].sourceUrl);
        await expect(tab.getByAltText("局部编辑结果")).toHaveAttribute("src", records[1].image.url);
        const lesson = tab.getByRole("region", { name: "提示词拆解" });
        await expect(lesson.getByText("换成蓝色", { exact: true })).toBeVisible();
        for (const title of ["改什么", "改成什么", "什么不变"]) await expect(lesson.getByText(title, { exact: true })).toBeVisible();
        await lesson.getByText("查看本次选区", { exact: true }).click();
        await expect(lesson.getByAltText("本次编辑选区")).toBeVisible();
        await lesson.getByRole("button", { name: "填回修改说明" }).click();
        await expect(draft).toHaveValue(/修改要求：换成蓝色/);
        await expect(tab.getByAltText("练习源图")).toHaveCount(0);
        await lesson.getByRole("button", { name: "用这次设置继续" }).click();
        await expect(draft).toHaveValue("换成蓝色");
        await expect(tab.getByAltText("练习源图")).toHaveAttribute("src", records[1].sourceUrl);
        await expect
            .poll(() =>
                tab.locator("canvas[aria-label='编辑选区画布']").evaluate((element) => {
                    const canvas = element as HTMLCanvasElement;
                    const ctx = canvas.getContext("2d")!;
                    return [canvas.width, canvas.height, ctx.getImageData(48, 32, 1, 1).data[3], ctx.getImageData(0, 0, 1, 1).data[3]];
                }),
            )
            .toEqual([96, 64, 148, 0]);
        await list.getByRole("button", { name: /换成绿色/ }).click();
        await expect(lesson.getByText("换成绿色", { exact: true })).toBeVisible();
        await expect(draft).toHaveValue("换成蓝色");
        await expect(tab.getByRole("link", { name: "下载结果" })).toHaveAttribute("href", records[0].image.url);
        await tab.evaluate(() => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: "dark" }, version: 0 })));
        await tab.reload();
        await expect(tab.locator("html")).toHaveClass(/dark/);
        await expect(list.getByRole("button")).toHaveCount(2);
        await list.getByRole("button", { name: /换成绿色/ }).click();
        await expect(lesson.getByText("换成绿色", { exact: true })).toBeVisible();
        const geometry = await tab.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
        await tab.screenshot({ path: testInfo.outputPath(`local-edit-learning-${testInfo.project.name}.png`), fullPage: true });
        expect({ generates, saves }).toEqual({ generates: 0, saves: 0 });
    } finally {
        await student.close();
    }
});
