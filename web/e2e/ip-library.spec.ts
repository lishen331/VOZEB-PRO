import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";

import { expectDialogWithinViewport, expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext, e2eProjectContextOptions } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const PASSWORD = "IpLibraryE2E!2026";
const USES_POSTGRES = Boolean(process.env.VOZEB_PRO_E2E_DATABASE_URL?.trim());

type School = { id: string; name: string };
type SchoolMember = { id: string; username: string; displayName: string; role: "teacher" | "student" };
type IpPackage = { id: string; title: string; status: "draft" | "published" | "disabled"; currentVersionId?: string };
type IpContentFile = { id: string; kind: "text" | "image" | "audio" | "video"; originalName: string; status: string };
type IpVersion = { id: string; versionNumber: number; title: string; items: Array<{ id: string; title: string; fileId: string }> };
type IpGrant = { id: string; schoolId: string; status: string; memberAccessEnabled: boolean };
type IpDownload = { versionId: string; itemId?: string; downloadType: "item" | "package"; result: "succeeded" | "failed" };
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
type ApiFailure = { path: string; status: number; body: string };

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

test("独立 IP 文件完成发布、学校开放、预览下载和撤权闭环", async ({ browser, page }, testInfo) => {
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
        const managerA = await authenticatedContext(browser, contexts, names.managerA, contextOptions);
        const managerB = await authenticatedContext(browser, contexts, names.managerB, contextOptions);
        const managerC = await authenticatedContext(browser, contexts, names.managerC, contextOptions);
        const [teacherA, studentA] = await createSchoolMembers(managerA.request, [
            { username: names.teacherA, displayName: `A 校老师 ${suffix}`, role: "teacher" },
            { username: names.studentA, displayName: `A 校学生 ${suffix}`, role: "student" },
        ]);

        const publicIp = await createPublishedTextIp(page.request, names.publicIp, `public-${suffix}`, "public");
        const multiIp = await createIpShell(page.request, names.multiIp, `multi-${suffix}`, "school");
        const files = await uploadCompleteFixture(page.request, multiIp.id);
        const v1 = await createAndPublishVersion(page.request, multiIp.id, {
            title: names.multiIp,
            summary: "多校 IP 第一版说明",
            coverFileId: files.image.id,
            tags: ["教学", "第一版"],
            sourceNote: "平台线下审核并取得授权",
            changeNote: "首次发布",
            items: [
                item("text", "story_summary", "故事梗概", files.text.id, 0),
                item("text", "creation_notes", "创作说明", files.markdown.id, 1),
                item("image", "character", "角色参考", files.image.id, 2),
                item("audio", "background_music", "背景音乐", files.audio.id, 3),
                item("video", "trailer", "预告参考", files.video.id, 4),
            ],
        });
        await publishIp(page.request, multiIp.id);
        const grantA = await createGrant(page.request, multiIp.id, schoolA.id, "multi_school");
        const grantB = await createGrant(page.request, multiIp.id, schoolB.id, "multi_school");
        expect(grantA.memberAccessEnabled).toBe(false);
        expect(grantB.memberAccessEnabled).toBe(false);

        const exclusiveIp = await createPublishedTextIp(page.request, names.exclusiveIp, `exclusive-${suffix}`, "school");
        const grantC = await createGrant(page.request, exclusiveIp.id, schoolC.id, "exclusive");
        expect(grantC.memberAccessEnabled).toBe(false);

        const ordinary = await authenticatedContext(browser, contexts, names.ordinary, contextOptions);
        const teacher = await authenticatedContext(browser, contexts, names.teacherA, contextOptions);
        const student = await authenticatedContext(browser, contexts, names.studentA, contextOptions);

        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await expectApiStatus(managerB.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await verifyAdminPreview(page, multiIp, v1, files);
        await setSchoolIpInBrowser(managerA, multiIp.title, true);
        await apiData(await managerC.request.patch(`/api/school/ip-library/${grantC.id}/access`, { data: { enabled: true } }));

        await verifyOrdinaryLibrary(ordinary, names.publicIp, names.multiIp, names.exclusiveIp);
        await verifySchoolLibrary(teacher, names.multiIp, false);
        await verifySchoolLibrary(student, names.multiIp, false);
        await verifySchoolLibrary(managerB, names.multiIp, false, false);
        await verifySchoolLibrary(managerC, names.exclusiveIp, true);
        await expectApiStatus(managerA.request.get(`/api/ip-library/${exclusiveIp.id}`), 404);
        await expectApiStatus(managerC.request.get(`/api/ip-library/${multiIp.id}`), 404);
        expect(publicIp.status).toBe("published");

        const detailPage = await teacher.newPage();
        const userErrors = watchPageErrors(detailPage);
        await detailPage.goto(`/ip-library/${multiIp.id}`, { waitUntil: "domcontentloaded" });
        await expect(detailPage.getByRole("heading", { name: names.multiIp, exact: true })).toBeVisible();
        await expect(detailPage.getByText(`当前版本：${names.multiIp}`, { exact: true })).toBeVisible();
        for (const heading of ["文本", "图片素材", "角色", "音乐与声音", "视频参考"]) await expect(detailPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        for (const hidden of ["一键使用", "引用 IP", "导入 Canvas", "导入短剧", "导入无限练习"]) await expect(detailPage.getByText(hidden, { exact: true })).toHaveCount(0);
        await expect(detailPage.getByText("第一版故事正文", { exact: false })).toBeVisible();
        await expect(detailPage.locator('img[alt="角色参考"]')).toBeVisible();
        await expect(detailPage.locator("audio")).toHaveCount(1);
        await expect(detailPage.locator("video")).toHaveCount(1);
        await expectNoHorizontalOverflow(detailPage, "IP detail");
        await expectVisibleControlsWithinViewport(detailPage, "IP detail");

        const itemDownload = await downloadFromButton(detailPage, detailPage.getByRole("button", { name: "下载故事梗概", exact: true }), testInfo.outputPath(`ip-item-${suffix}.txt`));
        expect(itemDownload.suggestedFilename()).toMatch(/\.txt$/i);
        const packageDownload = await downloadFromButton(detailPage, detailPage.getByRole("button", { name: "下载资源包", exact: true }), testInfo.outputPath(`ip-package-${suffix}.zip`));
        expect(packageDownload.suggestedFilename()).toMatch(/\.zip$/i);
        await expectDownloadHistory(page.request, multiIp.id, v1.id);

        const v2 = await createAndPublishVersion(page.request, multiIp.id, {
            sourceVersionId: v1.id,
            title: `${names.multiIp} 第二版`,
            summary: "第二版沿用全部原文件",
            changeNote: "补充课堂使用说明",
        });
        expect(v2.versionNumber).toBe(2);
        expect(v2.id).not.toBe(v1.id);
        await detailPage.reload({ waitUntil: "domcontentloaded" });
        await expect(detailPage.getByRole("heading", { name: `${names.multiIp} 第二版`, exact: true })).toBeVisible();
        await expect(detailPage.getByText("v2", { exact: true })).toBeVisible();

        await updateGrant(page.request, multiIp.id, grantA.id, "suspended");
        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await updateGrant(page.request, multiIp.id, grantA.id, "active");
        expect((await teacher.request.get(`/api/ip-library/${multiIp.id}`)).ok()).toBe(true);

        await setSchoolIpInBrowser(managerA, multiIp.title, false);
        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await setSchoolIpInBrowser(managerA, multiIp.title, true);
        await expectApiOk(
            await teacher.request.post("/api/practice/projects", {
                data: { kind: "canvas", title: "休眠 IP 引用契约", references: [{ type: "ip", id: multiIp.id, versionId: v2.id, itemIds: [] }] },
            }),
        );

        await updateGrant(page.request, multiIp.id, grantA.id, "revoked");
        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}`), 404);
        await expectApiStatus(teacher.request.get(`/api/ip-library/${multiIp.id}/items/${v2.items[0].id}/media?versionId=${v2.id}`), 404);
        await expectApiStatus(teacher.request.post(`/api/ip-library/${multiIp.id}/download`, { data: { versionId: v2.id, package: true } }), 404);
        await expectApiStatus(
            teacher.request.post("/api/practice/projects", {
                data: { kind: "canvas", title: "撤权后的休眠引用", references: [{ type: "ip", id: multiIp.id, versionId: v2.id, itemIds: [] }] },
            }),
            404,
        );
        expect((await managerB.request.get(`/api/ip-library/${multiIp.id}`)).status()).toBe(404);
        await expectDownloadHistory(page.request, multiIp.id, v1.id);

        expect(teacherA.role).toBe("teacher");
        expect(studentA.role).toBe("student");
        expect(new Set([schoolA.id, schoolB.id, schoolC.id]).size).toBe(3);
        expect(await userErrors.values(), "school user browser errors").toEqual([]);
        userErrors.stop();
        await detailPage.close();
        expect(await adminErrors.values(), "admin IP browser errors").toEqual([]);
    } finally {
        adminErrors.stop();
        await Promise.all(contexts.map((context) => context.close()));
    }
});

async function authenticatedContext(browser: Parameters<typeof createAuthenticatedE2EContext>[0], contexts: BrowserContext[], username: string, options: ReturnType<typeof e2eProjectContextOptions>) {
    const context = await createAuthenticatedE2EContext(browser, BASE_URL, { username, password: PASSWORD }, options);
    contexts.push(context);
    return context;
}

async function createOrdinaryUser(request: APIRequestContext, username: string, displayName: string) {
    await expectApiOk(await request.post("/api/admin/users", { data: { username, displayName, password: PASSWORD, role: "user", status: "active", pointsBalance: 0 } }));
}

async function createSchool(request: APIRequestContext, name: string, username: string, displayName: string) {
    return apiData<School>(await request.post("/api/admin/schools", { data: { name, profile: { city: "浏览器验收" }, administrator: { username, displayName, password: PASSWORD } } }));
}

async function createSchoolMembers(request: APIRequestContext, rows: Array<{ username: string; displayName: string; role: "teacher" | "student" }>) {
    return apiData<SchoolMember[]>(await request.post("/api/school/members", { data: { rows: rows.map((row) => ({ ...row, password: PASSWORD })) } }));
}

async function createIpShell(request: APIRequestContext, title: string, slug: string, visibility: "public" | "school") {
    return apiData<IpPackage>(await request.post("/api/admin/ip-library", { data: { title, slug, summary: `${title} 后台档案`, visibility, authorizationMode: "multi_school" } }));
}

async function createPublishedTextIp(request: APIRequestContext, title: string, slug: string, visibility: "public" | "school") {
    const ip = await createIpShell(request, title, slug, visibility);
    const text = await uploadFile(request, ip.id, "text", `${slug}.txt`, "text/plain", Buffer.from(`${title} 正文`, "utf8"));
    await createAndPublishVersion(request, ip.id, {
        title,
        summary: `${title} 发布简介`,
        tags: ["E2E"],
        sourceNote: "平台线下审核",
        changeNote: "首次发布",
        items: [item("text", "story_summary", "故事梗概", text.id, 0)],
    });
    return publishIp(request, ip.id);
}

async function uploadCompleteFixture(request: APIRequestContext, ipId: string) {
    const imageBytes = await readFile(resolve(process.cwd(), "public", "generation-smoke.webp"));
    const [text, markdown, image, audio, video] = await Promise.all([
        uploadFile(request, ipId, "text", "故事梗概.txt", "text/plain", Buffer.from("第一版故事正文\n用于课堂阅读。", "utf8")),
        uploadFile(request, ipId, "text", "创作说明.md", "text/markdown", Buffer.from("# 创作说明\n\n保留原创署名。", "utf8")),
        uploadFile(request, ipId, "image", "角色参考.webp", "image/webp", imageBytes),
        uploadFile(request, ipId, "audio", "背景音乐.wav", "audio/wav", wavFixture()),
        uploadFile(request, ipId, "video", "预告参考.mp4", "video/mp4", mp4Fixture()),
    ]);
    return { text, markdown, image, audio, video };
}

async function uploadFile(request: APIRequestContext, ipId: string, kind: IpContentFile["kind"], name: string, mimeType: string, buffer: Buffer) {
    const file = await apiData<IpContentFile>(
        await request.post(`/api/admin/ip-library/${ipId}/files`, {
            multipart: { kind, file: { name, mimeType, buffer } },
        }),
    );
    expect(file.status).toBe("ready");
    return file;
}

function item(kind: IpContentFile["kind"], category: string, title: string, fileId: string, sortOrder: number) {
    return { kind, category, title, summary: `${title} 说明`, fileId, sortOrder };
}

async function createAndPublishVersion(request: APIRequestContext, ipId: string, input: Record<string, unknown>) {
    const version = await apiData<IpVersion>(await request.post(`/api/admin/ip-library/${ipId}/versions`, { data: { action: "create", ...input } }));
    return apiData<IpVersion>(await request.post(`/api/admin/ip-library/${ipId}/versions`, { data: { action: "publish", versionId: version.id } }));
}

async function publishIp(request: APIRequestContext, ipId: string) {
    return apiData<IpPackage>(await request.patch(`/api/admin/ip-library/${ipId}`, { data: { status: "published" } }));
}

async function createGrant(request: APIRequestContext, ipId: string, schoolId: string, mode: "multi_school" | "exclusive") {
    return apiData<IpGrant>(
        await request.post(`/api/admin/ip-library/${ipId}/schools`, {
            data: { schoolId, mode, startsAt: new Date(Date.now() - 60_000).toISOString(), note: "E2E 线下授权" },
        }),
    );
}

async function updateGrant(request: APIRequestContext, ipId: string, grantId: string, status: "active" | "suspended" | "revoked") {
    return apiData<IpGrant>(await request.patch(`/api/admin/ip-library/${ipId}/schools/${grantId}`, { data: { status } }));
}

async function verifyAdminPreview(page: Page, ip: IpPackage, version: IpVersion, files: Record<string, IpContentFile>) {
    await page.goto("/admin?section=ipLibrary", { waitUntil: "domcontentloaded" });
    await expectAdminReady(page);
    await adminRow(page, ip.title).getByRole("button", { name: "版本", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: `${ip.title} · 版本历史`, exact: true });
    await expect(drawer.getByText(`v${version.versionNumber} · ${version.title}`, { exact: true })).toBeVisible();
    await expect(drawer.getByText("第一版故事正文", { exact: false })).toBeVisible();
    const images = drawer.locator(`img[alt="${files.image.originalName}"]`);
    const audio = drawer.locator("audio");
    const video = drawer.locator("video");
    expect(await images.count()).toBeGreaterThanOrEqual(1);
    expect(await audio.count()).toBeGreaterThanOrEqual(1);
    expect(await video.count()).toBeGreaterThanOrEqual(1);
    await expect(images.first()).toBeVisible();
    await expect(audio.first()).toBeVisible();
    await expect(video.first()).toBeVisible();
    await expectDialogWithinViewport(drawer);
    await expectVisibleControlsWithinViewport(page, "admin IP preview");
    await closeSurface(drawer);
}

async function setSchoolIpInBrowser(context: BrowserContext, title: string, enabled: boolean) {
    const page = await context.newPage();
    try {
        await page.goto("/school", { waitUntil: "networkidle" });
        const tab = page.getByRole("tab", { name: /IP 开放/ });
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        const toggle = page.getByRole("switch", { name: `${title}校内开放`, exact: true });
        await expect(toggle).toBeVisible();
        if ((await toggle.isChecked()) !== enabled) await toggle.click();
        await expect(toggle).toBeChecked({ checked: enabled });
        await expectNoHorizontalOverflow(page, "school IP access");
    } finally {
        await page.close();
    }
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
        await expect(page.getByText("独家授权", { exact: true })).toHaveCount(0);
    } finally {
        await page.close();
    }
}

async function verifySchoolLibrary(context: BrowserContext, title: string, exclusive: boolean, visible = true) {
    const page = await context.newPage();
    try {
        await page.goto("/ip-library", { waitUntil: "domcontentloaded" });
        await page.getByText("本校 IP", { exact: true }).click();
        if (visible) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        else await expect(page.getByText(title, { exact: true })).toHaveCount(0);
        await expect(page.getByText("多校授权", { exact: true })).toHaveCount(0);
        await expect(page.getByText("独家授权", { exact: true })).toHaveCount(exclusive && visible ? 1 : 0);
        await expectNoHorizontalOverflow(page, `school IP list ${title}`);
    } finally {
        await page.close();
    }
}

async function expectDownloadHistory(request: APIRequestContext, ipId: string, versionId: string) {
    await expect
        .poll(async () => {
            const history = await apiData<PageResult<IpDownload>>(await request.get(`/api/admin/ip-library/usage?ipId=${ipId}&page=1&pageSize=100`));
            return history.items.filter((record) => record.versionId === versionId && record.result === "succeeded").map((record) => record.downloadType);
        })
        .toEqual(expect.arrayContaining(["item", "package"]));
}

async function downloadFromButton(page: Page, button: Locator, targetPath: string) {
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    await download.saveAs(targetPath);
    expect((await stat(targetPath)).size).toBeGreaterThan(0);
    return download;
}

async function closeSurface(surface: Locator) {
    await surface.getByRole("button", { name: /^(关闭|Close)$/ }).click();
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

async function apiData<T = unknown>(response: APIResponse): Promise<T> {
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { code?: number; data?: T; msg?: string };
    expect(payload.code, body).toBe(0);
    return payload.data as T;
}

function wavFixture() {
    const bytes = Buffer.alloc(44);
    bytes.write("RIFF", 0);
    bytes.writeUInt32LE(36, 4);
    bytes.write("WAVEfmt ", 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(8_000, 24);
    bytes.writeUInt32LE(16_000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36);
    bytes.writeUInt32LE(0, 40);
    return bytes;
}

function mp4Fixture() {
    return Buffer.from("AAAAGGZ0eXBpc29tAAAAAGlzb21tcDQy", "base64");
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
                        // Navigation can dispose the page response; the API retry preserves path, status and body evidence.
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
