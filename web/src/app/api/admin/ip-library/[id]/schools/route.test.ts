import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn(), createBatch: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ listAdminIpGrants: mocks.list, createAdminIpGrant: mocks.create, createAdminIpGrants: mocks.createBatch }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "ip-a" }) };

describe("admin IP school grants route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.create.mockResolvedValue({ id: "grant-a", ipId: "ip-a", subIpId: "sub-ip-a", schoolId: "school-a", mode: "exclusive", status: "active" });
        mocks.createBatch.mockResolvedValue([
            { id: "grant-a", ipId: "ip-a", subIpId: "sub-ip-a", schoolId: "school-a", mode: "multi_school", status: "active" },
            { id: "grant-b", ipId: "ip-a", subIpId: "sub-ip-b", schoolId: "school-a", mode: "multi_school", status: "active" },
        ]);
    });

    it("requires education duty and audits identifiers without private note", async () => {
        expect((await GET(new Request("http://localhost/api/admin/ip-library/ip-a/schools?subIpId=sub-ip-a"), context)).status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("admin-a", "ip-a", expect.objectContaining({ subIpId: "sub-ip-a" }));
        const response = await POST(jsonRequest({ subIpId: "sub-ip-a", schoolId: "school-a", mode: "exclusive", startsAt: "2026-08-19T00:00:00.000Z", note: "线下合同内容" }), context);
        expect(response.status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ action: "admin.ip.grant.create", target: { type: "ip_school_grant", id: "grant-a" }, metadata: { ipId: "ip-a", subIpId: "sub-ip-a", schoolId: "school-a", mode: "exclusive", status: "active" } }),
        );
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("线下合同内容");

        mocks.getCurrentUser.mockResolvedValue({ id: "content-a", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        expect((await GET(new Request("http://localhost/api/admin/ip-library/ip-a/schools"), context)).status).toBe(403);
    });

    it("returns batch grants and records only aggregate audit metadata", async () => {
        const response = await POST(jsonRequest({ subIpIds: ["sub-ip-a", "sub-ip-b"], schoolIds: ["school-a"], mode: "multi_school", startsAt: "2026-08-19T00:00:00.000Z", note: "线下合同内容" }), context);

        expect(response.status).toBe(200);
        expect(mocks.createBatch).toHaveBeenCalledWith("admin-a", "ip-a", expect.objectContaining({ subIpIds: ["sub-ip-a", "sub-ip-b"], schoolIds: ["school-a"] }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ target: { type: "ip", id: "ip-a" }, metadata: { ipId: "ip-a", grantCount: "2" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("线下合同内容");
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-a/schools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
