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

    it("does not let a platform administrator borrow a school membership", async () => {
        await expect(requirePracticeAccess({ id: "admin-one", role: "admin" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.requireActiveSchoolContext).not.toHaveBeenCalled();
    });
});
