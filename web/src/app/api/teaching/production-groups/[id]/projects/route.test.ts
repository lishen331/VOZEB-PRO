import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), link: vi.fn(), unlink: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-production-group-service", () => ({ linkProjectToProductionGroup: mocks.link, unlinkProjectFromProductionGroup: mocks.unlink }));

import { DELETE, POST } from "./route";

describe("teaching production group projects route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a" });
        mocks.link.mockResolvedValue({ id: "link-a", groupId: "group-a", orderId: "order-a", projectType: "canvas", projectId: "canvas-a" });
        mocks.unlink.mockResolvedValue({ removed: true });
    });

    it("links the signed-in user's project without accepting tenant identity", async () => {
        const request = new Request("http://localhost/api/teaching/production-groups/group-a/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: "order-a", projectType: "canvas", projectId: "canvas-a", userId: "user-b", schoolId: "school-b" }),
        });
        const response = await POST(request, { params: Promise.resolve({ id: "group-a" }) });
        expect(response.status).toBe(200);
        expect(mocks.link).toHaveBeenCalledWith("student-a", "group-a", { orderId: "order-a", projectType: "canvas", projectId: "canvas-a" });
    });

    it("lets the service authorize project unlinking", async () => {
        const request = new Request("http://localhost/api/teaching/production-groups/group-a/projects", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkId: "link-a" }),
        });
        const response = await DELETE(request, { params: Promise.resolve({ id: "group-a" }) });
        expect(response.status).toBe(200);
        expect(mocks.unlink).toHaveBeenCalledWith("student-a", "group-a", "link-a");
    });

    it("rejects unsupported project types", async () => {
        const request = new Request("http://localhost/api/teaching/production-groups/group-a/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: "order-a", projectType: "video", projectId: "video-a" }),
        });
        expect((await POST(request, { params: Promise.resolve({ id: "group-a" }) })).status).toBe(400);
        expect(mocks.link).not.toHaveBeenCalled();
    });
});
