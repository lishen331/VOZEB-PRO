import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), update: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ deleteAdminIpSubIp: mocks.remove, updateAdminIpSubIp: mocks.update }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "ip-one", subIpId: "sub-ip-one" }) };

describe("admin IP child item route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.update.mockResolvedValue({ id: "sub-ip-one", ipId: "ip-one", title: "更新后的子 IP" });
        mocks.remove.mockResolvedValue({ deleted: true });
    });

    it("updates one child IP without changing its parent", async () => {
        const response = await PATCH(jsonRequest({ title: "更新后的子 IP", items: [] }), context);

        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("admin-one", "ip-one", "sub-ip-one", { title: "更新后的子 IP", items: [] });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.sub_ip.update", target: { type: "ip_sub_ip", id: "sub-ip-one", label: "更新后的子 IP" }, metadata: { ipId: "ip-one" } }));
    });

    it("deletes one child IP and records the deletion", async () => {
        const response = await DELETE(new Request("http://localhost/api/admin/ip-library/ip-one/sub-ips/sub-ip-one", { method: "DELETE" }), context);

        expect(await response.json()).toMatchObject({ code: 0, data: { deleted: true } });
        expect(mocks.remove).toHaveBeenCalledWith("admin-one", "ip-one", "sub-ip-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.sub_ip.delete", target: { type: "ip_sub_ip", id: "sub-ip-one" }, metadata: { ipId: "ip-one" } }));
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-one/sub-ips/sub-ip-one", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
