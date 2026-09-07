import { expect, test } from "@playwright/test";

test.describe("admin official work publishing", () => {
    test("renders the official publishing workflow and responsive drawer", async ({ page }) => {
        await page.goto("/admin?section=works", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "作品管理" })).toBeVisible();
        await expect(page.getByRole("button", { name: "发布官方作品" })).toBeVisible();
        await page.getByRole("button", { name: "发布官方作品" }).click();
        const drawer = page.locator(".ant-drawer");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByPlaceholder("作品标题")).toBeVisible();
        await expect(drawer.getByPlaceholder("公开提示词（选填）")).toBeVisible();
        await expect(drawer.getByRole("button", { name: "保存草稿" })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "发布", exact: true })).toBeVisible();
        const box = await drawer.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test("rejects official publishing APIs without content management permission", async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
        const response = await context.request.post("/api/admin/works", { data: { title: "未授权作品" } });
        expect(response.status()).toBe(401);
        await context.close();
    });
});
