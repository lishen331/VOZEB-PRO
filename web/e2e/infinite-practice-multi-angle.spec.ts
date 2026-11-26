import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import type { PracticeSession } from "../src/services/api/practice";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, e2eProjectContextOptions } from "./support";

const sourceKey = "permanent/practice-multi-angle-fixture.png";
const media = `/api/reference-assets/${sourceKey}`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9Z0AAAAASUVORK5CYII=", "base64");

test("keeps the workbench mounted while selecting and restoring subjects", async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const username = `angle_${randomUUID().slice(0, 8)}`;
    const school = await page.request.post("/api/admin/schools", {
        data: { name: `多角度历史验收 ${username}`, administrator: { username, displayName: username, password: E2E_PRACTICE_PASSWORD } },
    });
    expect(school.ok(), await school.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL!, { username, password: E2E_PRACTICE_PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    try {
        const practice = await context.newPage();
        const mobile = testInfo.project.name.startsWith("mobile");
        if (!mobile) await practice.setViewportSize({ width: 1280, height: 720 });
        const openHistory = async () => {
            if (mobile) await practice.getByRole("button", { name: "打开历史记录" }).click();
        };
        const closeHistory = async () => {
            if (mobile) await practice.getByRole("button", { name: "关闭历史记录" }).click();
        };
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
        await openHistory();
        await expect(practice.getByRole("region", { name: "历史记录" }).getByText("暂无生成记录")).toBeVisible();
        await closeHistory();
        const controls = practice.getByRole("region", { name: "操作台" });
        const finder = controls.getByLabel("当前机位的实时取景示意");
        const results = practice.getByRole("region", { name: "生成结果" });
        const history = practice.getByRole("region", { name: "历史记录" });
        const upload = controls.getByRole("button", { name: "选择图片", exact: true });
        const generate = controls.getByRole("button", { name: "生成多角度画面" });
        await expect(upload).toBeVisible();
        await expect(generate).toBeDisabled();
        await expect(results.getByText("生成的图片将在这里显示")).toBeVisible();
        await expect(finder).toHaveCount(0);
        const emptyStage = await controls.locator('[class*="_viewport__"]').boundingBox();
        await controls.getByRole("button", { name: "用示例图试试" }).click();
        await expect(upload).toHaveCount(0);
        const filledStage = await controls.locator('[class*="_viewport__"]').boundingBox();
        expect(Math.abs(filledStage!.height - emptyStage!.height)).toBeLessThan(1);
        expect(submissions).toBe(0);
        await expect(finder).toBeVisible();
        await expect(practice.getByRole("heading", { name: "预览台", exact: true })).toHaveCount(0);
        await expect(results.getByText("生成的图片将在这里显示")).toBeVisible();
        const [left, right, finderBox] = await Promise.all([controls.boundingBox(), results.boundingBox(), finder.boundingBox()]);
        expect(finderBox!.x).toBeGreaterThan(left!.x + left!.width / 2);
        expect(finderBox!.y).toBeLessThan(left!.y + left!.height / 2);
        if (mobile) {
            expect(left!.y).toBeLessThan(right!.y);
        } else {
            expect(left!.x).toBeLessThan(right!.x);
            expect(left!.y).toBe(right!.y);
            const assertDesktopFit = async (width: number, height: number) => {
                await practice.setViewportSize({ width, height });
                await expect
                    .poll(async () => {
                        const [a, b, h, send] = await Promise.all([controls.boundingBox(), results.boundingBox(), history.boundingBox(), controls.getByRole("button", { name: "生成多角度画面" }).boundingBox()]);
                        return Boolean(a && b && h && send && Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1 && a.y === b.y && h.x >= b.x + b.width && a.y + a.height <= height && send.y + send.height <= height);
                    })
                    .toBe(true);
            };
            await assertDesktopFit(1280, 720);
            await assertDesktopFit(1440, 900);
            await practice.setViewportSize({ width: 1280, height: 720 });
        }
        await controls.getByRole("button", { name: "正面视角", exact: true }).click();
        await controls.getByRole("slider", { name: "景别缩放" }).focus();
        await practice.keyboard.press("Home");
        const stage = controls.locator('[class*="_viewport__"]');
        const subject = stage.locator('[class*="_subjectPlane__"]');
        await expect
            .poll(async () => {
                const [frame, plane] = await Promise.all([stage.boundingBox(), subject.boundingBox()]);
                if (!frame || !plane) return false;
                const dx = plane.x + plane.width / 2 - (frame.x + frame.width / 2);
                const dy = plane.y + plane.height / 2 - (frame.y + frame.height / 2);
                return Math.abs(dx) <= 2 && Math.abs(dy) <= 2;
            })
            .toBe(true);
        await controls.getByRole("button", { name: "重置参数" }).click();
        await controls.getByRole("tab", { name: "主体", exact: true }).click();
        await controls.getByRole("button", { name: "左侧 45°" }).click();
        await controls.getByRole("switch", { name: "提示词开关" }).click();
        await controls.getByRole("textbox", { name: "提示词" }).fill("  恢复原始提示词  ");
        await controls.getByRole("button", { name: /4 张/ }).click();
        await controls.getByRole("button", { name: "生成多角度画面" }).click();
        await openHistory();
        await expect(history.getByRole("button", { name: /4 张.*3\/4 张已生成/ })).toBeVisible();
        await closeHistory();
        const card = results.getByRole("group", { name: "结果卡片" });
        const prompt = results.getByRole("region", { name: "提示词", exact: true });
        await expect(card.getByRole("img")).toHaveAttribute("alt", "正面");
        const [cardBox, prevBox, nextBox, promptBox] = await Promise.all([card.boundingBox(), card.getByRole("button", { name: "上一张" }).boundingBox(), card.getByRole("button", { name: "下一张" }).boundingBox(), prompt.boundingBox()]);
        expect(prevBox!.x).toBeGreaterThan(cardBox!.x);
        expect(nextBox!.x + nextBox!.width).toBeLessThan(cardBox!.x + cardBox!.width);
        expect(promptBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height);
        await expect(results.getByRole("button", { name: "抽一张" })).toHaveCount(0);
        await card.getByRole("button", { name: "下一张" }).click();
        await expect(card.getByText("生成失败", { exact: true })).toBeVisible();
        await expect(prompt.getByText("向右旋转 90°", { exact: true })).toBeVisible();
        await prompt.getByText("查看完整提示词", { exact: true }).click();
        await expect(prompt.locator("details p")).toHaveText(sessions[1].input.prompt as string);
        await card.getByRole("button", { name: "下一张" }).click();
        await expect(card.getByRole("img")).toHaveAttribute("alt", "背面");
        await expect(prompt.getByText("背面 180°", { exact: true })).toBeVisible();
        await controls.getByRole("button", { name: "正面视角", exact: true }).click();
        await expect(prompt.getByText("背面 180°", { exact: true })).toBeVisible();
        const firstBatchId = (sessions[0].input.multiAngle as { batchId: string }).batchId;
        expect(submissions).toBe(4);

        await practice.reload();
        await expect(practice.getByRole("button", { name: "选择图片", exact: true })).toBeVisible();
        await openHistory();
        await history.getByRole("button", { name: /4 张.*3\/4 张已生成/ }).click();
        if (mobile) await expect(practice.getByRole("dialog")).toHaveCount(0);
        await expect(controls.getByRole("tab", { name: "主体", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(controls.getByRole("textbox", { name: "提示词" })).toHaveValue("  恢复原始提示词  ");
        await expect(controls.getByRole("button", { name: /4 张/ })).toHaveAttribute("aria-pressed", "true");
        await expect(results.getByText(/历史结果/)).toBeVisible();
        await expect(card.getByRole("img")).toHaveAttribute("alt", "正面");
        await card.getByRole("button", { name: "上一张" }).click();
        await expect(card.getByRole("img")).toHaveAttribute("alt", "左环 90°");
        await expect(prompt.getByText("向左旋转 90°", { exact: true })).toBeVisible();
        await openHistory();
        await history.getByRole("button", { name: /4 张.*3\/4 张已生成/ }).click();
        if (mobile) await expect(practice.getByRole("dialog")).toHaveCount(0);
        await expect(card.getByRole("img")).toHaveAttribute("alt", "正面");
        expect(submissions).toBe(4);
        const overflow = await practice.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        await controls.getByRole("button", { name: /1 张/ }).click();
        await controls.getByRole("button", { name: "生成多角度画面" }).click();
        await openHistory();
        await expect(history.getByRole("button", { name: /1 张.*1\/1 张已生成/ })).toBeVisible();
        await closeHistory();
        await expect(card.getByRole("button", { name: "上一张" })).toHaveCount(0);
        await expect(card.getByRole("button", { name: "下一张" })).toHaveCount(0);
        expect((sessions.at(-1)?.input.multiAngle as { batchId: string }).batchId).not.toBe(firstBatchId);
        await practice.getByRole("button", { name: "重新选择图片" }).click();
        await expect(upload).toBeVisible();
        await expect(generate).toBeDisabled();
        await expect(results.getByText("生成的图片将在这里显示")).toBeVisible();
        await practice.locator('input[type="file"]').setInputFiles({ name: "subject.png", mimeType: "image/png", buffer: pixel });
        await expect(finder).toBeVisible();
        await expect(generate).toBeEnabled();
        for (const type of ["drop", "paste"]) {
            await practice.getByRole("button", { name: "重新选择图片" }).click();
            await expect(upload).toBeVisible();
            await upload.evaluate(
                (target, { type, bytes }) => {
                    const data = new DataTransfer();
                    data.items.add(new File([new Uint8Array(bytes)], "subject.png", { type: "image/png" }));
                    const event = type === "drop" ? new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }) : new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data });
                    target.dispatchEvent(event);
                },
                { type, bytes: Array.from(pixel) },
            );
            await expect(finder).toBeVisible();
            await expect(generate).toBeEnabled();
        }
        expect(submissions).toBe(5);
        await openHistory();
        await expect(history.getByRole("button", { name: /4 张.*3\/4 张已生成/ })).toBeVisible();
        await closeHistory();
        if (!mobile) {
            const initial = sessions[0];
            for (let i = 0; i < 12; i += 1) {
                sessions.push({ ...initial, id: `fixture-${i}`, input: { ...initial.input, multiAngle: { ...(initial.input.multiAngle as Record<string, unknown>), batchId: randomUUID(), batch: 1 } } });
            }
            await history.getByRole("button", { name: "刷新历史" }).click();
            await expect(history.getByRole("button", { name: /恢复机位与参数/ })).toHaveCount(14);
            const historyScroller = history
                .getByRole("button", { name: /恢复机位与参数/ })
                .first()
                .locator("../..");
            const scroll = await historyScroller.evaluate((element) => {
                const before = element.getBoundingClientRect().top;
                element.scrollTop = element.scrollHeight;
                return { top: element.scrollTop, overflow: getComputedStyle(element).overflowY, stayed: before === element.getBoundingClientRect().top };
            });
            expect(scroll).toMatchObject({ overflow: "auto", stayed: true });
            expect(scroll.top).toBeGreaterThan(0);
        }
    } finally {
        await context.close();
    }
});
