import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD } from "./support";

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
            await expect(rolePage.locator("[data-practice-module]")).toHaveCount(6);
            await expect(rolePage.locator('[data-practice-module="character"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="scene"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="prop"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="storyboard-image"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="storyboard-video"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="dubbing"]')).toBeVisible();
            await expect(rolePage.locator('[data-practice-module="script"]')).toHaveCount(0);
            await expect(rolePage.locator('[data-practice-module="music"]')).toHaveCount(0);
            const overflow = await rolePage.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
            expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);

            const hiddenScript = await rolePage.goto("/practice/script", { waitUntil: "domcontentloaded" });
            expect(hiddenScript?.status()).toBe(404);
            const hiddenMusic = await rolePage.goto("/practice/music", { waitUntil: "domcontentloaded" });
            expect(hiddenMusic?.status()).toBe(404);

            await rolePage.goto("/practice/character", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成角色图", { exact: true })).toBeVisible();
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

            await rolePage.goto("/practice/dubbing", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByText("等待生成配音", { exact: true })).toBeVisible();
            await rolePage.getByLabel("配音文本").fill("欢迎来到练习课堂。");
            await rolePage.getByRole("button", { name: "开始配音", exact: true }).click();
            await expect(rolePage.locator("audio")).toBeVisible();
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
    await page.route("**/api/practice/modules", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { modules, projects: { canvas: false, drama: false } }, msg: "ok" }) }));
    await page.route("**/api/practice/sessions**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { sessions: [], total: 0, page: 1, pageSize: 24 }, msg: "ok" }) });
        const body = request.postDataJSON() as { module?: string; mode?: string; input?: Record<string, unknown> };
        const moduleName = body.module || "script";
        const media = ["character", "scene", "prop", "storyboard-image"].includes(moduleName)
            ? { kind: "image", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=" }
            : moduleName === "dubbing"
              ? { kind: "audio", url: "data:audio/wav;base64,UklGRgAAAAAA" }
              : undefined;
        const session = {
            id: `fixture-${moduleName}`,
            title: moduleName,
            module: moduleName,
            mode: body.mode || "workflow",
            input: body.input || {},
            status: body.mode === "manual" ? "draft" : "success",
            ...(media ? { result: { status: "success", media } } : {}),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
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
            inputSchema: [{ key: "prompt", label: "角色描述", type: "textarea", required: true }],
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
