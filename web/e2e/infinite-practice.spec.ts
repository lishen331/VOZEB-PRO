import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, E2E_PROTOCOL_ORIGIN, pollTask, protocolFixtureState } from "./support";

import type { AuthSettings } from "../src/lib/auth/store-types";

const baseURL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const tools = [
    ["director-desk", "选择一个导演台开始摆场景"],
    ["multi-angle", "多角度练习"],
    ["reverse-prompt", "反推提示词"],
    ["local-edit", "局部编辑"],
    ["expression-reference", "表情参考"],
    ["ai-outpainting", "AI 扩图"],
] as const;

test("学校账号可打开六个练习工具，旧超分直链仍可使用", async ({ browser, page }, testInfo) => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const username = `newtools_${suffix}`;
    const response = await page.request.post("/api/admin/schools", {
        data: { name: `练习工具验收 ${suffix}`, profile: { purpose: "e2e-practice-tools" }, administrator: { username, displayName: `练习管理员 ${suffix}`, password: E2E_PRACTICE_PASSWORD } },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL, { username, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
    try {
        const toolPage = await context.newPage();
        await toolPage.goto("/practice");
        await expect(toolPage.locator('[data-practice-tool="super-resolution"]')).toHaveCount(0);
        for (const [slug, heading] of tools) {
            await toolPage.goto("/practice");
            await toolPage.locator(`[data-practice-tool="${slug}"]`).click();
            await expect(toolPage).toHaveURL(`/practice/${slug}`);
            await expect(toolPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
            if (slug === "director-desk") await expect(toolPage.getByRole("button", { name: "新建导演台", exact: true })).toBeEnabled();
        }
        await toolPage.goto("/practice/super-resolution");
        await expect(toolPage.getByRole("heading", { name: "超分放大", exact: true })).toBeVisible();
        const generationRequests: string[] = [];
        toolPage.on("request", (request) => {
            const pathname = new URL(request.url()).pathname;
            if (request.method() === "POST" && ["/api/practice/image-tools", "/api/image-tasks", "/api/text-tasks"].includes(pathname)) generationRequests.push(pathname);
        });
        const file = { name: "practice-fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") };
        await toolPage.locator('input[type="file"]').setInputFiles(file);
        await expect(toolPage.getByRole("img", { name: "练习源图" })).toBeVisible();
        await toolPage.getByLabel("目标长边").selectOption("1024");
        await toolPage.getByRole("button", { name: "开始本地放大" }).click();
        const result = toolPage.getByRole("img", { name: "超分放大结果" });
        await expect(result).toBeVisible();
        await expect.poll(() => result.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1024);
        expect(generationRequests).toEqual([]);
        await expect(toolPage.getByRole("link", { name: /下载/ })).toBeVisible();
    } finally {
        await context.close();
    }
});

test("公共提示词库按每页 24 条请求数据", async ({ page }) => {
    await page.route(/\/api\/prompts(?:\?.*)?$/, (route) => route.fulfill({ json: { items: [], tags: [], categories: [], total: 0 } }));
    const request = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/prompts" && req.method() === "GET");
    await page.goto("/prompts");
    await expect(page.getByRole("heading", { name: "提示词库", exact: true })).toBeVisible();
    const params = new URL((await request).url()).searchParams;
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("24");
});

test("练习视觉与蒙版工具通过独立模型发到本地夹具", async ({ browser, page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "同一后端链路已在桌面覆盖；移动端 UI 另行验证");
    const admin = page.request;
    const beforeResponse = await admin.get("/api/admin/settings");
    expect(beforeResponse.ok()).toBe(true);
    const before = (await beforeResponse.json()) as { settings: AuthSettings; settingsRevision: number };
    const source = before.settings.systemChannels.find((channel) => channel.id === "e2e-primary");
    expect(source?.baseUrl).toBe(`${E2E_PROTOCOL_ORIGIN}/v1`);
    const id = "e2e-standalone-tools";
    const vision = "e2e-standalone-vision";
    const edit = "e2e-standalone-edit";
    const textUpstream = "mock-text";
    const imageUpstream = "gpt-image-1";
    const advanced = source!.advancedConfig!;
    const channel = {
        ...source!,
        id,
        name: "E2E 练习工具专用",
        apiKey: "e2e-standalone-tools-fixture",
        enabled: false,
        practiceEnabled: true,
        purpose: "open-source-practice",
        models: [textUpstream, imageUpstream],
        advancedConfig: { ...advanced, modelConfigs: { [textUpstream]: advanced.modelConfigs!["e2e-text"], [imageUpstream]: advanced.modelConfigs!["e2e-image"] } },
    };
    const settingsPatch = await admin.patch("/api/admin/settings", {
        data: {
            settingsRevision: before.settingsRevision,
            systemChannels: [...before.settings.systemChannels, channel],
            logicalModels: [
                ...before.settings.logicalModels,
                { id: vision, name: vision, capability: "text", enabled: true, bindings: [{ id: `${id}-text`, channelId: id, upstreamModel: textUpstream, enabled: true, priority: 1, capabilityProfile: { supportsImageInput: true } }] },
                { id: edit, name: edit, capability: "image", enabled: true, bindings: [{ id: `${id}-image`, channelId: id, upstreamModel: imageUpstream, enabled: true, priority: 1 }] },
            ],
            practiceDefaultModels: { visionModel: vision, imageModel: edit },
        },
    });
    expect(settingsPatch.ok(), await settingsPatch.text()).toBe(true);
    try {
        const username = `tool_fixture_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
        const school = await admin.post("/api/admin/schools", { data: { name: username, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } } });
        expect(school.ok(), await school.text()).toBe(true);
        const context = await createAuthenticatedE2EContext(browser, baseURL, { username, password: E2E_PRACTICE_PASSWORD });
        try {
            const upload = async (name: string) => {
                const response = await context.request.post("/api/reference-assets", {
                    multipart: { type: "image", persistent: "true", file: { name, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") } },
                });
                expect(response.ok(), await response.text()).toBe(true);
                return ((await response.json()) as { url: string }).url;
            };
            const sourceUrl = await upload("source.png");
            const maskUrl = await upload("mask.png");
            const expression = { face: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, expressionId: "smile", intensity: "strong", excitement: 0.8, affinity: 0.2 };
            for (const toolId of ["reverse-prompt", "expression-reference", "local-edit"] as const) {
                const response = await context.request.post("/api/practice/image-tools", {
                    data: { toolId, sourceUrl, ...(toolId === "local-edit" ? { maskUrl } : {}), ...(toolId === "expression-reference" ? { expression } : {}), clientRequestId: randomUUID(), prompt: "fixture only" },
                });
                expect(response.ok(), await response.text()).toBe(true);
                const { task } = (await response.json()) as { task: { id: string; type: string } };
                expect(task.type).toBe(toolId === "reverse-prompt" ? "text" : "image");
                const result = await pollTask(context.request, `/api/${task.type}-tasks/${task.id}`);
                expect(result.status, JSON.stringify(result)).toBe("success");
            }
            const fixture = await protocolFixtureState(admin);
            const requests = fixture.requests.filter((item: { authorization: string }) => item.authorization === "Bearer e2e-standalone-tools-fixture");
            expect(requests.some((item: { path: string }) => item.path.endsWith("/chat/completions"))).toBe(true);
            expect(requests.filter((item: { path: string; contentType: string }) => item.path.endsWith("/images/edits") && item.contentType.startsWith("multipart/form-data"))).toHaveLength(2);
        } finally {
            await context.close();
        }
    } finally {
        const latest = (await (await admin.get("/api/admin/settings")).json()) as { settingsRevision: number };
        const restored = await admin.patch("/api/admin/settings", {
            data: { settingsRevision: latest.settingsRevision, systemChannels: before.settings.systemChannels, logicalModels: before.settings.logicalModels, practiceDefaultModels: before.settings.practiceDefaultModels },
        });
        expect(restored.ok(), await restored.text()).toBe(true);
    }
});
