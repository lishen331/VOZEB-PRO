import { expect, test } from "@playwright/test";
import { pollTask } from "./support";

for (const theme of ["light", "dark"] as const) {
    test(`Canvas native image delivery persists real media in ${theme} theme`, async ({ page, request }) => {
        await page.addInitScript((value) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: value, canvasThemeOverride: value }, version: 0 })), theme);
        let submissions = 0;
        page.on("request", (r) => {
            if (r.method() === "POST" && new URL(r.url()).pathname === "/api/image-tasks") submissions++;
        });
        await page.goto("/canvas");
        await page.getByRole("button", { name: "新建画布", exact: true }).click();
        await page.waitForURL(/\/canvas\/canvas-/);
        const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
        try {
            await expect(page.locator("[data-canvas-surface]")).toBeVisible();
            if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
            else await expect(page.locator("html")).not.toHaveClass(/dark/);
            await page.getByRole("button", { name: "图片", exact: true }).click();
            const image = page.locator('[data-node-id^="image-"]').last();
            const nodeId = await image.getAttribute("data-node-id");
            expect(nodeId).toBeTruthy();
            const prompt = page.getByRole("textbox", { name: "节点提示词" });
            await prompt.fill("原创蓝色陶瓷小鸟，纯色背景，无文字。Canvas媒体交付本地回归。");
            await prompt.blur();
            const generate = page.getByRole("button", { name: "生成", exact: true });
            await expect(generate).toBeEnabled();
            const submitted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/image-tasks");
            await generate.focus();
            await page.keyboard.press("Enter");
            const response = await submitted;
            expect(response.ok(), await response.text()).toBe(true);
            const body = await response.json();
            expect(body.task.id).toBeTruthy();
            const task = await pollTask(request, `/api/image-tasks/${body.task.id}`);
            expect(task.status, JSON.stringify(task)).toBe("success");
            const actual = page.locator(`[data-node-id="${nodeId}"]`);
            const readable = () => actual.locator("img").evaluateAll((images) => images.some((i) => i instanceof HTMLImageElement && /\/api\/(generation-log-assets|reference-assets)\//.test(i.currentSrc || i.src) && i.naturalWidth > 0));
            await expect.poll(readable).toBe(true);
            await page.reload();
            await expect(actual).toBeVisible();
            await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
            await expect.poll(readable).toBe(true);
            expect(submissions).toBe(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        } finally {
            await request.delete("/api/canvas/projects", { data: { ids: [projectId] } });
        }
    });
}
