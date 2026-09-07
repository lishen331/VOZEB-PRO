import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ updateAdminIpGrant: mocks.update }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "education-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));

import { PATCH } from "./route";

const context = { params: Promise.resolve({ id: "ip-one", grantId: "grant-one" }) };

describe("admin IP school grant item route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "education-one", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.update.mockResolvedValue({ id: "grant-one", ipId: "ip-one", subIpId: "sub-ip-one", schoolId: "school-one", mode: "exclusive", status: "suspended" });
    });

    it("updates a child-scoped grant and retains the child identifier in the audit log", async () => {
        const response = await PATCH(jsonRequest({ status: "suspended" }), context);

        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("education-one", "ip-one", "grant-one", { status: "suspended" });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ action: "admin.ip.grant.update", target: { type: "ip_school_grant", id: "grant-one" }, metadata: { ipId: "ip-one", subIpId: "sub-ip-one", schoolId: "school-one", mode: "exclusive", status: "suspended" } }),
        );
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-one/schools/grant-one", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
