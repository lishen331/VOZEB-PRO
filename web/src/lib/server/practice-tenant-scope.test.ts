import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActiveSchoolContext: vi.fn() }));

vi.mock("@/lib/server/school-access-service", () => ({ requireActiveSchoolContext: mocks.requireActiveSchoolContext }));

import { assertPracticeTenant, requirePracticeTenant, type PracticeTenantScope } from "./practice-tenant-scope";

describe("practice tenant scope", () => {
    beforeEach(() => {
        mocks.requireActiveSchoolContext.mockReset();
    });

    it.each(["teacher", "student"] as const)("derives the current school and owner for an active %s", async (role) => {
        mocks.requireActiveSchoolContext.mockResolvedValue({
            school: { id: "school-a", status: "active" },
            membership: { id: `membership-${role}`, role, status: "active" },
        });

        await expect(requirePracticeTenant({ id: "user-a", role: "user" })).resolves.toEqual({ schoolId: "school-a", ownerUserId: "user-a" });
    });

    it("rejects a school administrator context with an unsupported membership role", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue({
            school: { id: "school-a", status: "active" },
            membership: { id: "membership-a", role: "admin", status: "active" },
        });

        await expect(requirePracticeTenant({ id: "user-a", role: "user" })).rejects.toMatchObject({ status: 403 });
    });

    it("rejects a client-supplied scope that differs from the current tenant", () => {
        const scope: PracticeTenantScope = { schoolId: "school-a", ownerUserId: "user-a" };

        expect(() => assertPracticeTenant(scope, { schoolId: "school-b", ownerUserId: "user-a" })).toThrow("练习租户范围不匹配");
        expect(() => assertPracticeTenant(scope, { schoolId: "school-a", ownerUserId: "user-b" })).toThrow("练习租户范围不匹配");
        expect(() => assertPracticeTenant(scope, { title: "客户端未提交租户字段" })).not.toThrow();
    });
});
