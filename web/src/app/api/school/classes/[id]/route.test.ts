import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getSchoolClass: vi.fn(), updateSchoolClass: vi.fn(), updateSchoolClassWithMembers: vi.fn(), removeSchoolClass: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-tenant-service", () => ({
    getSchoolClass: mocks.getSchoolClass,
    updateSchoolClass: mocks.updateSchoolClass,
    updateSchoolClassWithMembers: mocks.updateSchoolClassWithMembers,
    removeSchoolClass: mocks.removeSchoolClass,
}));

import { GET, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "class-b" }) };

describe("school class detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
    });

    it("maps cross-school classes to 404", async () => {
        mocks.getSchoolClass.mockRejectedValue(Object.assign(new Error("班级不存在"), { status: 404 }));
        const response = await GET(new Request("http://localhost/api/school/classes/class-b"), context);
        expect(response.status).toBe(404);
    });

    it("rejects incomplete member replacement before any mutation", async () => {
        const response = await PATCH(new Request("http://localhost/api/school/classes/class-b", { method: "PATCH", body: JSON.stringify({ teacherMembershipIds: ["teacher-a"] }) }), context);
        expect(response.status).toBe(400);
        expect(mocks.updateSchoolClass).not.toHaveBeenCalled();
        expect(mocks.updateSchoolClassWithMembers).not.toHaveBeenCalled();
    });

    it("rejects non-object JSON before any mutation", async () => {
        const response = await PATCH(new Request("http://localhost/api/school/classes/class-b", { method: "PATCH", body: "null" }), context);
        expect(response.status).toBe(400);
        expect(mocks.updateSchoolClass).not.toHaveBeenCalled();
        expect(mocks.updateSchoolClassWithMembers).not.toHaveBeenCalled();
    });

    it("rejects present member fields with invalid value types", async () => {
        const response = await PATCH(new Request("http://localhost/api/school/classes/class-b", { method: "PATCH", body: JSON.stringify({ teacherMembershipIds: "bad", studentMembershipIds: "bad" }) }), context);
        expect(response.status).toBe(400);
        expect(mocks.updateSchoolClass).not.toHaveBeenCalled();
        expect(mocks.updateSchoolClassWithMembers).not.toHaveBeenCalled();
    });

    it("uses one composite service call for class and member updates", async () => {
        mocks.updateSchoolClassWithMembers.mockResolvedValue({ id: "class-b", name: "设计一班", teachers: [], students: [] });
        const body = { name: "设计一班", teacherMembershipIds: ["teacher-a"], studentMembershipIds: ["student-a"] };
        const response = await PATCH(new Request("http://localhost/api/school/classes/class-b", { method: "PATCH", body: JSON.stringify(body) }), context);
        expect(response.status).toBe(200);
        expect(mocks.updateSchoolClassWithMembers).toHaveBeenCalledWith("manager-a", "class-b", body, {
            teacherMembershipIds: ["teacher-a"],
            studentMembershipIds: ["student-a"],
        });
        expect(mocks.updateSchoolClass).not.toHaveBeenCalled();
    });
});
