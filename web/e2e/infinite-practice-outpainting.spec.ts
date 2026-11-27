import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { outpaintingLesson, type OutpaintingRecord } from "../src/lib/practice-outpainting";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, e2eProjectContextOptions } from "./support";

const sourceUrl = "/api/reference-assets/permanent/outpainting-fixture.png";
const resultUrl = "/api/generation-log-assets/permanent/outpainting-fixture.png";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ecAAAAASUVORK5CYII=", "base64");

test("AI 扩图：恢复历史与教学提示词不重复提交，修改后可显式生成", async ({ page, browser, baseURL }, testInfo) => {
    const username = `outpainting_${randomUUID().slice(0, 8)}`;
    const school = await page.request.post("/api/admin/schools", { data: { name: username, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } } });
    expect(school.ok(), await school.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    try {
        const practice = await context.newPage();
        const selection = { ratio: "16:9", resolution: "2k", padding: { left: 224, right: 224, top: 0, bottom: 0 } } as const;
        const history: OutpaintingRecord = {
            id: "historical-outpainting",
            createdAt: Date.now(),
            sourceUrl,
            width: 576,
            height: 576,
            selection,
            prompt: outpaintingLesson(selection, 576, 576).prompt.replace("自然延伸邻近背景", "沿用历史灯光并自然延伸邻近背景"),
            image: { url: resultUrl, width: 2048, height: 1152, mimeType: "image/png", bytes: pixel.length },
        };
        let submitted = 0;
        await practice.route("**/api/reference-assets/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
        await practice.route("**/api/generation-log-assets/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
        await practice.route("**/api/practice/image-tools**", (route) => {
            if (route.request().method() === "GET") {
                expect(new URL(route.request().url()).searchParams.get("history")).toBe("ai-outpainting");
                return route.fulfill({ json: { records: [history] } });
            }
            submitted++;
            expect(route.request().postDataJSON()).toMatchObject({ toolId: "ai-outpainting", sourceUrl, outpainting: { ...selection, resolution: "4k" } });
            return route.fulfill({ json: { task: { id: "new-outpainting", type: "image", model: "fixture" } } });
        });
        await practice.route("**/api/image-tasks/new-outpainting", (route) => route.fulfill({ json: { task: { status: "success", result: { serverUrl: resultUrl, width: 4096, height: 2304 } } } }));
        await practice.goto("/practice/ai-outpainting");
        const records = practice.getByRole("region", { name: "历史记录" });
        const lesson = practice.getByRole("region", { name: "结构化提示词" });
        await records.getByRole("button", { name: /16:9 · 2K/ }).click();
        await expect(practice.getByLabel("扩图比例")).toHaveValue("16:9");
        await expect(practice.getByLabel("输出分辨率")).toHaveValue("2k");
        await expect(practice.getByRole("img", { name: "AI 扩图结果" })).toBeVisible();
        await expect(lesson.getByText(/沿用历史灯光/)).toBeVisible();
        await expect(lesson.getByRole("heading", { level: 4 })).toHaveCount(4);
        expect(submitted).toBe(0);
        const [input, middle, right] = await Promise.all([practice.getByRole("region", { name: "输入与设置" }).boundingBox(), lesson.boundingBox(), records.boundingBox()]);
        if (testInfo.project.name.startsWith("mobile")) expect(right!.y).toBeGreaterThan(middle!.y);
        else {
            expect(input!.x).toBeLessThan(middle!.x);
            expect(middle!.x).toBeLessThan(right!.x);
        }
        await expect(practice.getByLabel("扩图比例").locator("option")).toHaveText(["原图比例", "1:1", "4:3", "3:4", "16:9", "9:16"]);
        await expect(practice.getByLabel("输出分辨率").locator("option")).toHaveText(["1K · 1024px", "2K · 2048px", "4K · 4096px"]);
        await practice.getByLabel("输出分辨率").selectOption("4k");
        await expect(lesson.getByText(/4096 × 2304/)).toBeVisible();
        await practice.getByRole("button", { name: "开始 AI 扩图" }).click();
        const newRecord = records.getByRole("button", { name: /16:9 · 4K/ });
        await expect(newRecord).toBeVisible();
        await records.getByRole("button", { name: /16:9 · 2K/ }).click();
        await newRecord.click();
        await expect(practice.getByLabel("输出分辨率")).toHaveValue("4k");
        await expect(lesson.getByText("本次生成使用的提示词")).toBeVisible();
        expect(submitted).toBe(1);
        expect(await practice.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await practice.evaluate(() => innerWidth));
    } finally {
        await context.close();
    }
});
