import { expect, test } from "@playwright/test";

test.describe("BlueGamma brand UI preview", () => {
    test("switches between the branded skins and foundation preview without horizontal overflow", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto("/gamma-preview", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: /Gamma 轨道/ })).toBeVisible();
        await expect(page.locator('img[src="/brand/bluegamma-mark.png"]').first()).toBeVisible();
        await expect(page.getByRole("button", { name: /轨道毛玻璃/ })).toHaveAttribute("class", /is-selected/);

        await page.getByRole("button", { name: /明亮创作室/ }).click();
        await expect(page.locator(".gamma-preview")).toHaveClass(/gamma-preview-studio/);
        await page.getByRole("button", { name: "视觉基因" }).click();
        await expect(page.getByRole("heading", { name: "明亮创作室" })).toBeVisible();

        const desktopWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
        expect(desktopWidth.content).toBeLessThanOrEqual(desktopWidth.viewport);

        await page.setViewportSize({ width: 390, height: 844 });
        const mobileWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
        expect(mobileWidth.content).toBeLessThanOrEqual(mobileWidth.viewport);
        await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
    });
});
