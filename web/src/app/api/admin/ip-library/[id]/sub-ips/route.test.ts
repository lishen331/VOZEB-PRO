import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ createAdminIpSubIp: mocks.create }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "ip-one" }) };

describe("admin IP child route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.create.mockResolvedValue({ id: "sub-ip-one", ipId: "ip-one", title: "第一子 IP" });
    });

    it("creates a child IP and records only its public identifier", async () => {
        const response = await POST(jsonRequest({ title: "第一子 IP", summary: "内容说明", tags: ["教学"] }), context);

        expect(response.status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith("admin-one", "ip-one", { title: "第一子 IP", summary: "内容说明", tags: ["教学"] });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.sub_ip.create", target: { type: "ip_sub_ip", id: "sub-ip-one", label: "第一子 IP" }, metadata: { ipId: "ip-one" } }));
    });

    it("rejects school-only administrators", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "education-one", role: "admin", status: "active", adminPermissions: ["education.manage"] });

        expect((await POST(jsonRequest({ title: "第一子 IP" }), context)).status).toBe(403);
        expect(mocks.create).not.toHaveBeenCalled();
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-one/sub-ips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
