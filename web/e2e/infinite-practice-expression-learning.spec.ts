import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { ExpressionPracticeRecord } from "../src/lib/practice-expression-learning";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, e2eProjectContextOptions } from "./support";

const sourceUrl = "/api/reference-assets/permanent/expression-fixture.png";
const imageUrl = "/api/generation-log-assets/permanent/expression-fixture.png";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9Z0AAAAASUVORK5CYII=", "base64");
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
            { id: "previous", createdAt: Date.now() - 1000, sourceUrl, selection, prompt, status: "success", image: { url: imageUrl, storageKey: "", width: 1, height: 1, bytes: pixel.length, mimeType: "image/png" } },
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
        await practice.goto("/practice/expression-reference");
        const mobile = testInfo.project.name.startsWith("mobile");
        const history = mobile ? practice.getByRole("dialog", { name: "练习历史" }) : practice.getByRole("complementary", { name: "练习历史" });
        const openHistory = async () => {
            if (mobile) await practice.getByRole("button", { name: "历史记录" }).click();
        };
        await openHistory();
        await history.getByRole("button", { name: /微笑 · 已完成/ }).click();
        const lesson = practice.getByRole("region", { name: "本次提示词拆解" });
        await expect(practice.getByRole("img", { name: "表情参考结果" })).toBeVisible();
        await expect(practice.getByLabel("当前表情设置")).toContainText("微笑 · 强烈");
        await lesson.getByText("查看完整提示词").click();
        await expect(lesson.getByText(prompt, { exact: true })).toBeVisible();
        expect(submissions).toHaveLength(0);
        if (!mobile) {
            const [left, middle, right] = await Promise.all([practice.getByRole("heading", { name: "输入与设置" }).boundingBox(), lesson.boundingBox(), history.boundingBox()]);
            expect(left!.x).toBeLessThan(middle!.x);
            expect(middle!.x).toBeLessThan(right!.x);
        }
        await practice.getByRole("button", { name: "编辑人物与表情" }).click();
        await expect(practice.getByText("已恢复历史人物框选")).toBeVisible();
        await expect(practice.getByRole("slider", { name: "表情强度" })).toHaveAttribute("aria-valuetext", "强烈");
        await practice.getByRole("button", { name: "惊讶", exact: true }).click();
        await practice.getByRole("button", { name: "确认设置" }).click();
        await expect(lesson.getByText(/左侧设置尚未生成/)).toBeVisible();
        await expect(lesson.getByText("强烈地呈现“微笑”表情（柔和微笑）")).toBeVisible();
        expect(submissions).toHaveLength(0);
        await practice.getByRole("button", { name: "生成表情参考" }).click();
        await expect(practice.getByRole("status").filter({ hasText: "未生成图片：练习模型池无可用模型" })).toBeVisible();
        await expect(lesson.getByText(/强烈地呈现“惊讶”/)).toBeVisible();
        expect(submissions).toHaveLength(1);
        expect(submissions[0].expression).toMatchObject({ face: selection.face, expressionId: "surprised", intensity: "strong" });
        expect(submissions[0].prompt).toContain("惊讶");
        await practice.reload();
        await openHistory();
        await history.getByRole("button", { name: /惊讶 · 未生成图片/ }).click();
        await expect(practice.getByLabel("当前表情设置")).toContainText("惊讶 · 强烈");
        await expect(lesson.getByText(/强烈地呈现“惊讶”/)).toBeVisible();
        expect(submissions).toHaveLength(1);
        expect(await practice.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await practice.evaluate(() => innerWidth));
    } finally {
        await context.close();
    }
});
