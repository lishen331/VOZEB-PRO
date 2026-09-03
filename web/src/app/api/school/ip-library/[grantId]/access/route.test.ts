import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), updateSchoolIpMemberAccess: vi.fn(), safeRecordAuditLog: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-ip-library-service", () => ({ updateSchoolIpMemberAccess: mocks.updateSchoolIpMemberAccess }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: () => ({ userId: "manager-a" }), safeRecordAuditLog: mocks.safeRecordAuditLog }));

import { PATCH } from "./route";

describe("school IP member access route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.updateSchoolIpMemberAccess.mockResolvedValue({ id: "grant-a", ipId: "ip-a", memberAccessEnabled: true });
    });

    it("updates only the boolean switch and records an audit event", async () => {
        const request = new Request("http://localhost/api/school/ip-library/grant-a/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) });
        const response = await PATCH(request, { params: Promise.resolve({ grantId: "grant-a" }) });
        expect(mocks.updateSchoolIpMemberAccess).toHaveBeenCalledWith("manager-a", "grant-a", true);
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "school.ip.member_access.update", target: { type: "ip_school_grant", id: "grant-a" }, metadata: { enabled: true } }));
        expect(response.status).toBe(200);
    });

    it("rejects non-boolean input", async () => {
        const request = new Request("http://localhost/api/school/ip-library/grant-a/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: "true" }) });
        expect((await PATCH(request, { params: Promise.resolve({ grantId: "grant-a" }) })).status).toBe(400);
        expect(mocks.updateSchoolIpMemberAccess).not.toHaveBeenCalled();
    });
});
