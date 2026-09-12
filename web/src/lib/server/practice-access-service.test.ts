import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActiveSchoolContext: vi.fn(), getAuthSettings: vi.fn() }));

vi.mock("@/lib/server/school-access-service", () => ({ requireActiveSchoolContext: mocks.requireActiveSchoolContext }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));

import { requirePracticeAccess } from "./practice-access-service";

describe("practice access", () => {
    beforeEach(() => {
        mocks.requireActiveSchoolContext.mockReset();
        mocks.getAuthSettings.mockResolvedValue({ practiceScriptSettings: { enabled: true }, practiceModuleVisibility: {} });
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

    it("rejects a hidden practice module at the service boundary", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-one", status: "active" }, membership: { id: "membership-one", role: "student", status: "active" } });
        mocks.getAuthSettings.mockResolvedValue({ practiceScriptSettings: { enabled: true }, practiceModuleVisibility: { "storyboard-image": false } });
        await expect(requirePracticeAccess({ id: "user-one", role: "user" }, "storyboard-image")).rejects.toMatchObject({ status: 404 });
    });

    it("rejects script APIs when script practice is disabled", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-one", status: "active" }, membership: { id: "membership-one", role: "student", status: "active" } });
        mocks.getAuthSettings.mockResolvedValue({ practiceScriptSettings: { enabled: false }, practiceModuleVisibility: {} });
        await expect(requirePracticeAccess({ id: "user-one", role: "user" }, "script")).rejects.toMatchObject({ status: 404 });
    });

    it("does not grant a platform administrator access without an active school membership", async () => {
        mocks.requireActiveSchoolContext.mockRejectedValue(Object.assign(new Error("当前账号没有可用学校身份"), { status: 403 }));

        await expect(requirePracticeAccess({ id: "admin-one", role: "admin" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.requireActiveSchoolContext).toHaveBeenCalledWith("admin-one");
    });
});
