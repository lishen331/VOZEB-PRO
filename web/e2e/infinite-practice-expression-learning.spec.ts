import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { AuthSettings } from "../src/lib/auth/store-types";
import type { ExpressionPracticeRecord } from "../src/lib/practice-expression-learning";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, E2E_PROTOCOL_ORIGIN, e2eProjectContextOptions, pollTask, protocolFixtureState } from "./support";

const sourceUrl = "/api/reference-assets/permanent/expression-fixture.png";
const imageUrl = "/api/generation-log-assets/permanent/expression-fixture.png";
const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAQE39wlnOEH4cwmABbmvP+brFBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQwHjEy8AFsJsxHi18OaAAAAAASUVORK5CYII=",
    "base64",
);
const selection = { face: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, expressionId: "smile", intensity: "strong", excitement: 0.8, affinity: 0.2 } as const;
const prompt = "画面中位于约 20% 横向、30% 纵向的人物脸部，强烈地呈现“微笑”表情（柔和微笑），整体情绪更激动、更疏离，保留身份、发型、构图和光线。";

test("restores expression settings and teaching results without submitting or charging", async ({ page, browser, baseURL }, testInfo) => {
    const username = `expression_${randomUUID().slice(0, 8)}`;
    const school = await page.request.post("/api/admin/schools", { data: { name: username, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } } });
    expect(school.ok(), await school.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    try {
        const practice = await context.newPage();
        const records: ExpressionPracticeRecord[] = [
            { id: "previous", createdAt: Date.now() - 1000, sourceUrl, selection, prompt, status: "success", image: { url: imageUrl, storageKey: "", width: 64, height: 64, bytes: pixel.length, mimeType: "image/png" } },
        ];
        const submissions: Array<{ expression: ExpressionPracticeRecord["selection"]; prompt: string }> = [];
        await practice.route("**/api/reference-assets/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
        await practice.route("**/api/generation-log-assets/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
        await practice.route("**/api/practice/image-tools**", (route) => {
            if (route.request().method() === "GET") {
                expect(new URL(route.request().url()).searchParams.get("history")).toBe("expression-reference");
                return route.fulfill({ json: { records } });
            }
            const body = route.request().postDataJSON();
            submissions.push(body);
            const failed: ExpressionPracticeRecord = { id: "failed", createdAt: Date.now(), sourceUrl, selection: body.expression, prompt: body.prompt, status: "error", error: "练习模型池无可用模型" };
            records.unshift(failed);
            return route.fulfill({ status: 503, json: { error: failed.error, record: failed } });
        });
        const mobile = testInfo.project.name.startsWith("mobile");
        if (!mobile) {
            await practice.setViewportSize({ width: 1440, height: 900 });
            for (let index = 1; index < 20; index++) {
                records.push({ ...records[0], id: `extra-${index}`, createdAt: records[0].createdAt - index * 1000, status: "error", image: undefined });
            }
        }
        await practice.goto("/practice/expression-reference");
        const history = mobile ? practice.getByRole("dialog", { name: "练习历史" }) : practice.getByRole("complementary", { name: "练习历史" });
        const openHistory = async () => {
            if (mobile) await practice.getByRole("button", { name: "历史记录" }).click();
        };
        const inputPanel = practice.getByRole("heading", { name: "输入与设置" }).locator("../..");
        const resultPanel = practice.getByRole("heading", { name: "生成结果与诊断" }).locator("../..");
        const expectDesktopLayout = async () => {
            const [left, middle, right] = await Promise.all([inputPanel.boundingBox(), resultPanel.boundingBox(), history.boundingBox()]);
            expect(left!.x + left!.width).toBeLessThan(middle!.x);
            expect(middle!.x + middle!.width).toBeLessThan(right!.x);
            expect(Math.abs(left!.width - middle!.width)).toBeLessThan(2);
            expect(Math.abs(left!.width - 2 * right!.width)).toBeLessThan(2);
            for (const panel of [middle!, right!]) {
                expect(Math.abs(left!.y - panel.y)).toBeLessThan(2);
                expect(Math.abs(left!.height - panel.height)).toBeLessThan(2);
            }
            const bottomGap = practice.viewportSize()!.height - (left!.y + left!.height);
            expect(bottomGap).toBeGreaterThanOrEqual(0);
            expect(bottomGap).toBeLessThan(48);
        };
        await openHistory();
        if (!mobile) {
            await expectDesktopLayout();
            const heading = history.getByRole("heading", { name: "练习历史" });
            const headerBefore = await heading.boundingBox();
            await history
                .getByRole("button", { name: /微笑 · 未生成图片/ })
                .last()
                .scrollIntoViewIfNeeded();
            await expect(heading).toBeInViewport();
            expect((await heading.boundingBox())!.y).toBe(headerBefore!.y);
            await expectDesktopLayout();
        }
        await history.getByRole("button", { name: /微笑 · 已完成/ }).click();
        const lesson = practice.getByRole("region", { name: "本次提示词拆解" });
        await expect(practice.getByRole("img", { name: "表情参考结果" })).toBeVisible();
        await expect(practice.getByLabel("当前表情设置")).toContainText("微笑 · 强烈");
        await lesson.getByText("查看完整提示词").click();
        await expect(lesson.getByText(prompt, { exact: true })).toBeVisible();
        expect(submissions).toHaveLength(0);
        if (!mobile) {
            const image = practice.getByRole("img", { name: "表情参考结果" });
            await expect(image).toHaveCSS("object-fit", "contain");
            await practice.setViewportSize({ width: 1440, height: 720 });
            await expectDesktopLayout();
            await expect(resultPanel).toHaveCSS("overflow-y", "auto");
            await lesson.getByRole("button", { name: "复制提示词" }).scrollIntoViewIfNeeded();
            await expectDesktopLayout();
        }
        await practice.getByRole("button", { name: "编辑人物与表情" }).click();
        await expect(practice.getByText("已恢复历史人物框选")).toBeVisible();
        await expect(practice.getByRole("slider", { name: "表情强度" })).toHaveAttribute("aria-valuetext", "强烈");
        await practice.getByRole("button", { name: "惊讶", exact: true }).click();
        await practice.getByRole("button", { name: "确认设置" }).click();
        await expect(lesson.getByText(/左侧设置尚未生成/)).toBeVisible();
        await expect(lesson.getByText("强烈地呈现“微笑”表情（柔和微笑）", { exact: true })).toBeVisible();
        expect(submissions).toHaveLength(0);
        await practice.getByRole("button", { name: "生成表情参考" }).click();
        await expect(practice.getByRole("status").filter({ hasText: "未生成图片：练习模型池无可用模型" })).toBeVisible();
        await expect(lesson.locator("dd").filter({ hasText: /强烈地呈现“惊讶”/ })).toBeVisible();
        expect(submissions).toHaveLength(1);
        expect(submissions[0].expression).toMatchObject({ face: selection.face, expressionId: "surprised", intensity: "strong" });
        expect(submissions[0].prompt).toContain("惊讶");
        await practice.reload();
        await openHistory();
        await history.getByRole("button", { name: /惊讶 · 未生成图片/ }).click();
        await expect(practice.getByLabel("当前表情设置")).toContainText("惊讶 · 强烈");
        await expect(lesson.locator("dd").filter({ hasText: /强烈地呈现“惊讶”/ })).toBeVisible();
        expect(submissions).toHaveLength(1);
        expect(await practice.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await practice.evaluate(() => innerWidth));
    } finally {
        await context.close();
    }
});

test("表情参考通过服务端组装提示词并提交练习专用模型", async ({ browser, page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "同一后端链路已在桌面覆盖；移动端 UI 另行验证");
    const admin = page.request;
    const beforeResponse = await admin.get("/api/admin/settings");
    expect(beforeResponse.ok()).toBe(true);
    const before = (await beforeResponse.json()) as { settings: AuthSettings; settingsRevision: number };
    const source = before.settings.systemChannels.find((channel) => channel.id === "e2e-primary");
    expect(source?.baseUrl).toBe(`${E2E_PROTOCOL_ORIGIN}/v1`);
    const id = "e2e-standalone-tools";
    const edit = "e2e-standalone-edit";
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
        models: [imageUpstream],
        advancedConfig: { ...advanced, modelConfigs: { [imageUpstream]: advanced.modelConfigs!["e2e-image"] } },
    };
    const settingsPatch = await admin.patch("/api/admin/settings", {
        data: {
            settingsRevision: before.settingsRevision,
            systemChannels: [...before.settings.systemChannels, channel],
            logicalModels: [...before.settings.logicalModels, { id: edit, name: edit, capability: "image", enabled: true, bindings: [{ id: `${id}-image`, channelId: id, upstreamModel: imageUpstream, enabled: true, priority: 1 }] }],
            practiceDefaultModels: { ...before.settings.practiceDefaultModels, imageModel: edit },
        },
    });
    expect(settingsPatch.ok(), await settingsPatch.text()).toBe(true);
    try {
        const username = `tool_fixture_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
        const school = await admin.post("/api/admin/schools", { data: { name: username, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } } });
        expect(school.ok(), await school.text()).toBe(true);
        const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD });
        try {
            const upload = async (name: string) => {
                const response = await context.request.post("/api/reference-assets", {
                    multipart: { type: "image", persistent: "true", file: { name, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") } },
                });
                expect(response.ok(), await response.text()).toBe(true);
                return ((await response.json()) as { url: string }).url;
            };
            const sourceUrl = await upload("source.png");
            const response = await context.request.post("/api/practice/image-tools", {
                data: { toolId: "expression-reference", sourceUrl, expression: selection, clientRequestId: randomUUID(), prompt: "fixture only" },
            });
            expect(response.ok(), await response.text()).toBe(true);
            const { task } = (await response.json()) as { task: { id: string; type: string } };
            expect(task.type).toBe("image");
            const result = await pollTask(context.request, `/api/${task.type}-tasks/${task.id}`);
            expect(result.status, JSON.stringify(result)).toBe("success");
            const fixture = await protocolFixtureState(admin);
            const requests = fixture.requests.filter((item: { authorization: string }) => item.authorization === "Bearer e2e-standalone-tools-fixture");
            expect(requests.filter((item: { path: string; contentType: string }) => item.path.endsWith("/images/edits") && item.contentType.startsWith("multipart/form-data"))).toHaveLength(1);
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

test("表情参考可以点击、拖入、粘贴和载入示例图且不触发生成", async ({ page, browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "桌面输入实测；移动端布局由同文件的独立用例覆盖");
    const username = `source_${randomUUID().slice(0, 8)}`;
    const school = await page.request.post("/api/admin/schools", { data: { name: username, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } } });
    expect(school.ok(), await school.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD });
    try {
        const practice = await context.newPage();
        let generations = 0;
        await practice.route("**/api/practice/image-tools**", (route) => {
            if (route.request().method() === "POST") generations++;
            return route.fulfill({ json: { records: [] } });
        });
        await practice.goto("/practice/expression-reference");
        const chooser = practice.waitForEvent("filechooser");
        await practice.getByRole("button", { name: "选择图片", exact: true }).click({ timeout: 5000 });
        const receive = () => practice.waitForResponse((r) => r.url().endsWith("/api/reference-assets") && r.request().method() === "POST");
        let uploaded = receive();
        await (await chooser).setFiles({ name: "clicked.png", mimeType: "image/png", buffer: pixel });
        const preview = practice.getByRole("img", { name: "练习源图", exact: true });
        const seen = async (response: typeof uploaded) => {
            const saved = await response;
            expect(saved.ok(), await saved.text()).toBe(true);
            await expect(preview).toHaveAttribute("src", (await saved.json()).url);
            await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        };
        await seen(uploaded);
        for (const type of ["drop", "paste"] as const) {
            uploaded = receive();
            await practice.evaluate(
                ({ type, bytes }) => {
                    const transfer = new DataTransfer();
                    transfer.items.add(new File([Uint8Array.from(bytes)], `${type}.png`, { type: "image/png" }));
                    if (type === "drop") document.querySelector("[data-expression-source-drop]")!.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
                    else document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
                },
                { type, bytes: [...pixel] },
            );
            await seen(uploaded);
        }
        uploaded = receive();
        await practice.getByRole("button", { name: "用示例图试试", exact: true }).click();
        await seen(uploaded);
        await expect(practice.getByRole("button", { name: "从个人素材库选择", exact: true })).toBeVisible();
        await expect(practice.getByRole("button", { name: "选择人物与表情", exact: true })).toBeEnabled();
        await expect(practice.getByRole("button", { name: "生成表情参考", exact: true })).toBeDisabled();
        expect(generations).toBe(0);
    } finally {
        await context.close();
    }
});
