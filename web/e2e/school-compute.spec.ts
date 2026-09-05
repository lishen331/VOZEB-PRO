import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext } from "@playwright/test";

import type { AdminCommercialOrder, CommercialOrderInput, CreateSchoolInput, SchoolMember, SchoolDetail } from "../src/lib/school-domain";
import type { ProductionGroupDetails, SchoolComputePoolSummary } from "../src/lib/school-compute-domain";
import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext, e2eProjectContextOptions } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const PASSWORD = "SchoolComputeE2E!2026";

test.use({ actionTimeout: 15_000 });

test("学校算力池、制作小组和项目计费保持租户隔离", async ({ browser, page }, testInfo) => {
    test.setTimeout(360_000);
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 5)}${randomUUID().replaceAll("-", "").slice(0, 8)}`.toLowerCase();
    const names = {
        schoolA: `算力学校 A ${suffix}`,
        schoolB: `算力学校 B ${suffix}`,
        managerA: `compute_manager_a_${suffix}`,
        managerB: `compute_manager_b_${suffix}`,
        teacher: `compute_teacher_${suffix}`,
        student: `compute_student_${suffix}`,
        order: `算力验收商单 ${suffix}`,
        canvas: `算力验收画布 ${suffix}`,
        drama: `算力验收短剧 ${suffix}`,
    };
    const contexts: BrowserContext[] = [];
    const contextOptions = e2eProjectContextOptions(testInfo.project.name);
    try {
        const adminRequest = page.context().request;
        const schoolA = await createSchool(adminRequest, names.schoolA, names.managerA, `算力管理员 A ${suffix}`);
        const schoolB = await createSchool(adminRequest, names.schoolB, names.managerB, `算力管理员 B ${suffix}`);
        expect(schoolB.id).not.toBe(schoolA.id);
        const creditKey = `school-compute-e2e:${schoolA.id}:${suffix}`;
        await apiData(
            await adminRequest.patch(`/api/admin/schools/${schoolA.id}/compute`, {
                data: { amount: 100, reason: "学校算力 E2E 初始化", idempotencyKey: creditKey },
            }),
        );

        const managerA = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerA, password: PASSWORD }, contextOptions);
        const managerB = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerB, password: PASSWORD }, contextOptions);
        contexts.push(managerA, managerB);
        const members = await apiData<SchoolMember[]>(
            await managerA.request.post("/api/school/members", {
                data: {
                    rows: [
                        { username: names.teacher, displayName: `算力老师 ${suffix}`, password: PASSWORD, role: "teacher" },
                        { username: names.student, displayName: `算力学生 ${suffix}`, password: PASSWORD, role: "student" },
                    ],
                },
            }),
        );
        const teacher = members.find((member) => member.username === names.teacher);
        const student = members.find((member) => member.username === names.student);
        expect(teacher).toBeTruthy();
        expect(student).toBeTruthy();

        const order = await apiData<AdminCommercialOrder>(
            await adminRequest.post("/api/admin/commercial-orders", {
                data: {
                    title: names.order,
                    requirements: "学校算力 E2E 商单",
                    acceptanceCriteria: "生成并完成学校教学验收",
                    internalAmountCents: 1200,
                } satisfies CommercialOrderInput,
            }),
        );
        await apiData(await adminRequest.patch(`/api/admin/commercial-orders/${order.id}`, { data: { action: "assign", schoolId: schoolA.id } }));
        await apiData(
            await managerA.request.patch(`/api/school/commercial-orders/${order.id}`, {
                data: { action: "configure", teacherMembershipId: teacher!.id, participantMembershipIds: [student!.id] },
            }),
        );
        await apiData(await managerA.request.patch(`/api/school/commercial-orders/${order.id}`, { data: { action: "start" } }));

        const group = await apiData<ProductionGroupDetails>(
            await managerA.request.post("/api/school/production-groups", {
                data: { name: `剪辑小组 ${suffix}`, description: "学校算力 E2E 小组", leaderMembershipId: teacher!.id, memberMembershipIds: [teacher!.id, student!.id] },
            }),
        );
        await apiData(await managerA.request.patch(`/api/school/production-groups/${group.id}`, { data: { action: "link_order", orderId: order.id } }));
        const allocated = await apiData<ProductionGroupDetails>(
            await managerA.request.post(`/api/school/production-groups/${group.id}/allocate`, {
                data: { amount: 30, reason: "首轮制作预算", orderId: order.id, idempotencyKey: `group-allocation-e2e:${group.id}:${suffix}` },
            }),
        );
        expect(allocated.schoolPointsBalance).toBe(30);
        const pool = await apiData<SchoolComputePoolSummary>(await managerA.request.get("/api/school/compute"));
        expect(pool.availablePoints).toBe(70);
        expect((await apiData(await managerA.request.get(`/api/school/production-groups/${group.id}/settlements?page=1&pageSize=100`))).items).toEqual([]);

        const teacherContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.teacher, password: PASSWORD }, contextOptions);
        const studentContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.student, password: PASSWORD }, contextOptions);
        contexts.push(teacherContext, studentContext);
        const studentUser = await findAdminUser(adminRequest, names.student);
        await expectStatus(adminRequest.patch(`/api/admin/users/${studentUser.id}`, { data: { pointsBalance: 5 } }), 200);
        const advance = await apiData<{ id: string; originalPoints: number }>(
            await studentContext.request.post(`/api/teaching/production-groups/${group.id}/personal-advances`, {
                data: { orderId: order.id, amount: 5, idempotencyKey: `personal-advance-e2e:${group.id}:${suffix}` },
            }),
        );
        expect(advance.originalPoints).toBe(5);
        const ownAdvances = await apiData<{ items: Array<{ id: string }> }>(await studentContext.request.get(`/api/teaching/production-groups/${group.id}/personal-advances?page=1&pageSize=20`));
        expect(ownAdvances.items.map((item) => item.id)).toContain(advance.id);
        const request = await apiData<{ id: string }>(
            await teacherContext.request.post(`/api/teaching/production-groups/${group.id}/allocation-requests`, {
                data: { orderId: order.id, amount: 5, reason: "组长申请追加算力" },
            }),
        );
        await apiData(
            await managerA.request.patch(`/api/school/production-groups/${group.id}/allocation-requests`, {
                data: { requestId: request.id, decision: "approved", note: "E2E 批准" },
            }),
        );
        const afterApproval = await apiData<ProductionGroupDetails>(await managerA.request.get(`/api/school/production-groups/${group.id}`));
        expect(afterApproval.schoolPointsBalance).toBe(35);

        const canvasId = await createCanvas(studentContext.request, names.canvas);
        const dramaId = await createDrama(studentContext.request, names.drama);
        await linkProject(studentContext.request, group.id, order.id, "canvas", canvasId);
        await linkProject(studentContext.request, group.id, order.id, "drama", dramaId);
        const billing = await apiData<{ schoolName: string; groupName: string; orderTitle: string; availablePoints: number; chargeSource: string }>(
            await studentContext.request.get(`/api/teaching/project-billing?surface=canvas&projectId=${encodeURIComponent(canvasId)}`),
        );
        expect(billing).toMatchObject({ schoolName: names.schoolA, groupName: `剪辑小组 ${suffix}`, orderTitle: names.order, chargeSource: "group_school_points" });

        await expectTenantIsolation(managerB.request, schoolA.id, group.id, order.id, canvasId);
        await verifyProjectUi(studentContext, canvasId, dramaId, testInfo.project.name);
        await apiData(
            await studentContext.request.post(`/api/teaching/commercial-orders/${order.id}/submissions`, {
                data: { action: "candidate", note: "学生候选成果", references: [{ type: "canvas", id: canvasId }] },
            }),
        );
        const deliveryCanvasId = await createCanvas(teacherContext.request, `${names.canvas} 老师交付`);
        await apiData(
            await teacherContext.request.post(`/api/teaching/commercial-orders/${order.id}/submissions`, {
                data: { action: "delivery", note: "老师正式交付", references: [{ type: "canvas", id: deliveryCanvasId }] },
            }),
        );
        await apiData(await adminRequest.post(`/api/admin/commercial-orders/${order.id}/review`, { data: { decision: "accepted", feedback: "E2E 验收通过" } }));
        const settlements = await apiData<{ items: Array<{ id: string; status: string }> }>(await managerA.request.get(`/api/school/production-groups/${group.id}/settlements?page=1&pageSize=20`));
        expect(settlements.items).toHaveLength(1);
        expect(settlements.items[0]?.status).toBe("completed");
        await apiData(await managerA.request.post(`/api/school/production-groups/${group.id}/settlements/${settlements.items[0]!.id}/confirm`, { data: {} }));
        await apiData(await managerA.request.post(`/api/school/production-groups/${group.id}/settlements/${settlements.items[0]!.id}/confirm`, { data: {} }));
        const settledStudent = await findAdminUser(adminRequest, names.student);
        expect(settledStudent.pointsBalance).toBe(5);
        await verifySchoolComputeUi(managerA, testInfo.project.name);
        await verifyMemberUi(teacherContext, studentContext, testInfo.project.name);
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

async function createSchool(request: APIRequestContext, name: string, username: string, displayName: string) {
    return apiData<SchoolDetail>(
        await request.post("/api/admin/schools", {
            data: { name, profile: { source: "school-compute-e2e" }, administrator: { username, displayName, password: PASSWORD } } satisfies CreateSchoolInput,
        }),
    );
}

async function findAdminUser(request: APIRequestContext, username: string) {
    const response = await request.get(`/api/admin/users?page=1&pageSize=20&keyword=${encodeURIComponent(username)}`);
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { users?: Array<{ id: string; username: string; pointsBalance: number }> };
    const user = payload.users?.find((item) => item.username === username);
    expect(user, `admin user ${username}`).toBeTruthy();
    return user!;
}

async function createCanvas(request: APIRequestContext, title: string) {
    const data = await apiData<{ project: { id: string } }>(
        await request.post("/api/canvas/projects", {
            data: { title, project: { viewport: { x: 0, y: 0, k: 1 }, nodes: [], connections: [] } },
        }),
    );
    return data.project.id;
}

async function createDrama(request: APIRequestContext, title: string) {
    const data = await apiData<{ project: { id: string } }>(await request.post("/api/drama/projects", { data: { title, summary: "学校算力 E2E 短剧", ratio: "9:16" } }));
    return data.project.id;
}

async function linkProject(request: APIRequestContext, groupId: string, orderId: string, projectType: "canvas" | "drama", projectId: string) {
    return apiData(await request.post(`/api/teaching/production-groups/${groupId}/projects`, { data: { orderId, projectType, projectId } }));
}

async function expectTenantIsolation(request: APIRequestContext, schoolId: string, groupId: string, orderId: string, projectId: string) {
    const ownPool = await apiData<SchoolComputePoolSummary>(await request.get("/api/school/compute"));
    expect(ownPool.schoolId).not.toBe(schoolId);
    await expectStatus(request.get(`/api/school/production-groups/${groupId}`), 404);
    await expectStatus(request.get(`/api/school/production-groups/${groupId}/settlements?page=1&pageSize=20`), 404);
    await expectStatus(request.get(`/api/school/commercial-orders/${orderId}`), 404);
    await expectStatus(request.post(`/api/teaching/production-groups/${groupId}/projects`, { data: { orderId, projectType: "canvas", projectId } }), 404);
}

async function verifySchoolComputeUi(context: BrowserContext, projectName: string) {
    const page = await context.newPage();
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle");
        const tab = page.getByRole("tab", { name: "制作小组与算力", exact: true });
        await expect(tab).toBeVisible();
        await tab.evaluate((element) => (element as HTMLElement).click());
        await expect(page.getByRole("heading", { name: "制作小组与算力", exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(page, `${projectName} school compute`);
        await expectVisibleControlsWithinViewport(page, `${projectName} school compute`);
    } finally {
        await page.close();
    }
}

async function verifyMemberUi(teacherContext: BrowserContext, studentContext: BrowserContext, projectName: string) {
    for (const [context, route, label] of [
        [teacherContext, "/teaching", "teacher"],
        [studentContext, "/learning", "student"],
    ] as const) {
        const page = await context.newPage();
        try {
            await page.goto(route, { waitUntil: "domcontentloaded" });
            await expect(page.getByText("我的制作小组与算力", { exact: true })).toBeVisible();
            await expectNoHorizontalOverflow(page, `${projectName} ${label} compute`);
            await expectVisibleControlsWithinViewport(page, `${projectName} ${label} compute`);
        } finally {
            await page.close();
        }
    }
}

async function verifyProjectUi(context: BrowserContext, canvasId: string, dramaId: string, projectName: string) {
    for (const [route, label] of [
        [`/canvas/${canvasId}`, "canvas"],
        [`/drama/${dramaId}`, "drama"],
    ] as const) {
        const page = await context.newPage();
        try {
            await page.goto(route, { waitUntil: "domcontentloaded" });
            await expect(page.locator("[data-school-project-billing-badge]")).toBeVisible();
            await expectNoHorizontalOverflow(page, `${projectName} ${label} billing`);
            await expectVisibleControlsWithinViewport(page, `${projectName} ${label} billing`);
        } finally {
            await page.close();
        }
    }
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
