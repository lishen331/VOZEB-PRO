import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

const screenshots = path.resolve(process.env.USERPROFILE || "..", ".codex/visualizations/2026/10/14/vozeb-ui-showcase");

test.beforeEach(async ({ page }) => {
    // Root providers retain read-only session/catalog requests. Fixture all APIs;
    // any business write is a test failure rather than a real server operation.
    await page.route("**/api/**", async (route) => {
        expect(["GET", "HEAD"]).toContain(route.request().method());
        await route.fulfill({ status: 200, json: { user: null, announcements: [] } });
    });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/ui-showcase");
    await expect(page.getByRole("heading", { name: "把想法变成画面", level: 1 })).toBeVisible();
    await expect(page.locator(".vz-ds")).toHaveAttribute("data-vz-theme", "dark");
});

async function noHorizontalOverflow(page: Page) {
    const violations = await page.locator(".vz-ds").evaluate((root) => {
        const selectors = [".vz-content", ".vz-panel", ".vz-card", ".vz-state-group", ".vz-params", ".vz-prompt", ".vz-top", ".ant-modal", ".ant-drawer-body", ".ant-popover-inner"];
        return [root, ...Array.from(root.querySelectorAll<HTMLElement>(selectors.join(",")))].flatMap((element) => {
            const node = element as HTMLElement;
            if (!node.getClientRects().length) return [];
            return node.scrollWidth > node.clientWidth + 2 ? [{ class: node.className, scroll: node.scrollWidth, client: node.clientWidth }] : [];
        });
    });
    expect(violations).toEqual([]);
}

for (const [width, height] of [
    [1440, 1000],
    [1280, 900],
    [834, 1112],
    [430, 932],
    [390, 844],
]) {
    test(`layout, themes and portal bounds at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        const root = page.locator(".vz-ds");
        await expect(root).toHaveCSS("overflow-y", "auto");
        expect(await root.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
        for (const id of ["workflow", "foundation", "controls", "cards", "overlays", "responsive"]) {
            await page.locator(`#vz-sec-${id}`).scrollIntoViewIfNeeded();
            await noHorizontalOverflow(page);
            if (width === 1440 || width === 390) await page.screenshot({ path: path.join(screenshots, `${id}-${width}-dark.png`) });
        }
        await root.evaluate((node) => node.scrollTo(0, 0));
        await page.screenshot({ path: path.join(screenshots, `desktop-${width}-dark.png`) });
        const globalDark = await page.locator("html").getAttribute("class");
        await page.getByRole("button", { name: "切换到浅色" }).click();
        await expect(root).toHaveAttribute("data-vz-theme", "light");
        expect(await page.locator("html").getAttribute("class")).toBe(globalDark);
        await noHorizontalOverflow(page);
        await page.screenshot({ path: path.join(screenshots, `desktop-${width}-light.png`) });
        await page.locator("#vz-sec-workflow").getByRole("button", { name: "选择模型" }).click();
        const modelList = page.getByRole("listbox", { name: "选择模型" });
        await expect(modelList).toBeVisible();
        await expect.poll(() => modelList.evaluate((node) => getComputedStyle(node.closest(".ant-popover")!.querySelector(".ant-popover-container")!).backdropFilter)).toContain("blur(20px)");
        const popupBox = await modelList.evaluate((node) => {
            const popup = node.closest(".ant-popover");
            if (!popup) throw new Error("Model list must be inside a scoped popover");
            const rect = popup.getBoundingClientRect();
            return { x: rect.x, width: rect.width };
        });
        expect(popupBox.x).toBeGreaterThanOrEqual(-1);
        expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width + 1);
        await page.keyboard.press("Escape");
        await expect(modelList).not.toBeVisible();
        await page.locator("#vz-sec-overlays").getByRole("button", { name: "打开弹窗" }).click();
        const dialog = page.getByRole("dialog", { name: "分享弹窗 · 本地演示" });
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(await dialog.evaluate((node) => Boolean(node.closest(".vz-ds")))).toBe(true);
        await noHorizontalOverflow(page);
        await page.keyboard.press("Escape");
        if (width < 768) {
            await page.getByRole("button", { name: "打开导航" }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.getByRole("dialog").getByRole("button", { name: "控件与状态", exact: true }).click();
            await expect(page.getByRole("dialog")).not.toBeVisible();
        }
    });
}

test("model keyboard, parameters, local upload and generation lifecycle", async ({ page }) => {
    const workflow = page.locator("#vz-sec-workflow");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const picker = workflow.getByRole("button", { name: "选择模型" });
    await picker.focus();
    await picker.press("ArrowDown");
    const models = page.getByRole("listbox", { name: "选择模型" });
    await expect(models).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(picker).toContainText("GPT Image");
    await expect(picker).toBeFocused();
    await workflow.getByRole("radio", { name: "9:16", exact: true }).check();
    await expect(workflow.getByRole("radio", { name: "9:16", exact: true })).toBeChecked();
    await workflow.getByRole("button", { name: /移除 角色参考/ }).click();
    const file = path.resolve("public/style-thumbs/anime.jpg");
    await workflow.getByLabel("选择参考素材文件").setInputFiles(file);
    const reference = workflow.getByRole("button", { name: "预览 anime.jpg" });
    await expect(reference).toBeVisible();
    expect(await reference.locator("img").getAttribute("src")).toMatch(/^blob:/);
    await reference.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await workflow.getByRole("button", { name: "移除 anime.jpg" }).click();
    await workflow.getByLabel("选择参考素材文件").setInputFiles(file);
    await expect(reference).toBeVisible();
    const generate = workflow.getByRole("button", { name: "开始生成" });
    await generate.click();
    await expect(workflow.locator(".vz-gen")).toBeDisabled();
    await expect(workflow.getByRole("button", { name: "再次生成" })).toBeVisible();
    await workflow.getByRole("button", { name: "再次生成" }).click();
    await workflow.getByRole("button", { name: "取消", exact: true }).click();
    await expect(generate).toBeEnabled();
    await workflow.getByRole("checkbox", { name: "模拟下一次失败" }).check();
    await generate.click();
    await expect(workflow.getByRole("button", { name: "生成失败，重试" })).toBeVisible();
    await workflow.getByRole("button", { name: "重新生成", exact: true }).and(page.locator("button:enabled")).click();
    await expect(workflow.getByRole("button", { name: "再次生成" })).toBeVisible();
    await workflow.getByRole("button", { name: "历史记录" }).click();
    await expect(page.getByRole("dialog")).toContainText("本地演示历史");
    await page.keyboard.press("Escape");
    const download = page.waitForEvent("download");
    await workflow.getByRole("button", { name: "导出配置" }).click();
    expect((await download).suggestedFilename()).toBe("vozeb-ui-demo.json");
    expect(errors).toEqual([]);
});

test("the next-failure setting is consumed and the primary retry recovers", async ({ page }) => {
    const workflow = page.locator("#vz-sec-workflow");
    await workflow.getByRole("checkbox", { name: "模拟下一次失败" }).check();
    await workflow.getByRole("button", { name: "开始生成" }).click();
    const retry = workflow.getByRole("button", { name: "生成失败，重试" });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(workflow.getByRole("button", { name: "再次生成" })).toBeVisible();
});

test("gallery preview, selection, local download and actual audio", async ({ page }) => {
    const cards = page.locator("#vz-sec-cards");
    const card = cards.getByRole("button", { name: /^选择作品：/ }).first();
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    const favorite = card.getByRole("button", { name: "收藏", exact: true });
    await favorite.focus();
    await favorite.press("Enter");
    await expect(card.getByRole("button", { name: "取消收藏" })).toHaveAttribute("aria-pressed", "true");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "放大预览" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "下载", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.(jpg|webp)$/);
    const audio = cards.locator("audio");
    await expect(audio).toHaveCount(1);
    await cards.getByRole("button", { name: "播放", exact: true }).click();
    await expect.poll(() => audio.evaluate((node) => node.currentTime)).toBeGreaterThan(0);
    await cards.getByRole("button", { name: "暂停", exact: true }).click();
    expect(await audio.evaluate((node) => node.paused)).toBe(true);
    await page.screenshot({ path: path.join(screenshots, "media-gallery.png") });
});

test("popover, drawer, confirmation, feedback and reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const overlays = page.locator("#vz-sec-overlays");
    await overlays.scrollIntoViewIfNeeded();
    await overlays.getByRole("button", { name: "打开抽屉" }).click();
    const drawer = page.getByRole("dialog", { name: "高级参数 · 本地演示" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await overlays.getByRole("button", { name: "删除确认" }).click();
    const confirmation = page.getByRole("dialog").filter({ hasText: "演示删除确认？" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await overlays.getByRole("button", { name: "Popover", exact: true }).click();
    await page.getByRole("button", { name: "应用", exact: true }).click();
    await overlays.getByRole("button", { name: "成功", exact: true }).click();
    await expect(page.locator(".vz-ds .ant-message-notice").first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: path.join(screenshots, "overlays-feedback.png") });
});

test("mobile prompt tools and drop zone remain real, clickable local interactions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const workflow = page.locator("#vz-sec-workflow");
    await workflow.getByRole("button", { name: "提示词库", exact: true }).click();
    await page.getByRole("button", { name: /静谧建筑/ }).click();
    const prompt = workflow.getByRole("textbox", { name: "提示词", exact: true });
    await expect(prompt).toHaveValue(/海边的极简建筑/);
    await workflow.getByRole("button", { name: "翻译为英文", exact: true }).click();
    await expect(page.getByText("英文示例预览", { exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByRole("button", { name: "使用英文示例", exact: true }).click();
    await expect(prompt).toHaveValue(/Minimal coastal architecture/);
    await workflow.getByRole("button", { name: "AI 润色", exact: true }).click();
    await expect(prompt).toHaveValue(/8K 细节/);
    await workflow.getByRole("button", { name: "清空提示词", exact: true }).click();
    await expect(prompt).toHaveValue("");
    await expect(workflow.getByRole("button", { name: "开始生成" })).toBeDisabled();
    const jpg = readFileSync(path.resolve("public/style-thumbs/anime.jpg")).toString("base64");
    const data = await page.evaluateHandle((base64) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], "dropped-reference.jpg", { type: "image/jpeg" }));
        return transfer;
    }, jpg);
    await workflow.getByRole("button", { name: "上传参考素材" }).dispatchEvent("drop", { dataTransfer: data });
    await expect(workflow.getByRole("button", { name: "预览 dropped-reference.jpg" })).toBeVisible();
    await noHorizontalOverflow(page);
    await data.dispose();
});

test("light showcase toast stays readable inside a global dark business theme", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: "dark", canvasThemeOverride: null }, version: 0 })));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "切换到浅色" }).click();
    await expect(page.locator(".vz-ds")).toHaveAttribute("data-vz-theme", "light");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.locator("#vz-sec-overlays").getByRole("button", { name: "成功", exact: true }).click();
    const toast = page.locator(".vz-ds .ant-message-notice").last();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCSS("color", "rgb(20, 24, 36)");
    await expect(toast).toHaveCSS("backdrop-filter", /blur\(20px\)/);
});
