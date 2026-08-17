import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getSchoolContextForUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-access-service", () => ({ getSchoolContextForUser: mocks.getSchoolContextForUser }));

import { GET } from "./route";

describe("school context route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "teacher-a" });
        mocks.getSchoolContextForUser.mockResolvedValue({ school: { id: "school-a" }, membership: { role: "teacher" }, canManageSchool: false });
    });

    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET();
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ code: 401, data: null });
    });

    it("returns the current user's derived school context", async () => {
        const response = await GET();
        expect(mocks.getSchoolContextForUser).toHaveBeenCalledWith("teacher-a");
        await expect(response.json()).resolves.toEqual({ code: 0, data: { school: { id: "school-a" }, membership: { role: "teacher" }, canManageSchool: false }, msg: "ok" });
    });
});
