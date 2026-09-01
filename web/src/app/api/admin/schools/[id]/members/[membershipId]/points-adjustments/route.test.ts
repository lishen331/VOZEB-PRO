import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), adjust: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/admin-school-member-points-service", () => ({ adjustSchoolMemberPointsByAdmin: mocks.adjust }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "school-a", membershipId: "membership-a" }) };
const result = {
    member: { id: "membership-a", userId: "user-a", accountId: "1001", username: "student", displayName: "学生", permanentPoints: 32.5, dailyPoints: 5, totalPoints: 37.5, accountStatus: "active" },
    adjustment: { recordId: "record-a", operation: "credit", amount: 12.5, balanceBefore: 20, balanceAfter: 32.5, reason: "合同额度修正", createdAt: "2026-09-01T00:00:00.000Z" },
};

describe("admin school member points adjustment route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: [] });
        mocks.adjust.mockResolvedValue(result);
    });

    it("passes session and path identities, ignores body userId, and audits the persisted result", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/schools/school-a/members/membership-a/points-adjustments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-a", userId: "attacker" }),
            }),
            context,
        );
        expect(response.status).toBe(200);
        expect(mocks.adjust).toHaveBeenCalledWith("admin-a", "school-a", "membership-a", { operation: "credit", amount: 12.5, reason: "合同额度修正", idempotencyKey: "adjust-a" });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "admin.school-member.points-adjust",
                metadata: expect.objectContaining({
                    schoolId: "school-a",
                    membershipId: "membership-a",
                    userId: "user-a",
                    accountId: "1001",
                    operation: "credit",
                    amount: 12.5,
                    balanceBefore: 20,
                    balanceAfter: 32.5,
                    reason: "合同额度修正",
                    recordId: "record-a",
                    idempotencyKey: "adjust-a",
                }),
            }),
        );
    });

    it("maps service errors and records redacted failure metadata", async () => {
        mocks.adjust.mockRejectedValue(Object.assign(new Error("个人永久积分不足"), { status: 409 }));
        const response = await POST(new Request("http://localhost/api/admin/schools/school-a/members/membership-a/points-adjustments", { method: "POST", body: JSON.stringify({ operation: "debit", amount: 99, reason: "修正", idempotencyKey: "key-b" }) }), context);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 409, msg: "个人永久积分不足" });
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("个人永久积分不足");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ status: "failure", metadata: { schoolId: "school-a", membershipId: "membership-a", errorStatus: 409 } }));
    });

    it("requires authentication and validates the body shape", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await POST(new Request("http://localhost/api/admin/schools/school-a/members/membership-a/points-adjustments", { method: "POST", body: "{}" }), context)).status).toBe(401);
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: [] });
        expect((await POST(new Request("http://localhost/api/admin/schools/school-a/members/membership-a/points-adjustments", { method: "POST", body: JSON.stringify([]) }), context)).status).toBe(400);
        expect(mocks.adjust).not.toHaveBeenCalled();
    });

    it("rejects invalid runtime field types with 400", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/schools/school-a/members/membership-a/points-adjustments", { method: "POST", body: JSON.stringify({ operation: "credit", amount: 1, reason: null, idempotencyKey: "key-a" }) }),
            context,
        );
        expect(response.status).toBe(400);
        expect(mocks.adjust).not.toHaveBeenCalled();
    });
});
