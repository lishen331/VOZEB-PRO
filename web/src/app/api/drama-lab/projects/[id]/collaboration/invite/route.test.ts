import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createDramaLabInvite: vi.fn(),
    resolvePublicRequestOrigin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: vi.fn(async (request: Request) => ({ ok: true, data: await request.json() })) }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    createDramaLabInvite: mocks.createDramaLabInvite,
    listDramaLabInvites: vi.fn(),
    revokeDramaLabInvite: vi.fn(),
    rotateDramaLabInvite: vi.fn(),
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {},
}));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: mocks.resolvePublicRequestOrigin }));

import { POST } from "./route";

describe("Drama Lab collaboration invite route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.createDramaLabInvite.mockResolvedValue({ id: "invite-one", token: "token-one" });
        mocks.resolvePublicRequestOrigin.mockReturnValue("http://8.163.37.148:3001");
    });

    it("builds invite links from the public request origin", async () => {
        const response = await POST(new Request("http://0.0.0.0:3000/api/drama-lab/projects/project-one/collaboration/invite", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "project-one" }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ data: { invite: { inviteUrl: "http://8.163.37.148:3001/drama-lab/invite/token-one" } } });
        expect(mocks.resolvePublicRequestOrigin).toHaveBeenCalled();
    });
});
