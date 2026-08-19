import { randomUUID } from "node:crypto";

import { devices, expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type BrowserContextOptions, type Locator, type Page, type Response } from "@playwright/test";

import type {
    AdminCommercialOrder,
    CommercialOrderDelivery,
    CommercialOrderParticipantSubmission,
    PageResult,
    PlatformCourse,
    SchoolClass,
    SchoolClassDetail,
    SchoolCommercialOrder,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    SchoolDetail,
    SchoolMember,
    TeachingAssignment,
    TeachingSubmission,
} from "../src/lib/school-domain";
import { expectNoHorizontalOverflow, expectVisibleControlsWithinViewport } from "./responsive-helpers";
import { createAuthenticatedE2EContext } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;
const USES_POSTGRES = Boolean(process.env.VOZEB_PRO_E2E_DATABASE_URL?.trim());
const PASSWORD = "SchoolE2E!2026";

type ApiFailure = { path: string; status: number; body: string };

test.use({ actionTimeout: 15_000 });

test("two schools complete teaching and commercial-order workflows without crossing tenants", async ({ browser, page }, testInfo) => {
    test.setTimeout(360_000);
    const suffix = `${testInfo.project.name.replace(/\W/g, "").slice(0, 5)}${randomUUID().replaceAll("-", "").slice(0, 7)}`.toLowerCase();
    const names = {
        schoolA: `E2E 产教 A ${suffix}`,
        schoolB: `E2E 产教 B ${suffix}`,
        managerA: `school_manager_a_${suffix}`,
        managerB: `school_manager_b_${suffix}`,
        teacherA: `school_teacher_a_${suffix}`,
        studentA: `school_student_a_${suffix}`,
        studentB: `school_student_b_${suffix}`,
        course: `品牌短片课程 ${suffix}`,
        assignment: `短片脚本作业 ${suffix}`,
        order: `品牌短片商单 ${suffix}`,
    };
    const contexts: BrowserContext[] = [];
    const contextOptions = projectContextOptions(testInfo.project.name);
    const hasTouch = contextOptions.hasTouch === true;

    try {
        const schoolA = await createSchoolInBrowser(page.context(), names.schoolA, names.managerA, `A 校管理员 ${suffix}`, "A");
        const schoolB = await createSchoolInBrowser(page.context(), names.schoolB, names.managerB, `B 校管理员 ${suffix}`, "B");

        const managerAContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerA, password: PASSWORD }, contextOptions);
        const managerBContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.managerB, password: PASSWORD }, contextOptions);
        contexts.push(managerAContext, managerBContext);

        const teacher = await createSchoolMemberInBrowser(managerAContext, names.teacherA, `A 校老师 ${suffix}`, "老师", hasTouch);
        const student = await createSchoolMemberInBrowser(managerAContext, names.studentA, `A 校学生 ${suffix}`, "学生", hasTouch);
        const schoolClass = await createClassWithMembersInBrowser(managerAContext, `影视一班 ${suffix}`, teacher, student, hasTouch);
        await createSchoolMemberInBrowser(managerBContext, names.studentB, `B 校学生 ${suffix}`, "学生", hasTouch);

        await createPublishAndAssignCourseInBrowser(page.context(), names.course, schoolA.name);
        const { assignment: courseAssignment, offering } = await createCourseOfferingInBrowser(managerAContext, names.course, schoolClass.name, teacher.displayName, hasTouch);

        const teacherContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.teacherA, password: PASSWORD }, contextOptions);
        const studentContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.studentA, password: PASSWORD }, contextOptions);
        const studentBContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: names.studentB, password: PASSWORD }, contextOptions);
        contexts.push(teacherContext, studentContext, studentBContext);

        const studentCanvasTitle = `学生短片画布 ${suffix}`;
        await createCanvas(studentContext.request, studentCanvasTitle);
        const teachingAssignment = await createAndPublishAssignmentInBrowser(teacherContext, names.assignment, offering.id, `${names.course} · 影视一班 ${suffix}`, hasTouch);
        const teachingSubmission = await submitAssignmentInBrowser(studentContext, names.assignment, studentCanvasTitle, "学生提交真实画布", hasTouch);
        await reviewAssignmentInBrowser(teacherContext, names.assignment, `A 校学生 ${suffix}`, "结构完整，批改通过", hasTouch);
        const reviewedAssignment = await findTeachingAssignment(teacherContext.request, names.assignment);
        expect(reviewedAssignment?.status).toBe("published");

        const order = await createAndAssignCommercialOrderInBrowser(page.context(), names.order, schoolA.name);
        const configured = await configureSchoolCommercialOrderInBrowser(managerAContext, names.order, `A 校老师 ${suffix}`, `影视一班 ${suffix}`, `A 校学生 ${suffix}`, hasTouch);
        expect(JSON.stringify(configured)).not.toContain("internalAmountCents");
        const participantCandidates = await apiData<{ items: Array<{ membershipId: string }>; selectedMembershipIds: string[] }>(
            await teacherContext.request.get(`/api/teaching/commercial-orders/${order.id}/participants?page=1&pageSize=12&keyword=${encodeURIComponent(names.studentA)}`),
        );
        expect(participantCandidates.items).toContainEqual(expect.objectContaining({ membershipId: student.id }));
        expect(participantCandidates.selectedMembershipIds).toEqual([student.id]);
        await arrangeParticipantsInBrowser(teacherContext, names.order, `A 校学生 ${suffix}`, hasTouch);
        const started = await startCommercialOrderInBrowser(managerAContext, names.order, hasTouch);
        expect(JSON.stringify(started)).not.toContain("internalAmountCents");
        const teacherOrders = await apiData<PageResult<SchoolCommercialOrder>>(await teacherContext.request.get("/api/teaching/commercial-orders?page=1&pageSize=20"));
        const studentOrders = await apiData<PageResult<SchoolCommercialOrder>>(await studentContext.request.get("/api/teaching/commercial-orders?page=1&pageSize=20"));
        expect(JSON.stringify([teacherOrders, studentOrders])).not.toContain("internalAmountCents");

        const candidate = await submitCommercialCandidateInBrowser(studentContext, names.order, studentCanvasTitle, "学生候选成片", hasTouch);
        expect(candidate.status).toBe("submitted");
        const teacherCanvasTitle = `学校正式交付画布 ${suffix}`;
        await createCanvas(teacherContext.request, teacherCanvasTitle);
        const firstDelivery = await submitCommercialDeliveryInBrowser(teacherContext, names.order, teacherCanvasTitle, "学校首轮正式交付", hasTouch);
        expect(firstDelivery.status).toBe("submitted");
        await reviewCommercialOrderInBrowser(page.context(), names.order, "revision_required", "请补充品牌落版");
        const secondDelivery = await submitCommercialDeliveryInBrowser(teacherContext, names.order, teacherCanvasTitle, "已补充品牌落版", hasTouch);
        expect(secondDelivery.id).not.toBe(firstDelivery.id);
        const accepted = await reviewCommercialOrderInBrowser(page.context(), names.order, "accepted", "验收通过");
        expect(accepted.status).toBe("accepted");

        await expectTenantNotFound(managerBContext.request, [
            `/api/school/classes/${schoolClass.id}`,
            `/api/school/courses/${courseAssignment.id}/offerings`,
            `/api/school/commercial-orders/${order.id}`,
            `/api/teaching/assignments/${teachingAssignment.id}`,
            `/api/teaching/commercial-orders/${order.id}/submissions`,
        ]);
        const studentBCanvasId = await createCanvas(studentBContext.request, `B 校隔离画布 ${suffix}`);
        await expectApiStatus(managerBContext.request.patch(`/api/school/classes/${schoolClass.id}`, { data: { name: "越权修改" } }), 404);
        await expectApiStatus(managerBContext.request.delete(`/api/school/classes/${schoolClass.id}`), 404);
        await expectApiStatus(managerBContext.request.patch(`/api/school/members/${teacher.id}`, { data: { status: "disabled" } }), 404);
        await expectApiStatus(managerBContext.request.delete(`/api/school/members/${student.id}`), 404);
        await expectApiStatus(managerBContext.request.post(`/api/school/courses/${courseAssignment.id}/offerings`, { data: { classId: schoolClass.id, teacherMembershipId: teacher.id, supplementalResources: [], status: "active" } }), 404);
        await expectApiStatus(managerBContext.request.patch(`/api/teaching/assignments/${teachingAssignment.id}`, { data: { title: "越权修改作业" } }), 404);
        await expectApiStatus(managerBContext.request.get(`/api/teaching/assignments/${teachingAssignment.id}/submissions?page=1&pageSize=12`), 404);
        await expectApiStatus(managerBContext.request.post(`/api/teaching/submissions/${teachingSubmission.id}/review`, { data: { status: "reviewed", feedback: "越权批改" } }), 404);
        await expectApiStatus(managerBContext.request.post("/api/teaching/assignments", { data: { offeringId: offering.id, kind: "homework", title: "越权创建作业", status: "draft" } }), 404);
        await expectApiStatus(studentBContext.request.post(`/api/teaching/assignments/${teachingAssignment.id}/submissions`, { data: { note: "跨校提交", references: [{ type: "canvas", id: studentBCanvasId }] } }), 404);
        await expectApiStatus(managerBContext.request.patch(`/api/school/commercial-orders/${order.id}`, { data: { action: "start" } }), 404);
        await expectApiStatus(managerBContext.request.get(`/api/teaching/commercial-orders/${order.id}/participants?page=1&pageSize=12`), 404);
        await expectApiStatus(managerBContext.request.post(`/api/teaching/commercial-orders/${order.id}/submissions`, { data: { action: "participants", participantMembershipIds: [student.id] } }), 404);
        await expectApiStatus(managerBContext.request.post(`/api/teaching/commercial-orders/${order.id}/submissions`, { data: { action: "delivery", references: [{ type: "canvas", id: studentBCanvasId }] } }), 404);
        await expectApiStatus(studentContext.request.post(`/api/teaching/assignments/${teachingAssignment.id}/submissions`, { data: { note: "引用他人成果", references: [{ type: "canvas", id: studentBCanvasId }] } }), 404);
        const schoolBOrders = await apiData<PageResult<SchoolCommercialOrder>>(await managerBContext.request.get("/api/school/commercial-orders?page=1&pageSize=20"));
        expect(schoolBOrders.items).toEqual([]);
        expect(schoolBOrders.total).toBe(0);
        expect(schoolB.id).not.toBe(schoolA.id);

        await verifyRolePages(page.context(), managerAContext, teacherContext, studentContext, names.order, hasTouch);
        await verifyExistingUserCapabilities(teacherContext, "teacher");
        await verifyExistingUserCapabilities(studentContext, "student");
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

async function createSchoolInBrowser(context: BrowserContext, schoolName: string, username: string, displayName: string, city: string) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/admin?section=schools", { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        await page.getByRole("button", { name: "新建学校", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "新建学校", exact: true });
        await expect(modal).toBeVisible();
        await expectAnimationsFinished(modal);
        await fillField(modal.getByLabel("学校名称"), schoolName);
        await fillField(modal.getByLabel("所在城市"), city);
        await fillField(modal.getByLabel("管理员用户名"), username);
        await fillField(modal.getByLabel("管理员姓名"), displayName);
        await fillField(modal.getByLabel("初始密码"), PASSWORD);
        await expectElementWithinViewport(page, modal, "school editor");
        await modal.getByRole("button", { name: "创建学校", exact: true }).click();
        await expect(modal).toBeHidden();
        await expect(businessRow(page, schoolName)).toBeVisible();
        const result = await apiData<PageResult<SchoolDetail>>(await context.request.get(`/api/admin/schools?page=1&pageSize=20&keyword=${encodeURIComponent(schoolName)}`));
        const school = result.items.find((item) => item.name === schoolName);
        expect(school).toBeTruthy();
        expect(await errors.values(), `create ${schoolName} browser errors`).toEqual([]);
        await expectNoHorizontalOverflow(page, `create ${schoolName}`);
        await expectVisibleControlsWithinViewport(page, `create ${schoolName}`);
        return school as SchoolDetail;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createSchoolMemberInBrowser(context: BrowserContext, username: string, displayName: string, roleLabel: "老师" | "学生", hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await selectTab(page, "成员管理", hasTouch);
        await page.getByRole("button", { name: "创建成员", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "创建成员", exact: true });
        await expect(modal).toBeVisible();
        await expectAnimationsFinished(modal);
        await fillField(modal.getByLabel("用户名"), username);
        await fillField(modal.getByLabel("显示姓名"), displayName);
        await fillField(modal.getByLabel("初始密码"), PASSWORD);
        await modal.getByLabel("身份").click();
        await selectVisibleOption(page, roleLabel);
        await expectElementWithinViewport(page, modal, "school member editor");
        await modal.getByRole("button", { name: /创\s*建/ }).click();
        await expect(modal).toBeHidden();
        await expect(page.getByText(displayName, { exact: true }).filter({ visible: true }).first()).toBeVisible();
        const result = await apiData<PageResult<SchoolMember>>(await context.request.get(`/api/school/members?page=1&pageSize=20&keyword=${encodeURIComponent(username)}`));
        const member = result.items.find((item) => item.username === username);
        expect(member).toBeTruthy();
        expect(await errors.values(), `create ${roleLabel} browser errors`).toEqual([]);
        return member as SchoolMember;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createClassWithMembersInBrowser(context: BrowserContext, className: string, teacher: SchoolMember, student: SchoolMember, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await selectTab(page, "班级管理", hasTouch);
        await page.getByRole("button", { name: "创建班级", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "创建班级", exact: true });
        await expect(modal).toBeVisible();
        await expectAnimationsFinished(modal);
        await fillField(modal.getByLabel("班级名称"), className);
        await fillField(modal.getByLabel("班级说明"), "双租户浏览器验收班级");
        await modal.getByRole("button", { name: /创\s*建/ }).click();
        await expect(modal).toBeHidden();
        const row = businessRow(page, className);
        await expect(row).toBeVisible();
        await row.getByRole("button", { name: "编辑", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: "编辑班级", exact: true });
        await expect(drawer).toBeVisible();
        await expectAnimationsFinished(drawer);
        const teacherSelect = drawer.getByLabel("负责老师");
        await teacherSelect.fill(teacher.displayName);
        await selectComboboxOption(page, teacherSelect, new RegExp(teacher.displayName));
        await teacherSelect.press("Escape");
        await expect(teacherSelect).toHaveAttribute("aria-expanded", "false");
        const studentSelect = drawer.getByLabel("班级学生");
        await studentSelect.fill(student.displayName);
        await selectComboboxOption(page, studentSelect, new RegExp(student.displayName));
        await studentSelect.press("Escape");
        await drawer.getByRole("button", { name: /保\s*存/ }).click();
        await expect(drawer).toBeHidden();
        const classes = await apiData<PageResult<SchoolClass>>(await context.request.get(`/api/school/classes?page=1&pageSize=20&keyword=${encodeURIComponent(className)}`));
        const schoolClass = classes.items.find((item) => item.name === className);
        expect(schoolClass).toBeTruthy();
        const detail = await apiData<SchoolClassDetail>(await context.request.get(`/api/school/classes/${schoolClass!.id}`));
        expect(detail.teachers.map((item) => item.id)).toContain(teacher.id);
        expect(detail.students.map((item) => item.id)).toContain(student.id);
        expect(await errors.values(), "class creation browser errors").toEqual([]);
        await expectNoHorizontalOverflow(page, "class creation");
        return schoolClass as SchoolClass;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createPublishAndAssignCourseInBrowser(context: BrowserContext, title: string, schoolName: string) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/admin?section=courses", { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        await page.getByRole("button", { name: "创建课程", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: "创建课程", exact: true });
        await expect(drawer).toBeVisible();
        await expectAnimationsFinished(drawer);
        await fillField(drawer.getByLabel("课程标题"), title);
        await fillField(drawer.getByLabel("课程摘要"), "从需求到交付的真实课程闭环");
        await fillField(drawer.getByLabel("平台课程正文"), "完成品牌短片策划、制作与复盘。");
        await drawer.getByRole("button", { name: "添加", exact: true }).first().click();
        await fillField(drawer.getByPlaceholder("章节或课时名称"), "需求拆解");
        await expectElementWithinViewport(page, drawer, "course editor");
        await drawer.getByRole("button", { name: /保\s*存/ }).click();
        await expect(drawer).toBeHidden();
        const row = businessRow(page, title);
        await expect(row).toBeVisible();
        await row.getByRole("button", { name: "发布", exact: true }).click();
        const publish = page.getByRole("dialog", { name: `发布“${title}”`, exact: true });
        await publish.getByRole("button", { name: "确认发布", exact: true }).click();
        await expect(row.getByText("已发布", { exact: true })).toBeVisible();
        await row.getByRole("button", { name: "分配学校", exact: true }).click();
        const assign = page.getByRole("dialog", { name: new RegExp(`^分配学校.*${title}`) });
        await expect(assign).toBeVisible();
        await expectAnimationsFinished(assign);
        const schoolSelect = assign.getByRole("combobox");
        await schoolSelect.fill(schoolName);
        await selectComboboxOption(page, schoolSelect, schoolName);
        await schoolSelect.press("Escape");
        await assign.getByRole("button", { name: "确认分配", exact: true }).click();
        await expect(assign).toBeHidden();
        const courses = await apiData<PageResult<PlatformCourse>>(await context.request.get(`/api/admin/courses?page=1&pageSize=20&keyword=${encodeURIComponent(title)}`));
        const course = courses.items.find((item) => item.title === title);
        expect(course?.status).toBe("published");
        expect(await errors.values(), "course creation browser errors").toEqual([]);
        await expectNoHorizontalOverflow(page, "course creation");
        return course as PlatformCourse;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createCourseOfferingInBrowser(context: BrowserContext, courseTitle: string, className: string, teacherName: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await selectTab(page, "课程安排", hasTouch);
        const row = businessRow(page, courseTitle);
        await expect(row).toBeVisible();
        await row.getByRole("button", { name: "创建教学安排", exact: true }).click();
        const modal = page.getByRole("dialog", { name: new RegExp(`^创建教学安排.*${courseTitle}`) });
        await expect(modal).toBeVisible();
        await expectAnimationsFinished(modal);
        const selects = modal.getByRole("combobox");
        await selects.nth(0).fill(className);
        await selectComboboxOption(page, selects.nth(0), className);
        await selects.nth(1).fill(teacherName);
        await selectComboboxOption(page, selects.nth(1), new RegExp(teacherName));
        await expectElementWithinViewport(page, modal, "course offering editor");
        await modal.getByRole("button", { name: /创\s*建/ }).click();
        await expect(modal).toBeHidden();
        const assignments = await apiData<PageResult<SchoolCourseAssignment>>(await context.request.get("/api/school/courses?page=1&pageSize=20"));
        const assignment = assignments.items.find((item) => item.course.title === courseTitle);
        expect(assignment).toBeTruthy();
        const offerings = await apiData<PageResult<SchoolCourseOffering>>(await context.request.get(`/api/school/courses/${assignment!.id}/offerings?page=1&pageSize=20`));
        const offering = offerings.items.find((item) => item.className === className && item.teacher.displayName === teacherName);
        expect(offering).toBeTruthy();
        expect(await errors.values(), "course offering creation browser errors").toEqual([]);
        await expectNoHorizontalOverflow(page, "course offering creation");
        return { assignment: assignment as SchoolCourseAssignment, offering: offering as SchoolCourseOffering };
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createAndPublishAssignmentInBrowser(context: BrowserContext, title: string, offeringId: string, offeringLabel: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/teaching", { waitUntil: "domcontentloaded" });
        await selectTab(page, "作业", hasTouch);
        await page.getByRole("button", { name: "创建作业", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "创建作业", exact: true });
        await expect(modal).toBeVisible();
        await expect(modal.getByText(offeringLabel, { exact: true })).toBeVisible();
        await expect(modal.getByText("课后作业", { exact: true })).toBeVisible();
        await fillField(modal.getByLabel("标题"), title);
        await fillField(modal.getByLabel("要求"), "提交一个真实 Canvas 成果");
        await modal.getByRole("button", { name: "保存草稿", exact: true }).click();
        await expect(modal).toBeHidden();
        const row = businessRow(page, title);
        await expect(row).toBeVisible();
        await row.getByRole("button", { name: "发布", exact: true }).click();
        await expect(row.getByText("进行中", { exact: true })).toBeVisible();
        const assignment = await findTeachingAssignment(context.request, title);
        expect(assignment?.offeringId).toBe(offeringId);
        expect(assignment?.status).toBe("published");
        expect(await errors.values(), "teacher assignment creation browser errors").toEqual([]);
        return assignment as TeachingAssignment;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function createAndAssignCommercialOrderInBrowser(context: BrowserContext, title: string, schoolName: string) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/admin?section=commercialOrders", { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        await page.getByRole("button", { name: "创建商单", exact: true }).click();
        const editor = page.getByRole("dialog", { name: "创建商单", exact: true });
        await fillField(editor.getByLabel("商单标题"), title);
        await fillField(editor.getByLabel("需求说明"), "完成 30 秒品牌短片");
        await fillField(editor.getByLabel("验收标准"), "画面、声音和品牌信息完整");
        await fillField(editor.getByLabel("内部金额（元）"), "8800");
        await fillField(editor.getByLabel("截止时间"), "2026-09-30T18:00");
        await editor.getByRole("button", { name: /保\s*存/ }).click();
        await expect(editor).toBeHidden();
        const row = businessRow(page, title);
        await expect(row.getByText("草稿", { exact: true })).toBeVisible();
        await row.getByRole("button", { name: "分配学校", exact: true }).click();
        const assignModal = page.getByRole("dialog", { name: /^分配学校/ });
        await assignModal.getByRole("combobox").click();
        await selectVisibleOption(page, schoolName);
        await assignModal.getByRole("button", { name: "确认分配", exact: true }).click();
        await expect(assignModal).toBeHidden();
        await expect(row.getByText(/已分配(?:学校)?/)).toBeVisible();
        const order = await findPlatformCommercialOrder(context.request, title);
        expect(order?.status).toBe("assigned");
        expect(order?.assignedSchoolId).toBeTruthy();
        expect(await errors.values(), "platform commercial creation browser errors").toEqual([]);
        return order as AdminCommercialOrder;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function configureSchoolCommercialOrderInBrowser(context: BrowserContext, orderTitle: string, teacherDisplayName: string, className: string, studentDisplayName: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await selectTab(page, "商单", hasTouch);
        const row = businessRow(page, orderTitle);
        await row.getByRole("button", { name: "配置团队", exact: true }).click();
        const modal = page.getByRole("dialog", { name: /^配置制作团队/ });
        const selects = modal.getByRole("combobox");
        await selects.nth(0).click();
        await selectVisibleOption(page, new RegExp(teacherDisplayName));
        await selects.nth(1).click();
        await selectVisibleOption(page, className);
        await selects.nth(2).click();
        await selectVisibleOption(page, new RegExp(studentDisplayName));
        await selects.nth(2).press("Escape");
        await expect(page.locator(".ant-select-dropdown").filter({ visible: true })).toHaveCount(0);
        await modal.getByRole("button", { name: /保\s*存/ }).click();
        await expect(modal).toBeHidden();
        await expect(row.getByText(new RegExp(teacherDisplayName))).toBeVisible();
        const order = await findSchoolCommercialOrder(context.request, orderTitle);
        expect(order?.status).toBe("assigned");
        expect(order?.teacher?.displayName).toBe(teacherDisplayName);
        expect(await errors.values(), "school commercial configuration browser errors").toEqual([]);
        return order as SchoolCommercialOrder;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function submitAssignmentInBrowser(context: BrowserContext, title: string, canvasTitle: string, note: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/learning", { waitUntil: "domcontentloaded" });
        await selectTab(page, /^待交作业/, hasTouch);
        const row = businessRow(page, title);
        await expect(row.getByRole("button", { name: "提交作业", exact: true })).toBeVisible();
        await row.getByRole("button", { name: "提交作业", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: title, exact: true });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText(canvasTitle, { exact: true })).toBeVisible();
        await drawer.getByText(canvasTitle, { exact: true }).locator("xpath=ancestor::label[1]").getByRole("checkbox").check();
        await fillField(drawer.getByLabel("提交说明"), note);
        await drawer.getByRole("button", { name: "提交", exact: true }).click();
        await expect(drawer).toBeHidden();
        const assignment = await findTeachingAssignment(context.request, title);
        expect(assignment).toBeTruthy();
        const submissions = await apiData<PageResult<TeachingSubmission>>(await context.request.get(`/api/teaching/assignments/${assignment!.id}/submissions?page=1&pageSize=20`));
        const submission = submissions.items[0];
        expect(submission?.status).toBe("submitted");
        expect(await errors.values(), "student assignment submission browser errors").toEqual([]);
        return submission;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function reviewAssignmentInBrowser(context: BrowserContext, title: string, studentDisplayName: string, feedback: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/teaching", { waitUntil: "domcontentloaded" });
        await selectTab(page, "作业", hasTouch);
        const row = businessRow(page, title);
        await row.getByRole("button", { name: "学生提交", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: "学生提交", exact: true });
        await expect(drawer).toBeVisible();
        await drawer.getByRole("button", { name: "批改通过", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "批改通过", exact: true });
        await expect(modal).toBeVisible();
        await fillField(modal.getByLabel("反馈"), feedback);
        const confirmButton = modal.getByRole("button", { name: /确\s*认/ });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();
        await expect(modal).toBeHidden();
        await expect(drawer.getByText(feedback, { exact: true })).toBeVisible();
        const assignment = await findTeachingAssignment(context.request, title);
        expect(assignment).toBeTruthy();
        const submissions = await apiData<PageResult<TeachingSubmission>>(await context.request.get(`/api/teaching/assignments/${assignment!.id}/submissions?page=1&pageSize=20`));
        expect(submissions.items[0]?.status).toBe("reviewed");
        expect(await errors.values(), "teacher review browser errors").toEqual([]);
    } finally {
        errors.stop();
        await page.close();
    }
}

async function arrangeParticipantsInBrowser(context: BrowserContext, orderTitle: string, studentDisplayName: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/teaching", { waitUntil: "domcontentloaded" });
        await selectTab(page, "商单任务", hasTouch);
        const row = businessRow(page, orderTitle);
        await row.getByRole("button", { name: "查看任务", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: orderTitle, exact: true });
        await drawer.getByRole("button", { name: "安排参与学生", exact: true }).click();
        const modal = page.getByRole("dialog", { name: "安排参与学生", exact: true });
        await expect(modal.getByRole("combobox")).toBeVisible();
        await expect(modal.getByText(new RegExp(studentDisplayName))).toBeVisible();
        await modal.getByRole("button", { name: "保存安排", exact: true }).click();
        await expect(modal).toBeHidden();
        const order = await findTeachingCommercialOrder(context.request, orderTitle);
        expect(order).toBeTruthy();
        const details = await apiData<{ participants: PageResult<CommercialOrderParticipantSubmission>; deliveries: PageResult<CommercialOrderDelivery> }>(
            await context.request.get(`/api/teaching/commercial-orders/${order!.id}/submissions?page=1&pageSize=20`),
        );
        expect(details.participants.items.some((item) => item.participant.displayName === studentDisplayName)).toBe(true);
        expect(await errors.values(), "teacher participant arrangement browser errors").toEqual([]);
    } finally {
        errors.stop();
        await page.close();
    }
}

async function startCommercialOrderInBrowser(context: BrowserContext, orderTitle: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/school", { waitUntil: "domcontentloaded" });
        await selectTab(page, "商单", hasTouch);
        const row = businessRow(page, orderTitle);
        await row.getByRole("button", { name: "开始制作", exact: true }).click();
        await expect(row.getByText("制作中", { exact: true })).toBeVisible();
        const order = await findSchoolCommercialOrder(context.request, orderTitle);
        expect(order?.status).toBe("in_progress");
        expect(await errors.values(), "school order start browser errors").toEqual([]);
        return order as SchoolCommercialOrder;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function submitCommercialCandidateInBrowser(context: BrowserContext, orderTitle: string, canvasTitle: string, note: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/learning", { waitUntil: "domcontentloaded" });
        await selectTab(page, "商单实训", hasTouch);
        const row = businessRow(page, orderTitle);
        await row.getByRole("button", { name: "查看详情", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: orderTitle, exact: true });
        await expect(drawer.getByText(canvasTitle, { exact: true })).toBeVisible();
        await drawer.getByText(canvasTitle, { exact: true }).locator("xpath=ancestor::label[1]").getByRole("checkbox").check();
        await fillField(drawer.getByLabel("候选成果说明"), note);
        await drawer.getByRole("button", { name: "提交候选成果", exact: true }).click();
        await expect(drawer.getByText("已提交", { exact: true })).toBeVisible();
        const order = await findTeachingCommercialOrder(context.request, orderTitle);
        expect(order).toBeTruthy();
        const details = await apiData<{ participants: PageResult<CommercialOrderParticipantSubmission>; deliveries: PageResult<CommercialOrderDelivery> }>(
            await context.request.get(`/api/teaching/commercial-orders/${order!.id}/submissions?page=1&pageSize=20`),
        );
        const submission = details.participants.items[0];
        expect(submission?.status).toBe("submitted");
        expect(await errors.values(), "student commercial candidate browser errors").toEqual([]);
        return submission as CommercialOrderParticipantSubmission;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function submitCommercialDeliveryInBrowser(context: BrowserContext, orderTitle: string, canvasTitle: string, note: string, hasTouch: boolean) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/teaching", { waitUntil: "domcontentloaded" });
        await selectTab(page, "商单任务", hasTouch);
        const row = businessRow(page, orderTitle);
        const order = await findTeachingCommercialOrder(context.request, orderTitle);
        const action = order?.status === "revision_required" ? "重新正式交付" : "正式交付";
        await row.getByRole("button", { name: "查看任务", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: orderTitle, exact: true });
        await expect(drawer).toBeVisible();
        await drawer.getByRole("button", { name: action, exact: true }).click();
        const modal = page.getByRole("dialog", { name: action, exact: true });
        await expect(modal.getByText(canvasTitle, { exact: true })).toBeVisible();
        await modal.getByText(canvasTitle, { exact: true }).locator("xpath=ancestor::label[1]").getByRole("checkbox").check();
        await fillField(modal.getByLabel("交付说明"), note);
        await modal.getByRole("button", { name: "提交交付", exact: true }).click();
        await expect(modal).toBeHidden();
        const updated = await findTeachingCommercialOrder(context.request, orderTitle);
        expect(updated?.status).toBe("submitted");
        const details = await apiData<{ participants: PageResult<CommercialOrderParticipantSubmission>; deliveries: PageResult<CommercialOrderDelivery> }>(
            await context.request.get(`/api/teaching/commercial-orders/${updated!.id}/submissions?page=1&pageSize=20`),
        );
        const delivery = details.deliveries.items[0];
        expect(delivery?.note).toBe(note);
        expect(await errors.values(), "teacher delivery browser errors").toEqual([]);
        return delivery as CommercialOrderDelivery;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function reviewCommercialOrderInBrowser(context: BrowserContext, orderTitle: string, decision: "revision_required" | "accepted", feedback: string) {
    const page = await context.newPage();
    const errors = watchPageErrors(page);
    try {
        await page.goto("/admin?section=commercialOrders", { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        const row = businessRow(page, orderTitle);
        await row.getByRole("button", { name: "查看", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: orderTitle, exact: true });
        const action = decision === "accepted" ? "验收通过" : "退回修改";
        await drawer.getByRole("button", { name: action, exact: true }).click();
        const modal = page.getByRole("dialog", { name: action, exact: true });
        await fillField(modal.getByLabel("平台反馈"), feedback);
        await modal.getByRole("button", { name: /确\s*认/ }).click();
        await expect(modal).toBeHidden();
        const order = await findPlatformCommercialOrder(context.request, orderTitle);
        expect(order?.status).toBe(decision === "accepted" ? "accepted" : "revision_required");
        expect(await errors.values(), "platform commercial review browser errors").toEqual([]);
        return order as AdminCommercialOrder;
    } finally {
        errors.stop();
        await page.close();
    }
}

async function findTeachingAssignment(request: APIRequestContext, title: string) {
    const result = await apiData<PageResult<TeachingAssignment>>(await request.get("/api/teaching/assignments?page=1&pageSize=20"));
    return result.items.find((item) => item.title === title);
}

async function findTeachingCommercialOrder(request: APIRequestContext, title: string) {
    const result = await apiData<PageResult<SchoolCommercialOrder>>(await request.get("/api/teaching/commercial-orders?page=1&pageSize=20"));
    return result.items.find((item) => item.title === title);
}

async function findSchoolCommercialOrder(request: APIRequestContext, title: string) {
    const result = await apiData<PageResult<SchoolCommercialOrder>>(await request.get("/api/school/commercial-orders?page=1&pageSize=20"));
    return result.items.find((item) => item.title === title);
}

async function findPlatformCommercialOrder(request: APIRequestContext, title: string) {
    const result = await apiData<PageResult<AdminCommercialOrder>>(await request.get("/api/admin/commercial-orders?page=1&pageSize=20"));
    return result.items.find((item) => item.title === title);
}

function businessRow(page: Page, title: string) {
    return page
        .getByText(title, { exact: true })
        .filter({ visible: true })
        .first()
        .locator("xpath=ancestor::*[self::tr or self::article or (self::div and (contains(concat(' ', normalize-space(@class), ' '), ' py-3 ') or contains(concat(' ', normalize-space(@class), ' '), ' p-3 ')))][1]");
}

async function fillField(field: Locator, value: string) {
    await expect
        .poll(async () => {
            if ((await field.inputValue()) !== value) await field.fill(value);
            return field.inputValue();
        })
        .toBe(value);
}

async function expectAnimationsFinished(surface: Locator) {
    await expect.poll(() => surface.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => node.getAnimations().every((animation) => animation.playState === "finished" || animation.playState === "idle")))).toBe(true);
}

async function selectVisibleOption(page: Page, name: string | RegExp) {
    const dropdown = page.locator(".ant-select-dropdown").filter({ visible: true }).last();
    const option = dropdown.locator(".ant-select-item-option").filter({ hasText: name });
    await expect(option).toHaveCount(1);
    await option.click();
}

async function selectComboboxOption(page: Page, combobox: Locator, name: string | RegExp) {
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    const popupId = await combobox.getAttribute("aria-controls");
    expect(popupId).toBeTruthy();
    const list = page.locator(`#${popupId}`);
    const dropdown = page.locator(".ant-select-dropdown").filter({ has: list });
    const option = dropdown.locator(".ant-select-item-option").filter({ hasText: name });
    await expect(option).toHaveCount(1);
    await expect(option).toHaveClass(/ant-select-item-option-active/);
    await combobox.press("Enter");
}

async function verifyRolePages(adminContext: BrowserContext, managerContext: BrowserContext, teacherContext: BrowserContext, studentContext: BrowserContext, orderTitle: string, hasTouch: boolean) {
    for (const theme of ["light", "dark"] as const) {
        const [adminPage, managerPage, teacherPage, studentPage] = await Promise.all([adminContext.newPage(), managerContext.newPage(), teacherContext.newPage(), studentContext.newPage()]);
        const pages = [adminPage, managerPage, teacherPage, studentPage];
        try {
            await Promise.all(pages.map((page) => page.addInitScript((nextTheme) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: nextTheme }, version: 0 })), theme)));
            await openAndCheck(adminPage, "/admin?section=commercialOrders", orderTitle, "platform", hasTouch);
            await openAndCheck(managerPage, "/school", orderTitle, "school", hasTouch);
            await openAndCheck(teacherPage, "/teaching", orderTitle, "teacher", hasTouch);
            await openAndCheck(studentPage, "/learning", orderTitle, "student", hasTouch);
        } finally {
            await Promise.all(pages.map((page) => page.close()));
        }
    }
}

async function openAndCheck(page: Page, path: string, orderTitle: string, role: "platform" | "school" | "teacher" | "student", hasTouch: boolean) {
    const errors = watchPageErrors(page);
    try {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${role} ${path}`).toBeLessThan(400);
        if (role === "platform") await expect(page.locator("[data-hydrated='true']")).toBeVisible();
        if (role === "school") await selectTab(page, "商单", hasTouch);
        if (role === "teacher") await selectTab(page, "商单任务", hasTouch);
        if (role === "student") await selectTab(page, "商单实训", hasTouch);
        const title = page.getByText(orderTitle, { exact: true }).filter({ visible: true }).first();
        await expect(title).toBeVisible();
        const row = title.locator("xpath=ancestor::*[self::tr or self::article][1]");
        await expectElementWithinViewport(page, row, `${role} order row`);
        const actionName = role === "platform" ? "查看" : role === "school" ? "详情" : role === "student" ? "查看详情" : "查看任务";
        await row.getByRole("button", { name: actionName, exact: true }).click();
        const dialog = page.getByRole("dialog").filter({ visible: true }).last();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(orderTitle, { exact: true })).toBeVisible();
        if (role === "platform") {
            await expect(dialog.getByRole("button", { name: "退回修改", exact: true })).toHaveCount(0);
            await expect(dialog.getByRole("button", { name: "验收通过", exact: true })).toHaveCount(0);
            await expect(dialog.getByText("已验收", { exact: true })).toBeVisible();
            await expect(dialog.getByText("请补充品牌落版", { exact: true })).toBeVisible();
            await expect(dialog.getByText("学校首轮正式交付", { exact: true })).toBeVisible();
            await expect(dialog.getByText("已补充品牌落版", { exact: true })).toBeVisible();
        } else if (role === "school") {
            await expect(dialog.getByRole("button", { name: "配置团队", exact: true })).toHaveCount(0);
            await expect(dialog.getByRole("button", { name: "开始制作", exact: true })).toHaveCount(0);
            await expect(dialog.getByText("内部金额", { exact: true })).toHaveCount(0);
        } else if (role === "teacher") {
            await expect(dialog.getByRole("button", { name: /正式交付/ })).toHaveCount(0);
            await expect(dialog.getByRole("button", { name: "安排参与学生", exact: true })).toHaveCount(0);
        } else {
            await expect(dialog.getByRole("button", { name: "提交候选成果", exact: true })).toHaveCount(0);
            await expect(dialog.getByText("内部金额", { exact: true })).toHaveCount(0);
        }
        await expectElementWithinViewport(page, dialog, `${role} commercial order dialog`);
        await expectNoHorizontalOverflow(page, `${role} commercial order`);
        await expectVisibleControlsWithinViewport(page, `${role} commercial order`);
        expect(await errors.values(), `${role} ${path} browser errors`).toEqual([]);
    } finally {
        errors.stop();
    }
}

async function verifyExistingUserCapabilities(context: BrowserContext, role: string) {
    const page = await context.newPage();
    try {
        const routes = [
            { path: "/create", heading: /创作 Agent$/ },
            { path: "/canvas", heading: "我的画布" },
            { path: "/drama", heading: "短剧项目" },
            { path: "/assets", heading: "我的素材" },
            { path: "/works", heading: "作品管理" },
            { path: "/profile?section=billing", heading: /^(个人中心|套餐中心)$/ },
        ] as const;
        for (const route of routes) {
            const errors = watchPageErrors(page);
            const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
            try {
                expect(response?.status(), `${role} ${route.path}`).toBeLessThan(400);
                await expect(page).not.toHaveURL(/\/(?:login|install)(?:\?|$)/);
                await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
                await expect(page.locator("main").first()).toBeVisible();
                await expect(page.locator(".ant-spin-spinning").filter({ visible: true })).toHaveCount(0);
                await expectNoHorizontalOverflow(page, `${role} ${route.path}`);
                await expectVisibleControlsWithinViewport(page, `${role} ${route.path}`);
                expect(await errors.values(), `${role} ${route.path} browser errors`).toEqual([]);
            } finally {
                errors.stop();
            }
        }
    } finally {
        await page.close();
    }
}

function projectContextOptions(projectName: string): BrowserContextOptions {
    if (projectName === "mobile-390") return { ...devices["iPhone 13"] };
    if (projectName === "mobile-430") return { ...devices["iPhone 14 Pro Max"] };
    return { ...devices["Desktop Chrome"] };
}

function watchPageErrors(page: Page) {
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
                            // Keep the exact response evidence if the route transition disposed the original body.
                        }
                    }
                    apiFailures.push({ status: response.status(), path: url.pathname, body });
                }),
        );
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("response", onResponse);
    return {
        values: async () => {
            await Promise.all(apiFailureReads);
            const expected = apiFailures.filter(
                (failure) =>
                    !USES_POSTGRES &&
                    ((failure.status === 409 &&
                        ((failure.path === "/api/notifications/interactions" && failure.body.includes("需要启用 PostgreSQL")) ||
                            (failure.path === "/api/works" && failure.body.includes("作品发布需要启用 PostgreSQL 数据库")) ||
                            (failure.path === "/api/public/gallery" && failure.body.includes("作品广场需要启用 PostgreSQL 数据库")))) ||
                        (failure.status === 501 && failure.path === "/api/billing/products" && failure.body.includes("商业订单需要启用 PostgreSQL"))),
            );
            const unexpectedApiFailures = apiFailures.filter((failure) => !expected.includes(failure));
            const remainingExpectedResponses = [...expected];
            const unexpectedConsoleErrors = consoleErrors.filter((message) => {
                const index = remainingExpectedResponses.findIndex((failure) => message.includes(`status of ${failure.status}`));
                if (index < 0) return true;
                remainingExpectedResponses.splice(index, 1);
                return false;
            });
            return [...pageErrors, ...unexpectedConsoleErrors, ...unexpectedApiFailures.map((failure) => `${failure.status} ${failure.path}`)];
        },
        stop: () => {
            page.off("pageerror", onPageError);
            page.off("console", onConsole);
            page.off("response", onResponse);
        },
    };
}

async function expectElementWithinViewport(page: Page, locator: ReturnType<Page["locator"]>, label: string) {
    await expect
        .poll(
            async () => {
                const bounds = await locator.boundingBox();
                const viewport = page.viewportSize();
                return Boolean(bounds && viewport && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
            },
            { message: `${label} must stay within the viewport` },
        )
        .toBe(true);
}

async function selectTab(page: Page, name: string | RegExp, hasTouch: boolean) {
    const tab = page.getByRole("tab", { name, exact: typeof name === "string" });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("id", /^rc-tabs-/);
    const tabViewport = tab.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ant-tabs-nav-wrap ')][1]");
    const scroll = await Promise.all([tab.boundingBox(), tabViewport.boundingBox()]).then(([tabBounds, viewportBounds]) => {
        if (!tabBounds || !viewportBounds || (tabBounds.x >= viewportBounds.x && tabBounds.x + tabBounds.width <= viewportBounds.x + viewportBounds.width)) return null;
        return {
            x: viewportBounds.x + viewportBounds.width / 2,
            y: viewportBounds.y + viewportBounds.height / 2,
            deltaX: tabBounds.x + tabBounds.width / 2 - (viewportBounds.x + viewportBounds.width / 2),
        };
    });
    if (scroll) {
        await page.mouse.move(scroll.x, scroll.y);
        await page.mouse.wheel(scroll.deltaX, 0);
        await expect
            .poll(async () => {
                const [tabBounds, viewportBounds] = await Promise.all([tab.boundingBox(), tabViewport.boundingBox()]);
                return Boolean(tabBounds && viewportBounds && tabBounds.x >= viewportBounds.x - 1 && tabBounds.x + tabBounds.width <= viewportBounds.x + viewportBounds.width + 1);
            })
            .toBe(true);
    }
    if (hasTouch) await tab.tap();
    else await tab.click();
    await expect(tab, `${name} tab must become selected after hydration`).toHaveAttribute("aria-selected", "true");
}

async function createCanvas(request: APIRequestContext, title: string) {
    const data = await apiData<{ project: { id: string } }>(
        await request.post("/api/canvas/projects", {
            data: {
                title,
                project: {
                    viewport: { x: 0, y: 0, k: 1 },
                    nodes: [{ id: randomUUID(), type: "text", title: "交付说明", position: { x: 100, y: 100 }, width: 280, height: 180, metadata: { content: title } }],
                    connections: [],
                },
            },
        }),
    );
    return data.project.id;
}

async function expectTenantNotFound(request: APIRequestContext, paths: string[]) {
    for (const path of paths) {
        const response = await request.get(path);
        expect(response.status(), path).toBe(404);
    }
}

async function expectApiStatus(responsePromise: Promise<APIResponse>, expectedStatus: number) {
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(expectedStatus);
}

async function apiData<T = unknown>(response: APIResponse): Promise<T> {
    const body = await response.text();
    expect(response.ok(), body).toBe(true);
    const payload = JSON.parse(body) as { code?: number; data?: T; msg?: string };
    expect(payload.code, payload.msg || body).toBe(0);
    return payload.data as T;
}
