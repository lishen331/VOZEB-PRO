import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

import type { AdminSchoolMemberBatchPointsAdjustmentInput, AdminSchoolMemberPoints, AdminSchoolMemberPointsAdjustmentResult, CreateSchoolInput, PageResult, SchoolDetail, SchoolMember } from "../src/lib/school-domain";
import { expectDialogWithinViewport, expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext, e2eProjectContextOptions } from "./support";
import { adminMenuPermission } from "../src/components/admin/admin-sections";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const PASSWORD = "SchoolMemberPointsE2E!2026";

test.use({ actionTimeout: 15_000 });

test("平台管理员按学校管理成员个人永久积分", async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000);
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 5)}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toLowerCase();
    const names = {
        schoolA: `成员积分学校 A ${suffix}`,
        schoolB: `成员积分学校 B ${suffix}`,
        managerA: `mp_mgr_a_${suffix}`,
        managerB: `mp_mgr_b_${suffix}`,
        student: `mp_student_${suffix}`,
        limitedAdmin: `mp_limited_${suffix}`,
    };
    const contexts: BrowserContext[] = [];
    try {
        const adminRequest = page.context().request;
        const schoolA = await createSchool(adminRequest, names.schoolA, names.managerA);
        const schoolB = await createSchool(adminRequest, names.schoolB, names.managerB);
        const managerA = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerA, password: PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
        const managerB = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerB, password: PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
        contexts.push(managerA, managerB);
        const members = await apiData<SchoolMember[]>(await managerA.request.post("/api/school/members", { data: { rows: [{ username: names.student, displayName: `积分学生 ${suffix}`, password: PASSWORD, role: "student" }] } }));
        const schoolMember = members.find((item) => item.username === names.student);
        expect(schoolMember).toBeTruthy();
        const student = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.student, password: PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
        contexts.push(student);

        const baseline = await findMember(adminRequest, schoolA.id, schoolMember!.id);
        expect(baseline.accountId).toBeTruthy();
        const creditKey = `school-member-points:${schoolA.id}:${schoolMember!.id}:${suffix}`;
        const credit = await adjust(adminRequest, schoolA.id, schoolMember!.id, { operation: "credit", amount: 12.5, reason: "E2E 首次调账", idempotencyKey: creditKey });
        expect(credit.member.permanentPoints).toBe(baseline.permanentPoints + 12.5);
        expect(credit.member.dailyPoints).toBe(baseline.dailyPoints);
        const replay = await adjust(adminRequest, schoolA.id, schoolMember!.id, { operation: "credit", amount: 12.5, reason: "E2E 首次调账", idempotencyKey: creditKey });
        expect(replay.adjustment.recordId).toBe(credit.adjustment.recordId);
        expect(replay.member.permanentPoints).toBe(credit.member.permanentPoints);
        await expectStatus(adminRequest.post(`/api/admin/schools/${schoolA.id}/members/${schoolMember!.id}/points-adjustments`, { data: { operation: "credit", amount: 12.75, reason: "E2E 首次调账", idempotencyKey: creditKey } }), 409);

        const debit = await adjust(adminRequest, schoolA.id, schoolMember!.id, { operation: "debit", amount: 2.25, reason: "E2E 扣减", idempotencyKey: `${creditKey}:debit` });
        expect(debit.adjustment).toMatchObject({ balanceBefore: credit.member.permanentPoints, balanceAfter: credit.member.permanentPoints - 2.25, amount: 2.25, operation: "debit" });
        expect(debit.member.dailyPoints).toBe(baseline.dailyPoints);

        await expectStatus(adminRequest.get(`/api/admin/schools/${schoolB.id}/members/${schoolMember!.id}/points-adjustments`), 405);
        await expectStatus(adminRequest.post(`/api/admin/schools/${schoolB.id}/members/${schoolMember!.id}/points-adjustments`, { data: { operation: "credit", amount: 1, reason: "跨校", idempotencyKey: `${creditKey}:cross-school` } }), 404);
        await expectStatus(managerA.request.get(`/api/admin/schools/${schoolA.id}/members`), 403);
        await expectStatus(managerA.request.post(`/api/admin/schools/${schoolA.id}/members/${schoolMember!.id}/points-adjustments`, { data: { operation: "credit", amount: 1, reason: "越权", idempotencyKey: `${creditKey}:manager` } }), 403);
        await expectStatus(student.request.get(`/api/admin/schools/${schoolA.id}/members`), 403);
        await expectStatus(student.request.post(`/api/admin/schools/${schoolA.id}/members/${schoolMember!.id}/points-adjustments`, { data: { operation: "credit", amount: 1, reason: "越权", idempotencyKey: `${creditKey}:student` } }), 403);

        await createAdmin(adminRequest, names.limitedAdmin);
        const limitedContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.limitedAdmin, password: PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
        contexts.push(limitedContext);
        await expectStatus(limitedContext.request.get(`/api/admin/schools/${schoolA.id}/members?page=1&pageSize=20`), 403);
        await expectStatus(limitedContext.request.post("/api/admin/schools", { data: { name: "越权学校", administrator: { username: `forbidden_${suffix}`, password: PASSWORD } } }), 403);
        await verifyLimitedAdminUi(limitedContext);

        const disabled = await adminRequest.patch(`/api/admin/users/${debit.member.userId}`, { data: { status: "disabled" } });
        expect(disabled.status(), await disabled.text()).toBe(400);
        // Disabled-account coverage is a test fixture, not permission to change a school user through user operations.
        const connectionString = process.env.VOZEB_PRO_E2E_DATABASE_URL;
        if (!connectionString) throw new Error("Disabled-account RBAC fixture requires the dedicated E2E PostgreSQL database");
        const fixture = new Client({ connectionString });
        await fixture.connect();
        try {
            const seeded = await fixture.query("UPDATE vozeb_pro_users SET status = 'disabled' WHERE id = $1 RETURNING id", [debit.member.userId]);
            expect(seeded.rowCount).toBe(1);
        } finally {
            await fixture.end();
        }
        const disabledResult = await adjust(adminRequest, schoolA.id, schoolMember!.id, { operation: "credit", amount: 1, reason: "停用账号修正", idempotencyKey: `${creditKey}:disabled` });
        expect(disabledResult.member.accountStatus).toBe("disabled");
        expect(disabledResult.member.permanentPoints).toBe(debit.member.permanentPoints + 1);

        let browserBalance = disabledResult.member.permanentPoints;
        for (const theme of ["light", "dark"] as const) browserBalance = await verifyAdminUi(page, names.schoolA, disabledResult.member.accountId, browserBalance, theme, testInfo.project.name);
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

test("批量调整学校成员积分并保持整批一致", async ({ browser, page }, testInfo) => {
    const suffix = randomUUID().slice(0, 8);
    const request = page.request;
    const schoolName = `批量调账学校 ${suffix}`;
    const school = await createSchool(request, schoolName, `batch_mgr_${suffix}`);
    const otherSchool = await createSchool(request, `其他学校 ${suffix}`, `other_mgr_${suffix}`);
    const manager = await createAuthenticatedE2EContext(browser, BASE_URL, { username: `batch_mgr_${suffix}`, password: PASSWORD }, e2eProjectContextOptions(testInfo.project.name));
    const studentPrefix = `batch_std_${suffix}`;
    let members: SchoolMember[];
    try {
        members = await apiData<SchoolMember[]>(
            await manager.request.post("/api/school/members", {
                data: { rows: ["a", "b"].map((label) => ({ username: `${studentPrefix}_${label}`, password: PASSWORD, role: "student" })) },
            }),
        );
        await expectStatus(
            manager.request.post(`/api/admin/schools/${school.id}/members`, {
                data: { membershipIds: members.map(({ id }) => id), operation: "credit", amount: 1, reason: "越权", idempotencyKey: randomUUID() },
            }),
            403,
        );
    } finally {
        await manager.close();
    }
    const baseline = await Promise.all(members.map(({ id }) => findMember(request, school.id, id)));
    const endpoint = `/api/admin/schools/${school.id}/members`;
    const memberIds = members.map(({ id }) => id);
    const outsider = (await apiData<PageResult<AdminSchoolMemberPoints>>(await request.get(`/api/admin/schools/${otherSchool.id}/members`))).items[0];
    const amount = 2.25;

    await page.goto("/admin?section=schools");
    await page.getByPlaceholder("搜索学校名称").filter({ visible: true }).fill(schoolName);
    await page.locator("tbody tr, [data-school-card]").filter({ hasText: schoolName }).getByRole("button", { name: "成员", exact: true }).filter({ visible: true }).click();
    const search = page.getByPlaceholder("搜索账号 ID、用户名、姓名或邮箱");
    await search.fill(studentPrefix);
    await expect(page.getByText(`@${studentPrefix}_a`, { exact: false }).filter({ visible: true })).toBeVisible();
    const adjustBatch = page.getByRole("button", { name: /批量调整积分/ });
    const modal = page.getByRole("dialog", { name: "批量调整个人永久积分" });
    let batchRequests = 0;
    page.on("request", (entry) => {
        if (entry.url().endsWith(endpoint) && entry.method() === "POST") batchRequests++;
    });
    await expect(adjustBatch).toBeDisabled();
    if (!testInfo.project.name.startsWith("mobile-")) {
        const buttonBounds = await adjustBatch.boundingBox();
        expect(buttonBounds).not.toBeNull();
        await page.mouse.move(buttonBounds!.x + buttonBounds!.width / 2, buttonBounds!.y + buttonBounds!.height / 2);
        await expect(page.getByRole("tooltip")).toHaveText("请先批量选择用户");
    }
    await expect(modal).toBeHidden();
    expect(batchRequests).toBe(0);
    await page.getByRole("checkbox", { name: "全选本页" }).check();
    await expect(adjustBatch).toHaveText(/2/);
    await search.fill(`${studentPrefix}_a`);
    await expect(adjustBatch).toBeDisabled();
    await search.fill(studentPrefix);
    await expect(page.getByText(`@${studentPrefix}_b`, { exact: false }).filter({ visible: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "全选本页" }).check();
    await adjustBatch.click();
    await expect(modal).toBeVisible();
    await expectDialogWithinViewport(modal);
    await modal.getByRole("spinbutton").fill(String(amount));
    await expect(modal.getByText("合计增加 4.5 积分")).toBeVisible();
    await modal.getByRole("textbox").fill("批量测试奖励");
    const submitted = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST");
    await modal.getByRole("button", { name: "确认调整" }).click();
    const response = await submitted;
    expect(batchRequests).toBe(1);
    const input = response.request().postDataJSON() as AdminSchoolMemberBatchPointsAdjustmentInput;
    const credited = await apiData<{ items: AdminSchoolMemberPointsAdjustmentResult[] }>(response);
    await expect(modal).toBeHidden();
    await expect(adjustBatch).toBeDisabled();
    expect(input.membershipIds.sort()).toEqual(memberIds.slice().sort());
    const assertBalances = async (delta: number) => {
        for (const previous of baseline) {
            const member = await findMember(request, school.id, previous.id);
            expect(member.permanentPoints).toBe(previous.permanentPoints + delta);
            expect(member.dailyPoints).toBe(previous.dailyPoints);
        }
    };
    for (const previous of baseline) {
        const row = page
            .locator("tbody tr, [data-school-member-card]")
            .filter({ hasText: `账号 ID：${previous.accountId}` })
            .filter({ visible: true });
        await expect(row.getByText(formatPoints(previous.permanentPoints + amount), { exact: true }).first()).toBeVisible();
    }
    await assertBalances(amount);
    const reloaded = page.waitForResponse((entry) => entry.url().includes(`${endpoint}?`) && entry.request().method() === "GET");
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    const refreshed = await apiData<PageResult<AdminSchoolMemberPoints>>(await reloaded);
    expect(refreshed.items).toHaveLength(2);
    for (const previous of baseline) expect(refreshed.items.find(({ id }) => id === previous.id)?.permanentPoints).toBe(previous.permanentPoints + amount);

    const replay = await apiData<{ items: AdminSchoolMemberPointsAdjustmentResult[] }>(await request.post(endpoint, { data: { ...input, membershipIds: [memberIds[1], memberIds[0], memberIds[1]] } }));
    expect(replay.items.map(({ adjustment }) => adjustment.recordId)).toEqual(credited.items.map(({ adjustment }) => adjustment.recordId));
    await expectStatus(request.post(endpoint, { data: { ...input, membershipIds: [memberIds[0]] } }), 409);
    await expectStatus(request.post(endpoint, { data: { ...input, membershipIds: [memberIds[0], outsider.id], idempotencyKey: randomUUID() } }), 404);
    await assertBalances(amount);

    const [first, second] = [...baseline].sort((left, right) => left.userId.localeCompare(right.userId));
    const firstExtra = Math.max(1, second.permanentPoints - first.permanentPoints + 1);
    await adjust(request, school.id, first.id, { operation: "credit", amount: firstExtra, reason: "准备部分余额不足场景", idempotencyKey: randomUUID() });
    await expectStatus(request.post(endpoint, { data: { ...input, operation: "debit", amount: second.permanentPoints + amount + 0.01, idempotencyKey: randomUUID() } }), 409);
    expect((await findMember(request, school.id, first.id)).permanentPoints).toBe(first.permanentPoints + amount + firstExtra);
    expect((await findMember(request, school.id, second.id)).permanentPoints).toBe(second.permanentPoints + amount);
    await apiData(await request.post(endpoint, { data: { ...input, operation: "debit", amount: 0.25, idempotencyKey: randomUUID() } }));
    expect((await findMember(request, school.id, first.id)).permanentPoints).toBe(first.permanentPoints + 2 + firstExtra);
    expect((await findMember(request, school.id, second.id)).permanentPoints).toBe(second.permanentPoints + 2);
    await expectNoHorizontalOverflow(page, `${testInfo.project.name} batch school member points`);
});

async function createSchool(request: APIRequestContext, name: string, username: string) {
    return apiData<SchoolDetail>(await request.post("/api/admin/schools", { data: { name, profile: { source: "admin-school-member-points-e2e" }, administrator: { username, displayName: username, password: PASSWORD } } satisfies CreateSchoolInput }));
}

async function findMember(request: APIRequestContext, schoolId: string, membershipId: string) {
    const result = await apiData<PageResult<AdminSchoolMemberPoints>>(await request.get(`/api/admin/schools/${encodeURIComponent(schoolId)}/members?page=1&pageSize=20`));
    const member = result.items.find((item) => item.id === membershipId);
    expect(member).toBeTruthy();
    return member!;
}

async function adjust(request: APIRequestContext, schoolId: string, membershipId: string, data: { operation: "credit" | "debit"; amount: number; reason: string; idempotencyKey: string }) {
    return apiData<AdminSchoolMemberPointsAdjustmentResult>(await request.post(`/api/admin/schools/${encodeURIComponent(schoolId)}/members/${encodeURIComponent(membershipId)}/points-adjustments`, { data }));
}

async function createAdmin(request: APIRequestContext, username: string) {
    const roleResponse = await request.post("/api/admin/rbac/roles", { data: { name: username, permissions: [adminMenuPermission("users")] } });
    expect(roleResponse.ok(), await roleResponse.text()).toBe(true);
    const { role } = (await roleResponse.json()) as { role: { key: string } };
    const response = await request.post("/api/admin/rbac/administrators", { data: { username, displayName: username, password: PASSWORD, roleKey: role.key } });
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { administrator?: { id: string } };
    expect(payload.administrator).toBeTruthy();
    return payload.administrator!;
}

async function verifyLimitedAdminUi(context: BrowserContext) {
    const page = await context.newPage();
    try {
        await page.goto(`/admin?section=schools`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        // User operations cannot read education operations; preserve the existing server-side permission boundary.
        await expect(page.getByPlaceholder("搜索学校名称")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "成员", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "新建学校", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "详情", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "编辑", exact: true })).toHaveCount(0);
    } finally {
        await page.close();
    }
}

async function verifyAdminUi(page: Page, schoolName: string, accountId: string, permanentPoints: number, theme: "light" | "dark", projectName: string): Promise<number> {
    await page.addInitScript((nextTheme) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: nextTheme }, version: 0 })), theme);
    await page.goto("/admin?section=schools", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    const schoolSearch = page.getByPlaceholder("搜索学校名称").filter({ visible: true });
    await expect(schoolSearch).toHaveCount(1);
    await schoolSearch.fill(schoolName);
    const memberButton = page.locator("tbody tr, [data-school-card]").filter({ hasText: schoolName }).getByRole("button", { name: "成员", exact: true }).filter({ visible: true });
    await memberButton.click();
    await expect(page.locator("[data-school-members]")).toBeVisible();
    await page.getByPlaceholder("搜索账号 ID、用户名、姓名或邮箱").fill(accountId);
    await expect(page.getByText(`账号 ID：${accountId}`, { exact: false }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("停用账号当前不能生成", { exact: true }).filter({ visible: true })).toBeVisible();
    const member = projectName.startsWith("mobile-") ? page.locator("[data-school-member-card]").filter({ hasText: `账号 ID：${accountId}` }) : page.locator("tbody tr").filter({ hasText: `账号 ID：${accountId}` });
    await member.getByRole("button", { name: "调整积分", exact: true }).click();
    const modal = page.getByRole("dialog", { name: new RegExp(`调整 ${accountId} 的个人永久积分`) });
    await expect(modal).toBeVisible();
    await expectDialogWithinViewport(modal);
    await modal.getByText("扣减", { exact: true }).click();
    await modal.getByRole("spinbutton").fill("2.25");
    await modal.getByRole("textbox").fill("浏览器验收扣减");
    await expect(modal.getByText(`调整后：${formatPoints(permanentPoints - 2.25)}`, { exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "确认调整", exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(
        page
            .getByText(formatPoints(permanentPoints - 2.25), { exact: true })
            .filter({ visible: true })
            .first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `${projectName} ${theme} school member points`);
    await expectVisibleControlsWithinViewport(page, `${projectName} ${theme} school member points`);
    return permanentPoints - 2.25;
}

function formatPoints(value: number) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

async function expectStatus(responsePromise: Promise<APIResponse>, status: number) {
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(status);
}

async function apiData<T = unknown>(response: APIResponse): Promise<T> {
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { code?: number; data?: T; msg?: string };
    expect(payload.code, payload.msg || body).toBe(0);
    return payload.data as T;
}
