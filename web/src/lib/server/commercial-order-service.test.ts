import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "postgres",
    executor: { query: vi.fn() },
    withPostgres: vi.fn(),
    openSettlement: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    requireSchoolManager: vi.fn(),
    requireTeacher: vi.fn(),
    requireStudent: vi.fn(),
    requireActiveSchoolContext: vi.fn(),
    validateReferences: vi.fn(),
    repository: {
        insertCommercialOrder: vi.fn(),
        getPlatformCommercialOrder: vi.fn(),
        listPlatformCommercialOrders: vi.fn(),
        updateCommercialOrderDraft: vi.fn(),
        assignCommercialOrderToSchool: vi.fn(),
        getSchool: vi.fn(),
        getCommercialOrder: vi.fn(),
        listCommercialOrders: vi.fn(),
        listCommercialOrdersForTeacher: vi.fn(),
        listCommercialOrdersForParticipant: vi.fn(),
        listMembers: vi.fn(),
        configureCommercialOrder: vi.fn(),
        getMembership: vi.fn(),
        getClass: vi.fn(),
        isClassMember: vi.fn(),
        replaceCommercialOrderParticipants: vi.fn(),
        listCommercialOrderParticipants: vi.fn(),
        listCommercialOrderParticipantMembershipIds: vi.fn(),
        hasActiveCommercialOrderParticipant: vi.fn(),
        getCommercialOrderParticipant: vi.fn(),
        updateCommercialOrderParticipant: vi.fn(),
        insertCommercialOrderDelivery: vi.fn(),
        listCommercialOrderDeliveries: vi.fn(),
        getLatestCommercialOrderDelivery: vi.fn(),
        updateCommercialOrderDelivery: vi.fn(),
        compareAndSetCommercialOrderStatus: vi.fn(),
        compareAndSetPlatformCommercialOrderStatus: vi.fn(),
        transact: vi.fn(),
    },
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireSchoolManager,
    requireTeacher: mocks.requireTeacher,
    requireStudent: mocks.requireStudent,
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: mocks.validateReferences }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.repository }));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => mocks.provider, withPostgresTransaction: mocks.withPostgres }));
vi.mock("./school-compute-settlement-service", () => ({ openCommercialOrderSettlement: mocks.openSettlement, openCommercialOrderSettlementInsideTransaction: vi.fn() }));
vi.mock("./data-adapter", () => ({ readJsonDataFile: vi.fn(), writeJsonDataFile: vi.fn(), withJsonDataFileLocks: vi.fn() }));
vi.mock("@/lib/auth/store-foundation", () => ({ AUTH_DATA_FILE: "auth.json" }));
vi.mock("@/lib/auth/store-normalizers", () => ({ emptyDb: vi.fn(), normalizeDb: vi.fn() }));
vi.mock("@/lib/auth/store-repository", () => ({ writeAuthDb: vi.fn() }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: vi.fn() }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: vi.fn() }));

import {
    assignCommercialOrder,
    configureCommercialOrder,
    configureCommercialOrderParticipants,
    createCommercialOrder,
    updateCommercialOrder,
    getPlatformCommercialOrderDetails,
    listCommercialOrderSubmissions,
    listCommercialOrderParticipantCandidates,
    reviewCommercialOrder,
    startCommercialOrder,
    submitCommercialOrderDelivery,
    submitCommercialOrderWork,
} from "./commercial-order-service";

const now = "2026-08-17T00:00:00.000Z";

describe("commercial order service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
        mocks.withPostgres.mockImplementation(async (operation) => operation(mocks.executor));
        mocks.openSettlement.mockResolvedValue({ id: "settlement-a" });
        mocks.repository.transact.mockImplementation(async (operation) => operation(mocks.repository));
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) =>
            ids.map((id) => ({ id, role: id === "admin-a" ? "admin" : "user", status: "active", adminPermissions: id === "admin-a" ? ["education.manage"] : [], accountId: id, username: id, displayName: id })),
        );
        mocks.requireSchoolManager.mockResolvedValue(context("manager-a", "teacher", ["school.manage"]));
        mocks.requireTeacher.mockResolvedValue(context("teacher-a", "teacher"));
        mocks.requireStudent.mockResolvedValue(context("student-a", "student"));
        mocks.requireActiveSchoolContext.mockResolvedValue(context("teacher-a", "teacher"));
        mocks.validateReferences.mockResolvedValue([]);
    });

    it("validates internal amounts as nonnegative safe integers", async () => {
        mocks.repository.insertCommercialOrder.mockImplementation(async (record) => record);
        await expect(createCommercialOrder("admin-a", { title: "商单", internalAmountCents: -1 })).rejects.toMatchObject({ status: 400 });
        await expect(createCommercialOrder("admin-a", { title: "商单", internalAmountCents: Number.MAX_SAFE_INTEGER + 1 })).rejects.toMatchObject({ status: 400 });
        await expect(createCommercialOrder("admin-a", { title: "商单", internalAmountCents: 1250 })).resolves.toMatchObject({ internalAmountCents: 1250, status: "draft" });
    });

    it("accepts a date-only deadline and normalizes it to the business-day end", async () => {
        mocks.repository.insertCommercialOrder.mockImplementation(async (record) => record);

        await expect(createCommercialOrder("admin-a", { title: "日期商单", internalAmountCents: 100, deadlineAt: "2026-09-04" })).resolves.toMatchObject({ deadlineAt: "2026-09-04T15:59:59.999Z" });
    });

    it("rejects an invalid deadline with a Chinese field error", async () => {
        await expect(createCommercialOrder("admin-a", { title: "日期商单", internalAmountCents: 100, deadlineAt: "2026-99-99" })).rejects.toMatchObject({ status: 400, message: "截止日期格式无效，请重新选择日期" });
    });

    it("clears an existing deadline when the update explicitly sends an empty value", async () => {
        mocks.repository.updateCommercialOrderDraft.mockResolvedValue({ ...order("draft"), deadlineAt: undefined });
        await expect(updateCommercialOrder("admin-a", "order-a", { deadlineAt: "" })).resolves.toMatchObject({ id: "order-a" });
        expect(mocks.repository.updateCommercialOrderDraft).toHaveBeenCalledWith("order-a", expect.objectContaining({ deadlineAt: "" }));
    });

    it("returns platform order details with tenant-targeted formal delivery history", async () => {
        mocks.repository.getPlatformCommercialOrder.mockResolvedValue({ ...order("submitted"), assignedSchoolId: "school-a" });
        mocks.repository.listCommercialOrderDeliveries.mockResolvedValue({
            items: [
                {
                    id: "delivery-a",
                    schoolId: "school-a",
                    orderId: "order-a",
                    submittedByMembershipId: "teacher-a",
                    contentReferences: [{ type: "work", id: "work-a" }],
                    note: "终稿",
                    status: "submitted",
                    platformFeedback: "",
                    submittedAt: now,
                    createdAt: now,
                    updatedAt: now,
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", userId: "teacher-user", role: "teacher", status: "active" });
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "work", id: "work-a" }, title: "终稿", previewUrl: "https://cdn.test/final.mp4" }]);

        await expect(getPlatformCommercialOrderDetails("admin-a", "order-a", { page: 1, pageSize: 20 })).resolves.toMatchObject({
            order: { id: "order-a", internalAmountCents: 1250 },
            deliveries: {
                total: 1,
                items: [{ id: "delivery-a", contentReferences: [{ type: "work", id: "work-a" }], resolvedContentReferences: [{ title: "终稿", mediaType: "video", availability: "available", previewUrl: "https://cdn.test/final.mp4" }] }],
            },
        });
        expect(mocks.repository.listCommercialOrderDeliveries).toHaveBeenCalledWith("school-a", "order-a", { page: 1, pageSize: 20 });
    });

    it("assigns a draft once and blocks direct school switching after production starts", async () => {
        mocks.repository.getSchool.mockResolvedValue({ id: "school-a", status: "active" });
        mocks.repository.getPlatformCommercialOrder.mockResolvedValue(order("draft"));
        mocks.repository.assignCommercialOrderToSchool.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a" });
        await expect(assignCommercialOrder("admin-a", "order-a", "school-a")).resolves.toMatchObject({ assignedSchoolId: "school-a" });

        mocks.repository.getPlatformCommercialOrder.mockResolvedValue({ ...order("in_progress"), assignedSchoolId: "school-a" });
        await expect(assignCommercialOrder("admin-a", "order-a", "school-b")).rejects.toMatchObject({ status: 409 });
        expect(mocks.repository.assignCommercialOrderToSchool).toHaveBeenCalledTimes(1);
    });

    it("keeps an already assigned order unchanged when assigning the same school again", async () => {
        const assigned = { ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" };
        mocks.repository.getPlatformCommercialOrder.mockResolvedValue(assigned);
        mocks.repository.getSchool.mockResolvedValue({ id: "school-a", status: "active" });

        await expect(assignCommercialOrder("admin-a", "order-a", "school-a")).resolves.toMatchObject({ assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" });
        expect(mocks.repository.assignCommercialOrderToSchool).not.toHaveBeenCalled();
    });

    it("configures only active local participants and returns an amount-free school DTO", async () => {
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", internalAmountCents: 9999 });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, id: string) => ({ id, schoolId: "school-a", role: id === "teacher-a" ? "teacher" : "student", status: "active", userId: `${id}-user` }));
        mocks.repository.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "一班", status: "active" });
        mocks.repository.isClassMember.mockResolvedValue(true);
        mocks.repository.configureCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a", classId: "class-a", internalAmountCents: 9999 });

        const result = await configureCommercialOrder("manager-user", "order-a", { teacherMembershipId: "teacher-a", classId: "class-a", participantMembershipIds: ["student-a"] });
        expect(JSON.stringify(result)).not.toContain("internalAmountCents");
        expect(mocks.repository.replaceCommercialOrderParticipants).toHaveBeenCalledWith("school-a", "order-a", [expect.objectContaining({ membershipId: "student-a", status: "active" })]);

        mocks.repository.getMembership.mockResolvedValue({ id: "foreign", schoolId: "school-b", role: "student", status: "active" });
        await expect(configureCommercialOrder("manager-user", "order-a", { teacherMembershipId: "teacher-a", participantMembershipIds: ["foreign"] })).rejects.toMatchObject({ status: 404 });
    });

    it("lets the responsible teacher arrange active local students before production starts", async () => {
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a", classId: "class-a" });
        mocks.repository.getMembership.mockImplementation(async (_schoolId: string, id: string) => ({ id, schoolId: "school-a", role: id === "teacher-a" ? "teacher" : "student", status: "active", userId: `${id}-user` }));
        mocks.repository.isClassMember.mockResolvedValue(true);

        await expect(configureCommercialOrderParticipants("teacher-user", "order-a", ["student-a"])).resolves.toMatchObject({ total: 1, items: [{ membershipId: "student-a" }] });
        expect(mocks.repository.replaceCommercialOrderParticipants).toHaveBeenCalledWith("school-a", "order-a", [expect.objectContaining({ membershipId: "student-a", status: "active" })]);

        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("in_progress"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" });
        await expect(configureCommercialOrderParticipants("teacher-user", "order-a", ["student-a"])).rejects.toMatchObject({ status: 409 });
    });

    it("lists paged student candidates only for the responsible teacher and assigned class", async () => {
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a", classId: "class-a" });
        mocks.repository.listMembers.mockResolvedValue({
            items: [{ id: "student-a", schoolId: "school-a", userId: "student-user", role: "student", status: "active" }],
            total: 1,
            page: 2,
            pageSize: 8,
        });
        mocks.repository.listCommercialOrderParticipantMembershipIds.mockResolvedValue(["student-a"]);

        await expect(listCommercialOrderParticipantCandidates("teacher-user", "order-a", { page: 2, pageSize: 8, keyword: "0007" })).resolves.toMatchObject({
            total: 1,
            items: [{ membershipId: "student-a", participant: { accountId: "student-user" } }],
            selectedMembershipIds: ["student-a"],
        });
        expect(mocks.repository.listMembers).toHaveBeenCalledWith("school-a", { page: 2, pageSize: 8, keyword: "0007", role: "student", status: "active", classId: "class-a" });

        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-b" });
        await expect(listCommercialOrderParticipantCandidates("teacher-user", "order-a", {})).rejects.toMatchObject({ status: 404 });
    });

    it("starts only a configured order with participants using CAS", async () => {
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("assigned"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" });
        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "active" });
        mocks.repository.listCommercialOrderParticipants.mockResolvedValue({ items: [{ id: "participant-a" }], total: 1, page: 1, pageSize: 1 });
        mocks.repository.hasActiveCommercialOrderParticipant.mockResolvedValue(true);
        mocks.repository.compareAndSetCommercialOrderStatus.mockResolvedValue(true);
        await expect(startCommercialOrder("manager-user", "order-a")).resolves.toMatchObject({ status: "in_progress" });
        expect(mocks.repository.compareAndSetCommercialOrderStatus).toHaveBeenCalledWith("school-a", "order-a", "assigned", "in_progress", expect.any(String));

        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "disabled" });
        await expect(startCommercialOrder("manager-user", "order-a")).rejects.toMatchObject({ status: 409 });

        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "active" });
        mocks.repository.hasActiveCommercialOrderParticipant.mockResolvedValue(false);
        await expect(startCommercialOrder("manager-user", "order-a")).rejects.toMatchObject({ status: 409 });
    });

    it("lets a school manager inspect every local order submission without being the responsible teacher", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue(context("manager-a", "teacher", ["school.manage"]));
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("in_progress"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" });
        mocks.repository.listCommercialOrderParticipants.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.repository.listCommercialOrderDeliveries.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

        await expect(listCommercialOrderSubmissions("manager-user", "order-a")).resolves.toMatchObject({ order: { id: "order-a" }, participants: { total: 0 }, deliveries: { total: 0 } });
    });

    it("validates student references before the transaction and rechecks order state and participant", async () => {
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "asset", id: "asset-a" }, title: "候选" }]);
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("in_progress"), assignedSchoolId: "school-a" });
        mocks.repository.getMembership.mockResolvedValue({ id: "student-a", schoolId: "school-a", role: "student", status: "active", userId: "student-user" });
        mocks.repository.getCommercialOrderParticipant.mockResolvedValue({ id: "participant-a", schoolId: "school-a", orderId: "order-a", membershipId: "student-a", candidateReferences: [], note: "", status: "active", createdAt: now, updatedAt: now });
        mocks.repository.updateCommercialOrderParticipant.mockImplementation(async (_schoolId, _orderId, _membershipId, patch) => ({ id: "participant-a", schoolId: "school-a", orderId: "order-a", membershipId: "student-a", createdAt: now, ...patch }));

        await expect(submitCommercialOrderWork("student-user", "order-a", { references: [{ type: "asset", id: "asset-a", previewUrl: "secret" }] })).resolves.toMatchObject({ status: "submitted", candidateReferences: [{ type: "asset", id: "asset-a" }] });
        expect(mocks.validateReferences.mock.invocationCallOrder[0]).toBeLessThan(mocks.repository.transact.mock.invocationCallOrder[0]);

        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("accepted"), assignedSchoolId: "school-a" });
        await expect(submitCommercialOrderWork("student-user", "order-a", { references: [] })).rejects.toMatchObject({ status: 409 });
    });

    it("lets the responsible teacher submit and resubmit formal delivery atomically", async () => {
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "work", id: "work-a" }, title: "终稿" }]);
        mocks.repository.getMembership.mockResolvedValue({ id: "teacher-a", schoolId: "school-a", role: "teacher", status: "active", userId: "teacher-user" });
        mocks.repository.getCommercialOrder.mockResolvedValue({ ...order("revision_required"), assignedSchoolId: "school-a", teacherMembershipId: "teacher-a" });
        mocks.repository.insertCommercialOrderDelivery.mockImplementation(async (record) => record);
        mocks.repository.compareAndSetCommercialOrderStatus.mockResolvedValue(true);

        await expect(submitCommercialOrderDelivery("teacher-user", "order-a", { note: "修订终稿", references: [{ type: "work", id: "work-a" }] })).resolves.toMatchObject({ status: "submitted", contentReferences: [{ type: "work", id: "work-a" }] });
        expect(mocks.repository.compareAndSetCommercialOrderStatus).toHaveBeenCalledWith("school-a", "order-a", "revision_required", "submitted", expect.any(String));
    });

    it("reviews only the latest formal delivery and requires revision feedback", async () => {
        mocks.repository.getPlatformCommercialOrder.mockResolvedValue({ ...order("submitted"), assignedSchoolId: "school-a" });
        mocks.repository.getLatestCommercialOrderDelivery.mockResolvedValue({
            id: "delivery-latest",
            schoolId: "school-a",
            orderId: "order-a",
            submittedByMembershipId: "teacher-a",
            contentReferences: [],
            note: "",
            status: "submitted",
            platformFeedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        mocks.repository.updateCommercialOrderDelivery.mockImplementation(async (_id, patch) => ({ id: "delivery-latest", ...patch }));
        mocks.repository.compareAndSetPlatformCommercialOrderStatus.mockResolvedValue(true);

        await expect(reviewCommercialOrder("admin-a", "order-a", { decision: "revision_required" })).rejects.toMatchObject({ status: 400 });
        await expect(reviewCommercialOrder("admin-a", "order-a", { decision: "revision_required", feedback: "补充源文件" })).resolves.toMatchObject({ status: "revision_required", platformFeedback: "补充源文件" });
        expect(mocks.repository.updateCommercialOrderDelivery).toHaveBeenCalledWith("delivery-latest", expect.objectContaining({ status: "revision_required" }));
        expect(mocks.openSettlement).not.toHaveBeenCalled();
    });

    it("accepts the order and opens settlement in the same PostgreSQL transaction", async () => {
        mocks.repository.getPlatformCommercialOrder.mockResolvedValue({ ...order("submitted"), assignedSchoolId: "school-a", productionGroupId: "group-a" });
        mocks.repository.getLatestCommercialOrderDelivery.mockResolvedValue({ id: "delivery-latest", schoolId: "school-a", orderId: "order-a", status: "submitted" });
        mocks.repository.updateCommercialOrderDelivery.mockResolvedValue({ id: "delivery-latest", orderId: "order-a", status: "accepted" });
        mocks.repository.compareAndSetPlatformCommercialOrderStatus.mockResolvedValue(true);
        await expect(reviewCommercialOrder("admin-a", "order-a", { decision: "accepted" })).resolves.toMatchObject({ status: "accepted" });
        expect(mocks.withPostgres).toHaveBeenCalledOnce();
        expect(mocks.openSettlement).toHaveBeenCalledWith("order-a", mocks.executor);
    });
});

function context(id: string, role: "teacher" | "student", permissions: "school.manage"[] = []) {
    return { school: { id: "school-a", name: "甲学校", status: "active" }, membership: { id, role, permissions, status: "active" }, canManageSchool: permissions.includes("school.manage") };
}

function order(status: "draft" | "assigned" | "in_progress" | "submitted" | "revision_required" | "accepted" | "cancelled") {
    return { id: "order-a", title: "商单", requirements: "制作海报", referenceMaterials: [], acceptanceCriteria: "通过验收", internalAmountCents: 1250, status, platformFeedback: "", createdAt: now, updatedAt: now };
}
