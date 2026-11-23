import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD } from "./support";

const baseURL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const tools = [
    ["director-desk", "选择一个导演台开始摆场景"],
    ["multi-angle", "多角度练习"],
    ["reverse-prompt", "反推提示词"],
    ["local-edit", "局部编辑"],
    ["expression-reference", "表情参考"],
    ["super-resolution", "超分放大"],
] as const;

test("学校账号可打开六个练习工具并完成本地超分", async ({ browser, page }, testInfo) => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const username = `newtools_${suffix}`;
    const response = await page.request.post("/api/admin/schools", {
        data: { name: `练习工具验收 ${suffix}`, profile: { purpose: "e2e-practice-tools" }, administrator: { username, displayName: `练习管理员 ${suffix}`, password: E2E_PRACTICE_PASSWORD } },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const context = await createAuthenticatedE2EContext(browser, baseURL, { username, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
    try {
        const toolPage = await context.newPage();
        for (const [slug, heading] of tools) {
            await toolPage.goto("/practice");
            await toolPage.locator(`[data-practice-tool="${slug}"]`).click();
            await expect(toolPage).toHaveURL(`/practice/${slug}`);
            await expect(toolPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
            if (slug === "director-desk") await expect(toolPage.getByRole("button", { name: "新建导演台", exact: true })).toBeEnabled();
        }
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
