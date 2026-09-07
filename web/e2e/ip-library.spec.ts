import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext, e2eProjectContextOptions } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const PASSWORD = "IpLibraryE2E!2026";

type School = { id: string; name: string };
type IpPackage = { id: string; title: string };
type IpSubIp = { id: string; title: string; coverFileId?: string; items: IpItem[] };
type IpDetail = IpPackage & { subIps: IpSubIp[]; singleSubIp: boolean };
type IpItem = { id: string; title: string; fileId: string };
type IpFile = { id: string; status: string };
type IpGrant = { id: string; subIpId: string };
type PageResult<T> = { items: T[]; total: number };

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

test("IP 库按子 IP 编辑、授权、停用、下载和引用", async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000);
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 5)}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toLowerCase();
    const names = {
        school: `IP 子授权学校 ${suffix}`,
        manager: `ip_manager_${suffix}`,
        teacher: `ip_teacher_${suffix}`,
        student: `ip_student_${suffix}`,
        schoolIp: `本校多子 IP ${suffix}`,
        mainSubIp: `主线设定 ${suffix}`,
        extraSubIp: `扩展剧本 ${suffix}`,
        publicIp: `公共单子 IP ${suffix}`,
    };
    const contexts: BrowserContext[] = [];
    const contextOptions = e2eProjectContextOptions(testInfo.project.name);

    try {
        const school = await createSchool(page.request, names.school, names.manager);
        const manager = await authenticatedContext(browser, contexts, names.manager, contextOptions);
        await createSchoolMembers(manager.request, names.teacher, names.student);
        const teacher = await authenticatedContext(browser, contexts, names.teacher, contextOptions);
        const student = await authenticatedContext(browser, contexts, names.student, contextOptions);

        const schoolIp = await createIp(page.request, names.schoolIp, `school-${suffix}`, "school");
        const initial = await getIp(page.request, schoolIp.id);
        const mainSubIp = initial.subIps[0];
        const extraSubIp = await createSubIp(page.request, schoolIp.id, names.extraSubIp);
        await replaceSubIpText(page.request, schoolIp.id, mainSubIp.id, names.mainSubIp, `主线故事正文 ${suffix}`);
        await replaceSubIpText(page.request, schoolIp.id, extraSubIp.id, names.extraSubIp, `扩展剧本正文 ${suffix}`);
        const detail = await getIp(page.request, schoolIp.id);
        const configuredMain = requireSubIp(detail, mainSubIp.id);
        const configuredExtra = requireSubIp(detail, extraSubIp.id);
        expect(detail.subIps).toHaveLength(2);

        const grants = await Promise.all([configuredMain, configuredExtra].map((subIp) => createGrant(page.request, schoolIp.id, subIp.id, school.id)));
        expect(new Set(grants.map((grant) => grant.subIpId))).toEqual(new Set([configuredMain.id, configuredExtra.id]));

        const publicIp = await createIp(page.request, names.publicIp, `public-${suffix}`, "public");
        const publicInitial = (await getIp(page.request, publicIp.id)).subIps[0];
        await replaceSubIpText(page.request, publicIp.id, publicInitial.id, names.publicIp, `公共 IP 正文 ${suffix}`);

        await verifyAdminFullPageEditor(page, schoolIp.id, names.schoolIp, names.mainSubIp, names.extraSubIp);
        await verifyPublicSingleSubIp(page.request, browser, contexts, contextOptions, publicIp.id, names.publicIp);
        await verifySchoolMultiSubIp(teacher, schoolIp.id, names.mainSubIp, names.extraSubIp);
        await verifySchoolMultiSubIp(student, schoolIp.id, names.mainSubIp, names.extraSubIp);

        const downloaded = await teacher.request.post(`/api/ip-library/${schoolIp.id}/download`, {
            data: { subIpId: configuredExtra.id, itemIds: [configuredExtra.items[0].id], package: false },
        });
        expect(downloaded.ok(), await downloaded.text()).toBe(true);
        expect(downloaded.headers()["content-disposition"]).toContain("attachment");
        expect((await downloaded.body()).toString("utf8")).toContain(`扩展剧本正文 ${suffix}`);

        const reference = await teacher.request.post("/api/practice/projects", {
            data: {
                kind: "canvas",
                title: `子 IP 引用 ${suffix}`,
                references: [{ type: "ip", id: schoolIp.id, subIpId: configuredExtra.id, itemIds: [configuredExtra.items[0].id] }],
            },
        });
        expect(reference.ok(), await reference.text()).toBe(true);

        const usage = await apiData<PageResult<{ ipId: string; subIpId: string; itemId?: string; downloadType: string }>>(await page.request.get(`/api/admin/ip-library/usage?ipId=${schoolIp.id}`));
        expect(usage.items).toEqual(expect.arrayContaining([expect.objectContaining({ ipId: schoolIp.id, subIpId: configuredExtra.id, itemId: configuredExtra.items[0].id, downloadType: "item" })]));

        await apiData(await page.request.patch(`/api/admin/ip-library/${schoolIp.id}`, { data: { status: "disabled" } }));
        const managerLedger = await apiData<PageResult<{ ipId: string; subIpId: string; ipStatus: string; effective: boolean }>>(await manager.request.get("/api/school/ip-library"));
        expect(managerLedger.items).toEqual(expect.arrayContaining([expect.objectContaining({ ipId: schoolIp.id, subIpId: configuredMain.id, ipStatus: "disabled", effective: false })]));
        expect((await teacher.request.get(`/api/ip-library/${schoolIp.id}`)).status()).toBe(404);
        expect((await student.request.get(`/api/ip-library/${schoolIp.id}`)).status()).toBe(404);
        const deleted = await page.request.delete(`/api/admin/ip-library/${schoolIp.id}`);
        expect(deleted.status()).toBe(409);
        await expect(deleted.json()).resolves.toMatchObject({ code: 409, msg: "IP 已授权给学校，无法删除；请先撤销全部学校授权" });
        await expect(getIp(page.request, schoolIp.id)).resolves.toMatchObject({ id: schoolIp.id });
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

async function verifyAdminFullPageEditor(page: Page, ipId: string, title: string, mainSubIpTitle: string, extraSubIpTitle: string) {
    await page.goto("/admin?section=ipLibrary", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-admin-ip-library]")).toBeVisible();
    const row = page.locator("[data-admin-ip-library] .ant-table-row").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: title, exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "查看详情" })).toHaveText("详情");
    await expect(row.getByRole("button", { name: "停用 IP" })).toContainText("停用");
    await expect(row.getByRole("button", { name: "授权" })).toBeVisible();
    await row.getByRole("button", { name: "授权" }).click();
    const grantEditor = page.locator("[data-admin-ip-detail]");
    await expect(grantEditor).toBeVisible();
    await expect(grantEditor.getByRole("tab", { name: "学校授权", exact: true })).toHaveAttribute("aria-selected", "true");
    const grantDialog = page.getByRole("dialog", { name: "授权给学校" });
    await expect(grantDialog).toBeVisible();
    await grantDialog.getByRole("button", { name: "Close", exact: true }).click();
    await grantEditor.getByRole("button", { name: "返回 IP 列表" }).click();
    await row.getByRole("button", { name: "查看详情" }).click();
    const editor = page.locator("[data-admin-ip-detail]");
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "返回 IP 列表" })).toBeVisible();
    await expect(editor.getByRole("heading", { name: mainSubIpTitle, exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: extraSubIpTitle, exact: false })).toBeVisible();
    await expect(editor.getByRole("button", { name: "保存子 IP" })).toBeVisible();
    const categorySelect = editor.getByLabel("分类").first();
    await categorySelect.click();
    await expect(page.locator('[role="option"][aria-label="故事梗概"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    const coverField = editor
        .locator(".ant-form-item")
        .filter({ has: page.getByText("封面", { exact: true }) })
        .first();
    await expect(coverField.getByRole("button", { name: "上传原文件" })).toBeVisible();
    await coverField.locator('input[type="file"]').setInputFiles({
        name: "cover.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxR9wAAAABJRU5ErkJggg==", "base64"),
    });
    await expect(page.getByText("IP 文件已上传", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "添加内容" }).click();
    const contentTitle = `${mainSubIpTitle} 新增正文`;
    await editor.getByLabel("标题").last().fill(contentTitle);
    await editor.getByPlaceholder("手工录入正文").last().fill(`${contentTitle} 内容`);
    await editor.getByRole("button", { name: "保存正文" }).last().click();
    await expect(page.getByText("IP 文件已上传", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "保存子 IP" }).click();
    await expect(page.getByText("子 IP 内容已保存，已立即生效", { exact: true })).toBeVisible();
    const saved = requireSubIpByTitle(await getIp(page.request, ipId), mainSubIpTitle);
    expect(saved.coverFileId).toEqual(expect.any(String));
    expect(saved.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: contentTitle, fileId: expect.any(String) })]));
    await editor.getByRole("tab", { name: "学校授权", exact: true }).click();
    await expect(editor.getByText("授权后，该校管理员、教师和学生可直接访问对应子 IP。", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "admin IP full-page editor");
    await expectVisibleControlsWithinViewport(page, "admin IP full-page editor");
}

async function verifyPublicSingleSubIp(adminRequest: APIRequestContext, browser: Parameters<typeof createAuthenticatedE2EContext>[0], contexts: BrowserContext[], options: ReturnType<typeof e2eProjectContextOptions>, ipId: string, title: string) {
    const username = `ip_public_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await createOrdinaryUser(adminRequest, username);
    const context = await authenticatedContext(browser, contexts, username, options);
    const page = await context.newPage();
    try {
        await page.goto("/ip-library", { waitUntil: "domcontentloaded" });
        await expect(page.locator(`[data-ip-library-card="${ipId}"]`)).toBeVisible();
        await page.locator(`[data-ip-library-card="${ipId}"]`).click();
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(page.getByText("选择子 IP", { exact: true })).toHaveCount(0);
        await expectNoHorizontalOverflow(page, "single child IP detail");
    } finally {
        await page.close();
    }
}

async function verifySchoolMultiSubIp(context: BrowserContext, ipId: string, mainSubIpTitle: string, extraSubIpTitle: string) {
    const page = await context.newPage();
    try {
        await page.goto("/ip-library", { waitUntil: "domcontentloaded" });
        await page.getByText("本校 IP", { exact: true }).click();
        const card = page.locator(`[data-ip-library-card="${ipId}"]`);
        await expect(card).toBeVisible();
        await expect(card.getByText("2 个子 IP", { exact: true })).toBeVisible();
        await card.click();
        await expect(page.getByText("选择子 IP", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: mainSubIpTitle, exact: true })).toBeVisible();
        await page.getByText(extraSubIpTitle, { exact: true }).last().click();
        await expect(page.getByRole("heading", { name: extraSubIpTitle, exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(page, "multiple child IP detail");
        await expectVisibleControlsWithinViewport(page, "multiple child IP detail");
    } finally {
        await page.close();
    }
}

async function createSchool(request: APIRequestContext, name: string, username: string): Promise<School> {
    return apiData(await request.post("/api/admin/schools", { data: { name, profile: { city: "IP E2E" }, administrator: { username, displayName: `学校管理员 ${username}`, password: PASSWORD } } }));
}

async function createSchoolMembers(request: APIRequestContext, teacher: string, student: string) {
    await apiData(
        await request.post("/api/school/members", {
            data: {
                rows: [
                    { username: teacher, displayName: `教师 ${teacher}`, password: PASSWORD, role: "teacher" },
                    { username: student, displayName: `学生 ${student}`, password: PASSWORD, role: "student" },
                ],
            },
        }),
    );
}

async function createOrdinaryUser(request: APIRequestContext, username: string) {
    const response = await request.post("/api/admin/users", { data: { username, displayName: `公共 IP 用户 ${username}`, password: PASSWORD, role: "user", status: "active", pointsBalance: 0 } });
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ user: { username } });
}

async function createIp(request: APIRequestContext, title: string, slug: string, visibility: "public" | "school"): Promise<IpPackage> {
    return apiData(await request.post("/api/admin/ip-library", { data: { title, slug, summary: `${title} 简介`, visibility } }));
}

async function getIp(request: APIRequestContext, ipId: string): Promise<IpDetail> {
    return apiData(await request.get(`/api/admin/ip-library/${ipId}`));
}

async function createSubIp(request: APIRequestContext, ipId: string, title: string): Promise<IpSubIp> {
    return apiData(await request.post(`/api/admin/ip-library/${ipId}/sub-ips`, { data: { title, summary: `${title} 简介`, tags: ["E2E"], sourceNote: "测试授权" } }));
}

async function replaceSubIpText(request: APIRequestContext, ipId: string, subIpId: string, title: string, content: string) {
    const file = await apiData<IpFile>(await request.post(`/api/admin/ip-library/${ipId}/files`, { multipart: { subIpId, kind: "text", file: { name: `${title}.txt`, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") } } }));
    expect(file.status).toBe("ready");
    return apiData<IpSubIp>(
        await request.patch(`/api/admin/ip-library/${ipId}/sub-ips/${subIpId}`, {
            data: { title, summary: `${title} 简介`, tags: ["E2E", "子IP"], sourceNote: "测试授权", items: [{ kind: "text", category: "story_summary", title: `${title} 正文`, summary: "用于端到端验收", fileId: file.id, sortOrder: 0 }] },
        }),
    );
}

async function createGrant(request: APIRequestContext, ipId: string, subIpId: string, schoolId: string): Promise<IpGrant> {
    return apiData(await request.post(`/api/admin/ip-library/${ipId}/schools`, { data: { subIpId, schoolId, mode: "multi_school", startsAt: new Date(Date.now() - 60_000).toISOString(), note: "子 IP E2E 授权" } }));
}

async function authenticatedContext(browser: Parameters<typeof createAuthenticatedE2EContext>[0], contexts: BrowserContext[], username: string, options: ReturnType<typeof e2eProjectContextOptions>) {
    const context = await createAuthenticatedE2EContext(browser, BASE_URL, { username, password: PASSWORD }, options);
    contexts.push(context);
    return context;
}

function requireSubIp(detail: IpDetail, id: string) {
    const subIp = detail.subIps.find((item) => item.id === id);
    if (!subIp) throw new Error(`子 IP ${id} 不存在`);
    return subIp;
}

function requireSubIpByTitle(detail: IpDetail, title: string) {
    const subIp = detail.subIps.find((item) => item.title === title);
    if (!subIp) throw new Error(`子 IP ${title} 不存在`);
    return subIp;
}

async function apiData<T>(response: APIResponse): Promise<T> {
    const body = await response.text();
    expect(response.ok(), `${response.url()} -> ${response.status()} ${body}`).toBe(true);
    const payload = JSON.parse(body) as { code?: number; data?: T; msg?: string };
    expect(payload.code, `${response.url()} -> ${payload.msg || "unknown API error"}`).toBe(0);
    expect(payload.data).toBeDefined();
    return payload.data as T;
}
