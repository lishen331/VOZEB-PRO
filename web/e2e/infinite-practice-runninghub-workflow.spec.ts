import { expect, test } from "@playwright/test";

test("RunningHub 工作流接口不向匿名用户开放且生产配置保持独立", async ({ browser, page }) => {
    const anonymous = await browser.newContext({ baseURL: `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`, storageState: { cookies: [], origins: [] } });
    try {
        const denied = await anonymous.request.get("/api/admin/runninghub/workflows");
        expect(denied.status()).toBe(401);
    } finally {
        await anonymous.close();
    }
    const settings = await page.request.get("/api/admin/settings");
    expect(settings.ok(), await settings.text()).toBe(true);
    const payload = (await settings.json()).settings;
    expect(payload.defaultModels).toBeTruthy();
    expect(payload.practiceWorkflowModels).toBeTruthy();
    expect(payload.defaultModels).not.toBe(payload.practiceWorkflowModels);
});
