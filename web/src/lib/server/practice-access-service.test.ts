import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActiveSchoolContext: vi.fn() }));

vi.mock("@/lib/server/school-access-service", () => ({ requireActiveSchoolContext: mocks.requireActiveSchoolContext }));

import { requirePracticeAccess } from "./practice-access-service";

describe("practice access", () => {
    beforeEach(() => {
        mocks.requireActiveSchoolContext.mockReset();
    });

    it.each(["teacher", "student"] as const)("allows an active %s membership", async (role) => {
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-one", status: "active" }, membership: { id: `membership-${role}`, role, status: "active" } });

        await expect(requirePracticeAccess({ id: "user-one", role: "user" })).resolves.toMatchObject({ schoolId: "school-one", membershipId: `membership-${role}`, role });
    });

    it("allows a platform administrator only through a real active school membership", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-one", status: "active" }, membership: { id: "membership-admin", role: "teacher", status: "active" } });

        await expect(requirePracticeAccess({ id: "admin-one", role: "admin" })).resolves.toMatchObject({ schoolId: "school-one", membershipId: "membership-admin", role: "teacher" });
        expect(mocks.requireActiveSchoolContext).toHaveBeenCalledWith("admin-one");
    });

    it("does not grant a platform administrator access without an active school membership", async () => {
        mocks.requireActiveSchoolContext.mockRejectedValue(Object.assign(new Error("当前账号没有可用学校身份"), { status: 403 }));

        await expect(requirePracticeAccess({ id: "admin-one", role: "admin" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.requireActiveSchoolContext).toHaveBeenCalledWith("admin-one");
    });
});
