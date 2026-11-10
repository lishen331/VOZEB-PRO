import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";

import { ADMIN_SECTION_KEYS } from "../src/components/admin/admin-sections";
import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { E2E_ADMIN, E2E_PRACTICE_PASSWORD, createAuthenticatedE2EContext } from "./support";

const PROFILE_SECTIONS = ["overview", "profile", "billing", "coupons", "orders", "points", "consume", "referrals", "security"] as const;
const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const USES_POSTGRES = Boolean(process.env.VOZEB_PRO_E2E_DATABASE_URL?.trim());
const FILE_PROVIDER_LIMITATIONS = new Map([
    ["/api/public/gallery", 409],
    ["/api/works", 409],
    ["/api/admin/works", 409],
    ["/api/community/activity", 409],
    ["/api/notifications/interactions", 409],
    ["/api/admin/billing/coupon-templates", 501],
    ["/api/admin/billing/orders", 501],
    ["/api/admin/billing/products", 501],
    ["/api/admin/billing/promotions", 501],
    ["/api/admin/billing/reconciliation", 501],
    ["/api/admin/billing/summary", 501],
    ["/api/billing/products", 501],
    ["/api/billing/coupons", 501],
    ["/api/billing/orders", 501],
    ["/api/referrals", 501],
    ["/api/admin/referrals", 501],
    ["/api/admin/referrals/relationships", 501],
    ["/api/admin/referrals/rewards", 501],
    ["/api/admin/drama-projects", 501],
    ["/api/admin/drama-lab/ai-configs", 501],
    ["/api/admin/drama-lab/prompt-templates", 501],
    ["/api/admin/drama-lab/business-scenarios", 501],
    ["/api/admin/drama-lab/generation-settings", 501],
    ["/api/admin/drama-lab/sd2-assets", 501],
]);

type RouteCase = { path: string; expectedPath?: RegExp; expectedStatus?: number; readyHeading?: string; readyText?: string; allowAnonymousCatalog401?: boolean };
type ApiFailure = { path: string; status: number; body: string };

// Version availability on a third-party repository is not part of local page rendering.
test.beforeEach(async ({ page }) => {
    await page.route("https://raw.githubusercontent.com/csyqlz/VOZEB-PRO/main/VERSION", (route) => route.fulfill({ contentType: "text/plain", body: "0.8.27" }));
});

test("all authenticated pages reach their real routes and stay usable", async ({ page, request }, testInfo) => {
    test.setTimeout(360_000);
    const fixtures = await createPageFixtures(request, testInfo.project.use.viewport?.width || 1280);
    const routes: RouteCase[] = [
        { path: "/", readyHeading: "画布创作案例" },
        { path: "/gallery", expectedPath: /\/community$/, readyHeading: "作品广场" },
        { path: "/community", readyHeading: "作品广场" },
        { path: "/ip-library", readyHeading: "IP 库" },
        { path: "/announcements", readyHeading: "网站公告" },
        { path: "/create" },
        { path: "/image", expectedPath: /\/create$/ },
        { path: "/video", expectedPath: /\/create$/ },
        { path: "/canvas", readyHeading: "我的画布" },
        { path: `/canvas/${fixtures.canvasId}` },
        { path: "/drama", readyHeading: "短剧项目" },
        { path: `/drama/${fixtures.dramaId}` },
        { path: "/practice", expectedStatus: 404, readyText: "404" },
        { path: "/works", readyHeading: "作品管理" },
        { path: "/assets", readyHeading: "我的素材" },
        { path: "/school/join", readyHeading: "加入学校" },
        { path: "/my-prompts", readyHeading: "我的提示词" },
        { path: "/prompts", readyHeading: "提示词库" },
        { path: "/help", readyHeading: "从操作到交付，按真实流程完成创作" },
        { path: "/me", readyHeading: "E2E 管理员" },
        USES_POSTGRES ? { path: `/u/${E2E_ADMIN.username}`, expectedStatus: 404, readyText: "404" } : { path: `/u/${E2E_ADMIN.username}`, readyHeading: "创作者主页暂不可用" },
        { path: "/billing", expectedPath: /\/profile$/ },
        { path: "/billing/checkout", expectedPath: /\/profile$/ },
        { path: "/billing/success", readyText: "支付结果缺少订单编号" },
        { path: "/billing/cancel", readyText: "支付结果缺少订单编号" },
        { path: "/admin/setup", readyHeading: "把站点配置到可以上线运营" },
        { path: "/admin/billing", readyHeading: "财务钱包" },
        { path: "/admin/generation-operations", expectedPath: /\/admin\?section=generationOperations$/ },
        ...PROFILE_SECTIONS.map((section) => ({ path: `/profile?section=${section}` })),
    ];
    const themes = testInfo.project.name === "chromium" ? (["light", "dark"] as const) : ([testInfo.project.name === "mobile-430" ? "dark" : "light"] as const);

    for (const theme of themes) {
        await setTheme(page, theme);
        for (const route of routes) await verifyRoute(page, route, `${testInfo.project.name} ${theme}`);
    }
});

test("every administrator section renders its server-backed surface", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const theme = testInfo.project.name === "mobile-430" ? "dark" : "light";
    await setTheme(page, theme);
    for (const section of ADMIN_SECTION_KEYS) {
        await verifyRoute(page, { path: section === "overview" ? "/admin" : `/admin?section=${section}` }, `${testInfo.project.name} admin ${section}`);
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.getByText("正在加载分区...", { exact: true })).toHaveCount(0);
        if (!USES_POSTGRES && ["orders", "products", "promotions", "coupons"].includes(section)) {
            await expect(page.getByText("商业运营需要启用 PostgreSQL", { exact: true })).toHaveCount(1);
        }
    }
});

test("signed-out, legal, installation and invalid public detail routes fail safely", async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: testInfo.project.use.viewport || undefined, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
        const theme = testInfo.project.name === "mobile-430" ? "dark" : "light";
        await page.addInitScript((nextTheme) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: nextTheme }, version: 0 })), theme);
        const routes: RouteCase[] = [
            { path: "/", expectedPath: /\/login\?next=%2F$/, readyHeading: "登录账号" },
            { path: "/login", readyHeading: "登录账号" },
            { path: "/register", expectedPath: /\/login(?:\?.*)?$/, readyHeading: "登录账号" },
            { path: "/forgot-password", readyHeading: "重置密码" },
            { path: "/privacy", readyHeading: "隐私政策" },
            { path: "/terms", readyHeading: "服务条款" },
            { path: "/gallery", expectedPath: /\/login\?next=/, readyHeading: "登录账号" },
            { path: "/announcements", readyHeading: "网站公告" },
            USES_POSTGRES ? { path: `/u/${E2E_ADMIN.username}`, expectedStatus: 404, readyText: "404" } : { path: `/u/${E2E_ADMIN.username}`, readyHeading: "创作者主页暂不可用" },
            { path: "/share/not-a-real-public-work", expectedStatus: USES_POSTGRES ? 404 : 200, readyText: USES_POSTGRES ? "404" : "作品分享暂不可用" },
            { path: "/install", expectedPath: /\/login\?next=%2F$/ },
        ];
        for (const route of routes) await verifyRoute(page, { ...route, allowAnonymousCatalog401: true }, `${testInfo.project.name} signed-out`);
    } finally {
        await context.close();
    }
});

async function createPageFixtures(request: APIRequestContext, viewportWidth: number) {
    const suffix = randomUUID().slice(0, 8);
    const nodeX = 120;
    const nodeWidth = 280;
    const viewportX = Math.round((viewportWidth - nodeWidth) / 2 - nodeX);
    const canvas = await request.post("/api/canvas/projects", {
        data: {
            title: `全页面回归画布 ${suffix}`,
            project: {
                viewport: { x: viewportX, y: 120, k: 1 },
                nodes: [{ id: `text-${suffix}`, type: "text", title: "页面回归节点", position: { x: nodeX, y: 120 }, width: nodeWidth, height: 180, metadata: { content: "服务端画布记录" } }],
                connections: [],
            },
        },
    });
    expect(canvas.ok(), await canvas.text()).toBe(true);
    const canvasPayload = (await canvas.json()) as { data: { project: { id: string } } };

    const drama = await request.post("/api/drama/projects", { data: { title: `全页面回归短剧 ${suffix}`, summary: "验证服务端项目读取与移动布局", initialScript: "两名学生在课堂讨论分镜。", ratio: "9:16" } });
    expect(drama.ok(), await drama.text()).toBe(true);
    const dramaPayload = (await drama.json()) as { data: { project: { id: string } } };
    return { canvasId: canvasPayload.data.project.id, dramaId: dramaPayload.data.project.id };
}

async function setTheme(page: Page, theme: "light" | "dark") {
    if (page.url() === "about:blank") await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate((nextTheme) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: nextTheme }, version: 0 })), theme);
}

async function verifyRoute(page: Page, route: RouteCase, label: string) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const apiFailures: ApiFailure[] = [];
    const apiFailureReads: Promise<void>[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    const onConsole = (message: { type(): string; text(): string }) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    };
    const onResponse = (response: Response) => {
        const url = new URL(response.url());
        if (url.origin !== BASE_URL || !url.pathname.startsWith("/api/") || response.status() < 400) return;
        apiFailureReads.push(
            response
                .text()
                .then((body) => apiFailures.push({ status: response.status(), path: url.pathname, body }))
                .catch(async () => {
                    let body = "<unreadable>";
                    if (response.request().method() === "GET") {
                        try {
                            const retry = await page.context().request.get(response.url());
                            if (retry.status() === response.status()) body = await retry.text();
                        } catch {
                            // The response may be disposed during a route transition; keep the exact path/status evidence.
                        }
                    }
                    apiFailures.push({ status: response.status(), path: url.pathname, body });
                }),
        );
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("response", onResponse);
    try {
        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
        if (route.expectedStatus !== undefined) expect(response?.status()).toBe(route.expectedStatus);
        else if (route.path.startsWith("/share/")) expect(response?.status()).toBe(404);
        else expect(response?.status() || 200, `${label} ${route.path} document status`).toBeLessThan(500);
        await expect(page.locator("main").first()).toBeVisible();
        const browserIconHref = await page.locator('link[rel="icon"]').getAttribute("href");
        expect(browserIconHref, `${label} ${route.path} browser icon href`).toBeTruthy();
        expect(browserIconHref, `${label} ${route.path} browser icon must not depend on a redirect`).not.toContain("/api/site-icon");
        if (route.expectedPath) await expect(page).toHaveURL(route.expectedPath);
        if (route.readyHeading) await expect(page.getByRole("heading", { name: route.readyHeading, exact: true })).toBeVisible();
        if (route.readyText) await expect(page.getByText(route.readyText, { exact: true }).first()).toBeVisible();
        await expect(page.locator("body")).not.toContainText("Application error");
        await expect(page.locator("body")).not.toContainText("Internal Server Error");
        await expectNoHorizontalOverflow(page, `${label} ${route.path}`);
        await expectVisibleControlsWithinViewport(page, `${label} ${route.path}`);
        await Promise.all(apiFailureReads);
        const expectedFailure = (failure: ApiFailure) => isExpectedFileProviderLimitation(failure) || (route.allowAnonymousCatalog401 === true && failure.path === "/api/model-catalog" && failure.status === 401);
        const expectedLimitations = apiFailures.filter(expectedFailure);
        const unexpectedApiFailures = apiFailures.filter((failure) => !expectedFailure(failure));
        expect(pageErrors, `${label} ${route.path} page errors`).toEqual([]);
        expect(unexpectedApiFailures, `${label} ${route.path} API failures`).toEqual([]);
        expect(withoutExpectedResourceErrors(consoleErrors, expectedLimitations, route.expectedStatus), `${label} ${route.path} console errors; API responses: ${JSON.stringify(apiFailures)}`).toEqual([]);
    } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
        page.off("response", onResponse);
    }
}

function isExpectedFileProviderLimitation(failure: ApiFailure) {
    if (failure.status === 404 && failure.path === `/api/public/users/${E2E_ADMIN.username}`) return failure.body.includes("创作者主页不存在");
    if (!USES_POSTGRES && failure.path.startsWith("/api/admin/billing/")) return false;
    if (USES_POSTGRES || (failure.status !== 409 && failure.status !== 501)) return false;
    if (failure.status === 409 && failure.path.startsWith("/api/public/users/")) return failure.body.includes("社区互动需要启用 PostgreSQL");
    return FILE_PROVIDER_LIMITATIONS.get(failure.path) === failure.status && failure.body.includes("需要启用 PostgreSQL");
}

function withoutExpectedResourceErrors(consoleErrors: string[], expectedLimitations: ApiFailure[], expectedDocumentStatus?: number) {
    const expectedStatuses = new Set(expectedLimitations.map((failure) => failure.status));
    if (expectedDocumentStatus && expectedDocumentStatus >= 400) expectedStatuses.add(expectedDocumentStatus);
    return consoleErrors.filter((message) => {
        const match = message.match(/^Failed to load resource: the server responded with a status of (\d+)/);
        const status = Number(match?.[1]);
        return !expectedStatuses.has(status);
    });
}

test("practice configuration renders the sole script settings entry without form errors", async ({ page }, testInfo) => {
    // This regression exercises the Form context; real agent persistence is PostgreSQL-only and covered separately.
    await page.route("**/api/admin/practice-script/overview", (route) => route.fulfill({ json: { code: 0, data: { profiles: [] }, msg: "OK" } }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin?section=practice", { waitUntil: "domcontentloaded" });
    const section = page.getByRole("region", { name: "无限练习配置", exact: true });
    await expect(section.getByText("剧本生成模型", { exact: true })).toBeVisible();
    await expect(section.getByText("备用剧本模型", { exact: true })).toBeVisible();
    await expect(section.getByText("默认语言", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "保存无限练习配置", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, `${testInfo.project.name} practice configuration`);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("practice-configuration.png"), fullPage: true });
});

test("script practice visibility persists through admin UI and gates school access without changing other modules", async ({ page, request, browser }, testInfo) => {
    const originalResponse = await request.get("/api/admin/settings");
    expect(originalResponse.ok()).toBe(true);
    const { settings: original } = await originalResponse.json();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const username = `script_switch_${suffix}`;
    const school = await request.post("/api/admin/schools", { data: { name: `开关验收学校 ${suffix}`, administrator: { username, displayName: "开关验收老师", password: E2E_PRACTICE_PASSWORD } } });
    expect(school.ok(), await school.text()).toBe(true);
    const manager = await createAuthenticatedE2EContext(browser, BASE_URL, { username, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
    const managerPage = await manager.newPage();
    const modulesBefore = await manager.request.get("/api/practice/modules");
    expect(modulesBefore.ok()).toBe(true);
    const beforeIds = ((await modulesBefore.json()).data.modules as Array<{ module: string }>).map((item) => item.module).sort();
    try {
        await page.goto("/admin?section=practice");
        const toggle = page.getByRole("switch", { name: "显示剧本练习模块", exact: true });
        const save = async (enabled: boolean) => {
            if (enabled) await toggle.check();
            else await toggle.uncheck();
            const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/admin/settings");
            await page.getByRole("button", { name: "保存无限练习配置", exact: true }).click();
            const response = await saved;
            expect(response.ok(), await response.text()).toBe(true);
            const payload = await response.json();
            expect(payload.settings.practiceScriptSettings).toEqual({ ...original.practiceScriptSettings, enabled });
            expect(payload.settings.practiceModuleVisibility).toEqual(original.practiceModuleVisibility);
            await page.reload();
            await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
        };
        await save(false);
        const blocked = await manager.request.get("/api/practice/scripts");
        expect(blocked.status()).toBe(404);
        expect((await blocked.json()).msg).toBe("剧本练习已停用");
        await managerPage.goto("/practice");
        await expect(managerPage.getByRole("heading", { name: "剧本练习", exact: true })).toHaveCount(0);
        await managerPage.goto("/practice/scripts");
        await expect(managerPage).toHaveURL(/\/practice$/);
        await save(true);
        const allowed = await manager.request.get("/api/practice/scripts");
        expect(allowed.ok(), await allowed.text()).toBe(true);
        await managerPage.goto("/practice");
        await expect(managerPage.getByRole("heading", { name: "剧本练习", exact: true })).toBeVisible();
        const workspace = await managerPage.goto("/practice/scripts");
        expect(workspace?.status()).toBe(200);
        await expect(managerPage).toHaveURL(/\/practice\/scripts$/);
        const modulesAfter = await manager.request.get("/api/practice/modules");
        expect(modulesAfter.ok()).toBe(true);
        expect(((await modulesAfter.json()).data.modules as Array<{ module: string }>).map((item) => item.module).sort()).toEqual(beforeIds);
    } finally {
        const restored = await request.patch("/api/admin/settings", { data: { practiceScriptSettings: original.practiceScriptSettings, practiceModuleVisibility: original.practiceModuleVisibility } });
        expect(restored.ok(), await restored.text()).toBe(true);
        await manager.close();
    }
});
