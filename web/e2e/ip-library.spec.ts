import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";

import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext, e2eProjectContextOptions } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const PASSWORD = "IpLibraryE2E!2026";
const USES_POSTGRES = Boolean(process.env.VOZEB_PRO_E2E_DATABASE_URL?.trim());

type School = { id: string; name: string };
type SchoolMember = { id: string; username: string; displayName: string; role: "teacher" | "student" };
type IpPackage = { id: string; title: string; status: "draft" | "published" | "disabled"; currentVersionId?: string };
type IpVersion = { id: string; versionNumber: number; title: string; items: Array<{ id: string; title: string }> };
type IpGrant = { id: string; schoolId: string; status: string; school?: { id: string; name: string } };
type IpUsage = { action: string; targetType: string; targetId: string };
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
type ApiFailure = { path: string; status: number; body: string };

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

test("平台发布的 IP 按公共、多校和独家授权进入三个学校创作工作区", async ({ browser, page }, testInfo) => {
    test.setTimeout(420_000);
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 5)}${randomUUID().replaceAll("-", "").slice(0, 7)}`.toLowerCase();
    const names = {
        ordinary: `ip_user_${suffix}`,
        managerA: `ip_manager_a_${suffix}`,
        managerB: `ip_manager_b_${suffix}`,
        managerC: `ip_manager_c_${suffix}`,
        teacherA: `ip_teacher_a_${suffix}`,
        studentA: `ip_student_a_${suffix}`,
        schoolA: `IP 验收 A 校 ${suffix}`,
        schoolB: `IP 验收 B 校 ${suffix}`,
        schoolC: `IP 验收 C 校 ${suffix}`,
        publicIp: `公共 IP ${suffix}`,
        multiIp: `多校 IP ${suffix}`,
        exclusiveIp: `独家 IP ${suffix}`,
    };
    const contexts: BrowserContext[] = [];
    const contextOptions = e2eProjectContextOptions(testInfo.project.name);
    const adminErrors = watchPageErrors(page);

    try {
        await createOrdinaryUser(page.request, names.ordinary, `普通用户 ${suffix}`);
        const schoolA = await createSchool(page.request, names.schoolA, names.managerA, `A 校管理员 ${suffix}`);
        const schoolB = await createSchool(page.request, names.schoolB, names.managerB, `B 校管理员 ${suffix}`);
        const schoolC = await createSchool(page.request, names.schoolC, names.managerC, `C 校管理员 ${suffix}`);

        const managerA = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerA, password: PASSWORD }, contextOptions);
        const managerB = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerB, password: PASSWORD }, contextOptions);
        const managerC = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerC, password: PASSWORD }, contextOptions);
        contexts.push(managerA, managerB, managerC);
        const [teacherA, studentA] = await createSchoolMembers(managerA.request, [
            { username: names.teacherA, displayName: `A 校老师 ${suffix}`, role: "teacher" },
            { username: names.studentA, displayName: `A 校学生 ${suffix}`, role: "student" },
        ]);

        const publicIp = await createPublishedIpByApi(page.request, names.publicIp, `public-${suffix}`, "public", "multi_school", "公共版本", "公共设定正文");
        const multiIp = await createIpShellInBrowser(page, names.multiIp, `multi-${suffix}`, "多校授权");
        const v1 = await createAndPublishVersionInBrowser(page, multiIp, "第一版", "第一版故事正文");
        const grantA = await grantSchoolInBrowser(page, multiIp, names.schoolA);
        await grantSchoolInBrowser(page, multiIp, names.schoolB);
        const v2 = await createAndPublishVersionInBrowser(page, multiIp, "第二版", "第二版新增设定");
        expect(v2.versionNumber).toBe(2);
        expect(v2.id).not.toBe(v1.id);

        const exclusiveIp = await createIpShellInBrowser(page, names.exclusiveIp, `exclusive-${suffix}`, "独家授权");
        await createAndPublishVersionByApi(page.request, exclusiveIp.id, "独家第一版", "独家学校设定");
        await expectApiOk(await page.request.patch(`/api/admin/ip-library/${exclusiveIp.id}`, { data: { status: "published" } }));
        await page.reload({ waitUntil: "domcontentloaded" });
        await expectAdminReady(page);
        await grantSchoolInBrowser(page, exclusiveIp, names.schoolC);

        const ordinary = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.ordinary, password: PASSWORD }, contextOptions);
        const teacher = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.teacherA, password: PASSWORD }, contextOptions);
        const student = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.studentA, password: PASSWORD }, contextOptions);
        contexts.push(ordinary, teacher, student);

        await verifyOrdinaryLibrary(ordinary, names.publicIp, names.multiIp, names.exclusiveIp);
        await verifySchoolLibrary(teacher, names.multiIp, false);
        await verifySchoolLibrary(student, names.multiIp, false);
        await verifySchoolLibrary(managerB, names.multiIp, false);
        await verifySchoolLibrary(managerC, names.exclusiveIp, true);
        await expectApiStatus(managerA.request.get(`/api/ip-library/${exclusiveIp.id}`), 404);
        await expectApiStatus(managerB.request.get(`/api/ip-library/${exclusiveIp.id}`), 404);
        expect(publicIp.status).toBe("published");

        const userPage = await teacher.newPage();
        const userErrors = watchPageErrors(userPage);
        await userPage.goto(`/ip-library/${multiIp.id}`, { waitUntil: "domcontentloaded" });
        await expect(userPage.getByRole("heading", { name: names.multiIp, exact: true })).toBeVisible();
        await expect(userPage.getByText("v2", { exact: true })).toBeVisible();
        await expect(userPage.getByText("当前版本：第二版", { exact: true })).toBeVisible();
        for (const heading of ["文本", "图片素材", "角色", "场景", "道具", "特效", "风格参考", "音乐与声音", "视频参考"]) await expect(userPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await userPage.reload({ waitUntil: "domcontentloaded" });
        await expect(userPage.getByText("当前版本：第二版", { exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(userPage, "IP detail");
        await expectVisibleControlsWithinViewport(userPage, "IP detail");

        const itemDownload = await downloadFromButton(userPage, userPage.getByRole("button", { name: "下载第二版", exact: true }), testInfo.outputPath(`ip-item-${suffix}.md`));
        expect(itemDownload.suggestedFilename()).toMatch(/\.md$/i);
        const packageDownload = await downloadFromButton(userPage, userPage.getByRole("button", { name: "下载资源包", exact: true }), testInfo.outputPath(`ip-package-${suffix}.zip`));
        expect(packageDownload.suggestedFilename()).toMatch(/\.zip$/i);

        const canvasUrl = await handoffToCanvas(userPage, multiIp.id);
        const dramaUrl = await handoffToDrama(userPage, multiIp.id);
        const practiceUrl = await handoffToPractice(userPage, multiIp.id);

        await expect
            .poll(async () => {
                const usage = await apiData<PageResult<IpUsage>>(await page.request.get(`/api/admin/ip-library/usage?ipId=${multiIp.id}&page=1&pageSize=100`));
                return usage.items.map((item) => `${item.action}:${item.targetType}`);
            })
            .toEqual(expect.arrayContaining(["download_item:download", "download_package:download", "reference:canvas", "reference:drama", "reference:practice"]));

        await revokeSchoolGrantInBrowser(page, multiIp, names.schoolA);
        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await expectApiStatus(teacher.request.post(`/api/ip-library/${multiIp.id}/download`, { data: { versionId: v2.id, package: true } }), 404);
        await expectApiStatus(
            teacher.request.post("/api/practice/projects", {
                data: { kind: "canvas", title: "撤权后的新引用", references: [{ type: "ip", id: multiIp.id, versionId: v2.id, itemIds: [] }] },
            }),
            404,
        );
        expect((await managerB.request.get(`/api/ip-library/${multiIp.id}`)).ok()).toBe(true);
        for (const url of [canvasUrl, dramaUrl, practiceUrl]) {
            await userPage.goto(url, { waitUntil: "domcontentloaded" });
            await expect(userPage.locator("body")).not.toContainText("IP 不存在或当前无权查看");
            await expect(userPage.locator("body")).not.toContainText("Internal Server Error");
        }
        const historical = await apiData<PageResult<IpUsage>>(await page.request.get(`/api/admin/ip-library/usage?ipId=${multiIp.id}&page=1&pageSize=100`));
        expect(historical.items.some((item) => item.targetType === "canvas")).toBe(true);
        expect(historical.items.some((item) => item.targetType === "drama")).toBe(true);
        expect(historical.items.some((item) => item.targetType === "practice")).toBe(true);
        expect(grantA.status).toBe("active");
        expect(teacherA.role).toBe("teacher");
        expect(studentA.role).toBe("student");
        expect(schoolA.id).not.toBe(schoolB.id);
        expect(schoolB.id).not.toBe(schoolC.id);
        expect(await userErrors.values(), "school user browser errors").toEqual([]);
        userErrors.stop();
        await userPage.close();
        expect(await adminErrors.values(), "admin IP browser errors").toEqual([]);
    } finally {
        adminErrors.stop();
        await Promise.all(contexts.map((context) => context.close()));
    }
});

async function createOrdinaryUser(request: APIRequestContext, username: string, displayName: string) {
    const response = await request.post("/api/admin/users", { data: { username, displayName, password: PASSWORD, role: "user", status: "active", pointsBalance: 0 } });
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
}

async function createSchool(request: APIRequestContext, name: string, username: string, displayName: string) {
    return apiData<School>(await request.post("/api/admin/schools", { data: { name, profile: { city: "浏览器验收" }, administrator: { username, displayName, password: PASSWORD } } }));
}

async function createSchoolMembers(request: APIRequestContext, rows: Array<{ username: string; displayName: string; role: "teacher" | "student" }>) {
    return apiData<SchoolMember[]>(await request.post("/api/school/members", { data: { rows: rows.map((row) => ({ ...row, password: PASSWORD })) } }));
}

async function createPublishedIpByApi(request: APIRequestContext, title: string, slug: string, visibility: "public" | "school", authorizationMode: "multi_school" | "exclusive", versionTitle: string, textContent: string) {
    const ip = await apiData<IpPackage>(await request.post("/api/admin/ip-library", { data: { title, slug, summary: `${title} 简介`, visibility, authorizationMode } }));
    await createAndPublishVersionByApi(request, ip.id, versionTitle, textContent);
    return apiData<IpPackage>(await request.patch(`/api/admin/ip-library/${ip.id}`, { data: { status: "published" } }));
}

async function createAndPublishVersionByApi(request: APIRequestContext, ipId: string, title: string, textContent: string) {
    const version = await apiData<IpVersion>(
        await request.post(`/api/admin/ip-library/${ipId}/versions`, {
            data: { action: "create", title, summary: `${title} 说明`, items: [{ kind: "text", category: "story_summary", title, textContent, sortOrder: 0 }] },
        }),
    );
    return apiData<IpVersion>(await request.post(`/api/admin/ip-library/${ipId}/versions`, { data: { action: "publish", versionId: version.id } }));
}

async function createIpShellInBrowser(page: Page, title: string, slug: string, authorizationLabel: "多校授权" | "独家授权") {
    await page.goto("/admin?section=ipLibrary", { waitUntil: "domcontentloaded" });
    await expectAdminReady(page);
    await page.getByRole("button", { name: "创建 IP", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "创建 IP 档案", exact: true });
    await expect(modal).toBeVisible();
    await modal.getByLabel("IP 名称").fill(title);
    await modal.getByLabel("slug").fill(slug);
    await modal.getByLabel("简介").fill(`${title} 浏览器验收简介`);
    await chooseSelect(page, modal.getByLabel("前端范围"), "本校 IP");
    await chooseSelect(page, modal.getByLabel("授权方式"), authorizationLabel);
    await modal.getByRole("button", { name: /保\s*存/ }).click();
    await expect(modal).toBeHidden();
    await expect(adminRow(page, title)).toBeVisible();
    const result = await apiData<PageResult<IpPackage>>(await page.request.get(`/api/admin/ip-library?page=1&pageSize=20&keyword=${encodeURIComponent(title)}`));
    const ip = result.items.find((item) => item.title === title);
    expect(ip).toBeTruthy();
    return ip as IpPackage;
}

async function createAndPublishVersionInBrowser(page: Page, ip: IpPackage, versionTitle: string, textContent: string) {
    const row = adminRow(page, ip.title);
    await row.getByRole("button", { name: "版本", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `${ip.title} · 版本历史`, exact: true });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "新建版本", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "创建不可覆盖的新版本", exact: true });
    await expect(modal).toBeVisible();
    await modal.getByLabel("版本名称").fill(versionTitle);
    await modal.getByLabel("版本说明").fill(`${versionTitle} 说明`);
    await modal.getByLabel("标题").fill(versionTitle);
    await modal.getByLabel("文本正文").fill(textContent);
    await modal.getByRole("button", { name: "创建草稿", exact: true }).click();
    await expect(modal).toBeHidden();
    const versionCard = drawer.getByText(new RegExp(`v\\d+ · ${escapeRegex(versionTitle)}`)).locator("xpath=ancestor::section[1]");
    await expect(versionCard).toBeVisible();
    await versionCard.getByRole("button", { name: /发\s*布/ }).click();
    await expect(versionCard.getByText("已发布", { exact: true })).toBeVisible();
    const result = await apiData<PageResult<IpVersion>>(await page.request.get(`/api/admin/ip-library/${ip.id}/versions?page=1&pageSize=20`));
    const version = result.items.find((item) => item.title === versionTitle);
    expect(version).toBeTruthy();
    await closeSurface(drawer);
    return version as IpVersion;
}

async function grantSchoolInBrowser(page: Page, ip: IpPackage, schoolName: string) {
    const row = adminRow(page, ip.title);
    await row.getByRole("button", { name: "授权", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `${ip.title} · 学校授权`, exact: true });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "新增授权", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "新增学校授权", exact: true });
    await expect(modal).toBeVisible();
    const schoolSelect = modal.getByLabel("学校");
    await schoolSelect.fill(schoolName);
    await expect(page.locator(".ant-select-dropdown").filter({ visible: true }).last().getByText(schoolName, { exact: true })).toBeVisible();
    await page.locator(".ant-select-dropdown").filter({ visible: true }).last().getByText(schoolName, { exact: true }).click();
    await modal.getByRole("button", { name: "创建授权", exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(drawer.getByText(schoolName, { exact: true })).toBeVisible();
    const result = await apiData<PageResult<IpGrant>>(await page.request.get(`/api/admin/ip-library/${ip.id}/schools?page=1&pageSize=20`));
    const grant = result.items.find((item) => item.school?.name === schoolName && item.status === "active");
    expect(grant).toBeTruthy();
    await closeSurface(drawer);
    return grant as IpGrant;
}

async function revokeSchoolGrantInBrowser(page: Page, ip: IpPackage, schoolName: string) {
    await page.goto("/admin?section=ipLibrary", { waitUntil: "domcontentloaded" });
    await expectAdminReady(page);
    await adminRow(page, ip.title).getByRole("button", { name: "授权", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `${ip.title} · 学校授权`, exact: true });
    const grantCard = drawer.getByText(schoolName, { exact: true }).locator("xpath=ancestor::article[1]");
    await expect(grantCard).toBeVisible();
    await grantCard.getByRole("button", { name: /撤\s*销/ }).click();
    await expect(grantCard.getByText("已撤销", { exact: true })).toBeVisible();
    await closeSurface(drawer);
}

async function verifyOrdinaryLibrary(context: BrowserContext, publicTitle: string, multiTitle: string, exclusiveTitle: string) {
    const page = await context.newPage();
    try {
        await page.goto("/ip-library", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "IP库", exact: true })).toBeVisible();
        await expect(page.getByText("公共 IP", { exact: true })).toBeVisible();
        await expect(page.getByText("本校 IP", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: publicTitle, exact: true })).toBeVisible();
        await expect(page.getByText(multiTitle, { exact: true })).toHaveCount(0);
        await expect(page.getByText(exclusiveTitle, { exact: true })).toHaveCount(0);
    } finally {
        await page.close();
    }
}

async function verifySchoolLibrary(context: BrowserContext, title: string, exclusive: boolean) {
    const page = await context.newPage();
    try {
        await page.goto("/ip-library", { waitUntil: "domcontentloaded" });
        await expect(page.getByText("本校 IP", { exact: true })).toBeVisible();
        await page.getByText("本校 IP", { exact: true }).click();
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(page.getByText("多校授权", { exact: true })).toHaveCount(0);
        if (exclusive) await expect(page.getByText("独家授权", { exact: true })).toBeVisible();
        else await expect(page.getByText("独家授权", { exact: true })).toHaveCount(0);
        await expectNoHorizontalOverflow(page, `school IP list ${title}`);
    } finally {
        await page.close();
    }
}

async function handoffToCanvas(page: Page, ipId: string) {
    await page.goto(`/ip-library/${ipId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "一键使用", exact: true }).click();
    await page.getByRole("button", { name: "画布", exact: true }).click();
    await expect(page).toHaveURL(/\/canvas\/[^/?]+$/);
    return new URL(page.url()).pathname;
}

async function handoffToDrama(page: Page, ipId: string) {
    await page.goto(`/ip-library/${ipId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "一键使用", exact: true }).click();
    await page.getByRole("button", { name: "短剧", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "新建短剧项目", exact: true });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "创建并进入", exact: true }).click();
    await expect(page).toHaveURL(/\/drama\/[^/?]+$/);
    return new URL(page.url()).pathname;
}

async function handoffToPractice(page: Page, ipId: string) {
    await page.goto(`/ip-library/${ipId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "一键使用", exact: true }).click();
    await page.getByRole("button", { name: "无限练习", exact: true }).click();
    const card = page.locator('[data-practice-project-card="canvas"]');
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "新建", exact: true }).click();
    await expect(page).toHaveURL(/\/canvas\/[^/?]+$/);
    return new URL(page.url()).pathname;
}

async function downloadFromButton(page: Page, button: Locator, targetPath: string) {
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    await download.saveAs(targetPath);
    expect((await stat(targetPath)).size).toBeGreaterThan(0);
    return download;
}

async function chooseSelect(page: Page, select: Locator, label: string) {
    await select.click();
    const dropdown = page.locator(".ant-select-dropdown").filter({ visible: true }).last();
    await dropdown.getByText(label, { exact: true }).click();
}

async function closeSurface(surface: Locator) {
    const close = surface.getByRole("button", { name: /^(关闭|Close)$/ });
    await close.click();
    await expect(surface).toBeHidden();
}

function adminRow(page: Page, title: string) {
    return page.getByText(title, { exact: true }).filter({ visible: true }).first().locator("xpath=ancestor::*[self::tr or self::article][1]");
}

async function expectAdminReady(page: Page) {
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建 IP", exact: true })).toBeVisible();
}

async function expectApiOk(response: APIResponse) {
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
}

async function expectApiStatus(responsePromise: Promise<APIResponse>, status: number) {
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(status);
}

async function apiData<T>(response: APIResponse): Promise<T> {
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { code?: number; data?: T; msg?: string };
    expect(payload.code, body).toBe(0);
    return payload.data as T;
}

function watchPageErrors(page: Page) {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const apiFailures: ApiFailure[] = [];
    const pending: Promise<void>[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    const onConsole = (message: { type(): string; text(): string }) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    };
    const onResponse = (response: Response) => {
        const url = new URL(response.url());
        if (url.origin !== BASE_URL || !url.pathname.startsWith("/api/") || response.status() < 400) return;
        pending.push(
            response
                .text()
                .then((body) => apiFailures.push({ path: url.pathname, status: response.status(), body }))
                .catch(async () => {
                    if (response.request().method() !== "GET") return;
                    try {
                        const retry = await page.context().request.get(response.url());
                        if (retry.status() === response.status()) apiFailures.push({ path: url.pathname, status: retry.status(), body: await retry.text() });
                    } catch {
                        // Navigation can dispose the page response; the API context retry preserves exact path, status, and body evidence.
                    }
                }),
        );
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("response", onResponse);
    return {
        async values() {
            await Promise.all(pending);
            const expected = apiFailures.filter((failure) => !USES_POSTGRES && failure.status === 409 && failure.path === "/api/notifications/interactions" && failure.body.includes("社区互动需要启用 PostgreSQL 数据库"));
            const unexpectedApiFailures = apiFailures.filter((failure) => !expected.includes(failure));
            const remainingExpectedResponses = [...expected];
            const unexpectedConsoleErrors = consoleErrors.filter((message) => {
                const index = remainingExpectedResponses.findIndex((failure) => message.includes(`status of ${failure.status}`));
                if (index < 0) return true;
                remainingExpectedResponses.splice(index, 1);
                return false;
            });
            return [...pageErrors, ...unexpectedConsoleErrors, ...unexpectedApiFailures.map((failure) => `${failure.status} ${failure.path}: ${failure.body}`)];
        },
        stop() {
            page.off("pageerror", onPageError);
            page.off("console", onConsole);
            page.off("response", onResponse);
        },
    };
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
