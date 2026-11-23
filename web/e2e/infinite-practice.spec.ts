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

test("练习首页的六个新增入口可由学校账号打开", async ({ browser, page }, testInfo) => {
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
    } finally {
        await context.close();
    }
});
