import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), remove: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/canvas-project-service", () => ({
    canvasProjectError: vi.fn(),
    deleteDramaLabCanvasAssistantConversationsForUser: mocks.remove,
}));

import { DELETE } from "./route";

describe("drama lab canvas assistant conversation deletion route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.remove.mockResolvedValue({ deleted: 1, chatSessions: [], activeChatId: null });
    });

    it("uses the drama-lab scoped deletion service", async () => {
        const response = await DELETE(
            new Request("http://localhost/api/drama-lab/canvas-projects/canvas-one/assistant-conversations", {
                method: "DELETE",
                body: JSON.stringify({ conversationIds: ["conversation-one"] }),
            }),
            { params: Promise.resolve({ id: "canvas-one" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith("user-one", "canvas-one", ["conversation-one"]);
    });
});
