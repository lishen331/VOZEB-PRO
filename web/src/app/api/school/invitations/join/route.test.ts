import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), previewSchoolInvite: vi.fn(), joinSchoolByInvite: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-member-provisioning-service", () => ({ previewSchoolInvite: mocks.previewSchoolInvite, joinSchoolByInvite: mocks.joinSchoolByInvite }));

import { GET, POST } from "./route";

describe("school invitation join route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
        mocks.previewSchoolInvite.mockResolvedValue({ school: { id: "school-a", name: "甲学校" }, role: "student" });
        mocks.joinSchoolByInvite.mockResolvedValue({ school: { id: "school-a" }, membership: { role: "student" } });
    });

    it("requires login before previewing an invitation", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/school/invitations/join?code=SCHOOL-CODE"));

        expect(response.status).toBe(401);
        expect(mocks.previewSchoolInvite).not.toHaveBeenCalled();
    });

    it("returns a read-only invitation preview", async () => {
        const response = await GET(new Request("http://localhost/api/school/invitations/join?code=SCHOOL-CODE"));

        expect(mocks.previewSchoolInvite).toHaveBeenCalledWith("user-a", "SCHOOL-CODE");
        expect(mocks.joinSchoolByInvite).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toEqual({ code: 0, data: { school: { id: "school-a", name: "甲学校" }, role: "student" }, msg: "ok" });
    });

    it("maps invalid or expired invitation previews", async () => {
        mocks.previewSchoolInvite.mockRejectedValue(Object.assign(new Error("邀请码无效或已过期"), { status: 400 }));

        const response = await GET(new Request("http://localhost/api/school/invitations/join?code=EXPIRED"));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: 400, msg: "邀请码无效或已过期" });
    });

    it("keeps POST as the explicit join confirmation", async () => {
        const response = await POST(new Request("http://localhost/api/school/invitations/join", { method: "POST", body: JSON.stringify({ code: "SCHOOL-CODE" }) }));

        expect(mocks.joinSchoolByInvite).toHaveBeenCalledWith("user-a", "SCHOOL-CODE");
        expect(mocks.previewSchoolInvite).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
    });
});
