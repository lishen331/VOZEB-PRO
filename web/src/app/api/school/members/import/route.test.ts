import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), importSchoolMembers: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-member-provisioning-service", () => ({ importSchoolMembers: mocks.importSchoolMembers }));

import { POST } from "./route";

describe("school member import route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
    });

    it("submits the entire batch once and returns atomic validation failures", async () => {
        const rows = [{ username: "student-a", password: "password123", role: "student" }];
        mocks.importSchoolMembers.mockRejectedValue(Object.assign(new Error("用户名已存在"), { status: 400 }));
        const response = await POST(new Request("http://localhost/api/school/members/import", { method: "POST", body: JSON.stringify({ rows }) }));
        expect(mocks.importSchoolMembers).toHaveBeenCalledOnce();
        expect(mocks.importSchoolMembers).toHaveBeenCalledWith("manager-a", rows);
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 400, data: null, msg: "用户名已存在" });
    });
});
