import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), resolve: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ getSchoolProjectBillingSummary: mocks.resolve }));

import { GET } from "./route";

describe("teaching project billing route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a" });
        mocks.resolve.mockResolvedValue({ schoolName: "学校 A", groupName: "小组 A", orderTitle: "商单 A", availablePoints: 12.5, chargeSource: "group_school_points" });
    });

    it("resolves project billing for the signed-in user", async () => {
        const response = await GET(new Request("http://localhost/api/teaching/project-billing?surface=canvas&projectId=canvas-a&schoolId=school-b"));
        expect(response.status).toBe(200);
        expect(mocks.resolve).toHaveBeenCalledWith("student-a", { surface: "canvas", projectId: "canvas-a", executionProfile: "production" });
    });

    it("returns a conflict for a stale association", async () => {
        mocks.resolve.mockRejectedValue(Object.assign(new Error("关联失效"), { status: 409 }));
        const response = await GET(new Request("http://localhost/api/teaching/project-billing?surface=drama&projectId=drama-a"));
        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({ code: 409, msg: "关联失效" });
    });
});
