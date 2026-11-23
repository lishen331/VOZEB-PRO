import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), adjustBatch: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/admin-school-member-points-service", () => ({ listSchoolMembersByAdmin: mocks.list, adjustSchoolMemberBatchPointsByAdmin: mocks.adjustBatch }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "school-a" }) };

describe("admin school members route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("requires an authenticated active platform admin", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a", role: "user", status: "active", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(403);
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "disabled", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members"), context)).status).toBe(403);
    });

    it("passes school-scoped pagination and filters and returns the envelope", async () => {
        const response = await GET(new Request("http://localhost/api/admin/schools/school-a/members?page=2&pageSize=10&keyword=1001&role=student&status=disabled"), context);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { items: [] }, msg: "ok" });
        expect(mocks.list).toHaveBeenCalledWith("admin-a", "school-a", { page: 2, pageSize: 10, keyword: "1001", role: "student", status: "disabled" });
    });

    it("rejects unknown role and status", async () => {
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members?role=admin"), context)).status).toBe(400);
        expect((await GET(new Request("http://localhost/api/admin/schools/school-a/members?status=archived"), context)).status).toBe(400);
        expect(mocks.list).not.toHaveBeenCalled();
    });
});

const batchInput = { membershipIds: ["member-a", "member-b"], operation: "credit", amount: 2.25, reason: "课程奖励", idempotencyKey: "batch-a" };
const batchRequest = (body: unknown = batchInput) => new Request("http://localhost/api/admin/schools/school-a/members", { method: "POST", body: JSON.stringify(body) });

describe("admin school member batch point adjustment", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage", "billing.manage"] });
    });

    it.each([{ permissions: null }, { permissions: ["education.manage"] }, { permissions: ["billing.manage"] }])("blocks missing authorization ($permissions)", async ({ permissions }) => {
        mocks.getCurrentUser.mockResolvedValue(permissions && { id: "admin-a", role: "admin", status: "active", adminPermissions: permissions });
        expect((await POST(batchRequest(), context)).status).toBe(permissions ? 403 : 401);
        expect(mocks.adjustBatch).not.toHaveBeenCalled();
    });

    it("returns updated members and audits the ledger IDs without recording the reason", async () => {
        const item = { member: { id: "member-a" }, adjustment: { recordId: "record-a" } };
        mocks.adjustBatch.mockResolvedValue([{ ...item, schoolName: "学校" }]);
        const response = await POST(batchRequest(), context);
        expect(await response.json()).toEqual({ code: 0, data: { items: [item] }, msg: "ok" });
        expect(mocks.adjustBatch).toHaveBeenCalledOnce();
        expect(mocks.adjustBatch).toHaveBeenCalledWith("admin-a", "school-a", batchInput);
        expect(mocks.audit.mock.calls[0][0].metadata).toEqual({ operation: "credit", amount: 2.25, memberCount: 1, adjustments: [{ membershipId: "member-a", recordId: "record-a" }] });
    });

    it("rejects malformed input and returns the batch conflict without exposing payload details in the audit", async () => {
        expect((await POST(batchRequest({ ...batchInput, membershipIds: "member-a" }), context)).status).toBe(400);
        expect(mocks.adjustBatch).not.toHaveBeenCalled();
        mocks.adjustBatch.mockRejectedValue({ status: 409, message: "个人永久积分不足" });
        const response = await POST(batchRequest(), context);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ code: 409, data: null, msg: "个人永久积分不足" });
        expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failure", metadata: { errorStatus: 409 } }));
    });
});
