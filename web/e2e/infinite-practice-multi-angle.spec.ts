import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import type { PracticeSession } from "../src/services/api/practice";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, e2eProjectContextOptions } from "./support";

const sourceKey = "permanent/practice-multi-angle-fixture.png";
const media = `/api/reference-assets/${sourceKey}`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9Z0AAAAASUVORK5CYII=", "base64");

test("restores an exact multi-angle batch from the initial upload screen without generating", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const username = `angle_${randomUUID().slice(0, 8)}`;
    const school = await page.request.post("/api/admin/schools", {
        data: { name: `多角度历史验收 ${username}`, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } },
    });
    expect(school.ok(), await school.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    try {
        const practice = await context.newPage();
        const sessions: PracticeSession[] = [];
        let submissions = 0;
        await practice.route("**/api/reference-assets/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
        await practice.route("**/api/reference-assets", (route) => route.fulfill({ json: { token: sourceKey, url: media, mimeType: "image/png" } }));
        await practice.route("**/api/practice/sessions**", (route) => {
            const json = (data: unknown) => route.fulfill({ json: { code: 0, data } });
            if (route.request().method() === "POST") {
                const request = route.request().postDataJSON();
                const shotIndex = request.input.multiAngle.shotIndex;
                submissions += 1;
                const time = new Date().toISOString();
                const session: PracticeSession = {
                    id: `shot-${submissions}`,
                    title: request.title,
                    module: "storyboard-image",
                    mode: "workflow",
                    createdAt: time,
                    updatedAt: time,
                    input: { ...request.input, references: request.references },
                    status: shotIndex === 1 ? "failed" : "success",
                    result: shotIndex === 1 ? { status: "error" } : { status: "success", media: { kind: "image", url: media } },
                };
                sessions.push(session);
                return json({ session });
            }
            const url = new URL(route.request().url());
            if (url.searchParams.get("history") === "multi-angle") {
                return json({ sessions, total: new Set(sessions.map((session) => (session.input.multiAngle as { batchId: string }).batchId)).size, page: 1, pageSize: 12 });
            }
            return json({ session: sessions.find((session) => url.pathname.endsWith(`/${session.id}`)) });
        });
        await practice.goto("/practice/multi-angle");
        await expect(practice.getByText("暂无生成记录")).toBeVisible();
        await practice.getByRole("button", { name: "用示例图试试" }).click();
        const controls = practice.getByRole("region", { name: "操作台" });
        const preview = practice.getByRole("region", { name: "预览台" });
        const results = practice.getByRole("region", { name: "生成结果" });
        const history = practice.getByRole("region", { name: "历史记录" });
        await expect(preview.getByLabel("当前机位的实时取景示意")).toBeVisible();
        await expect(results.getByText("生成的图片将在这里显示")).toBeVisible();
        const [left, center, right] = await Promise.all([controls.boundingBox(), preview.boundingBox(), results.boundingBox()]);
        if (testInfo.project.name.startsWith("mobile")) {
            expect(left!.y).toBeLessThan(center!.y);
            expect(center!.y).toBeLessThan(right!.y);
        } else {
            expect(left!.x).toBeLessThan(center!.x);
            expect(center!.x).toBeLessThan(right!.x);
            expect(left!.y).toBe(center!.y);
        }
        await controls.getByRole("tab", { name: "主体", exact: true }).click();
        await controls.getByRole("button", { name: "左侧 45°" }).click();
        await controls.getByRole("switch", { name: "提示词开关" }).click();
        await controls.getByRole("textbox", { name: "提示词" }).fill("  恢复原始提示词  ");
        await controls.getByRole("button", { name: /4 张/ }).click();
        await controls.getByRole("button", { name: "生成多角度画面" }).click();
        await expect(history.getByRole("button", { name: /4 张.*3\/4 张已生成/ })).toBeVisible();
        await expect(results.getByText("生成失败", { exact: true })).toBeVisible();
        const firstBatchId = (sessions[0].input.multiAngle as { batchId: string }).batchId;
        expect(submissions).toBe(4);

        await practice.reload();
        await expect(practice.getByRole("button", { name: "选择图片", exact: true })).toBeVisible();
        await history.getByRole("button", { name: /4 张.*3\/4 张已生成/ }).click();
        await expect(controls.getByRole("tab", { name: "主体", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(controls.getByRole("textbox", { name: "提示词" })).toHaveValue("  恢复原始提示词  ");
        await expect(controls.getByRole("button", { name: /4 张/ })).toHaveAttribute("aria-pressed", "true");
        await expect(results.getByText(/历史结果/)).toBeVisible();
        await expect(results.getByRole("img")).toHaveCount(3);
        expect(submissions).toBe(4);
        const overflow = await practice.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        await controls.getByRole("button", { name: /1 张/ }).click();
        await controls.getByRole("button", { name: "生成多角度画面" }).click();
        await expect(history.getByRole("button", { name: /1 张.*1\/1 张已生成/ })).toBeVisible();
        expect((sessions.at(-1)?.input.multiAngle as { batchId: string }).batchId).not.toBe(firstBatchId);
        await practice.getByRole("button", { name: "重新选择图片" }).click();
        await expect(history.getByRole("button", { name: /4 张.*3\/4 张已生成/ })).toBeVisible();
    } finally {
        await context.close();
    }
});
