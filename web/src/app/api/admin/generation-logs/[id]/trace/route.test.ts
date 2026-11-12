import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readGenerationLogTrace: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/generation-log-trace", () => ({ readGenerationLogTrace: mocks.readGenerationLogTrace }));

import { GET } from "./route";

describe("GET /api/admin/generation-logs/[id]/trace", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["generation.read"] });
        mocks.readGenerationLogTrace.mockResolvedValue({
            taskId: "task-one",
            executionProfile: "open-source-practice",
            channelName: "练习渠道",
            diagnosticsExpired: false,
            steps: [{ at: 1, phase: "upstream_response", status: 503, errorMessage: "upstream busy" }],
        });
    });

    it("requires a signed-in administrator", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);

        expect((await GET(request(), context())).status).toBe(401);
        expect(mocks.readGenerationLogTrace).not.toHaveBeenCalled();
    });

    it("rejects an administrator without generation read access", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin", role: "admin", status: "active", adminPermissions: ["users.read"] });

        expect((await GET(request(), context())).status).toBe(403);
        expect(mocks.readGenerationLogTrace).not.toHaveBeenCalled();
    });

    it("returns 404 when the log has no linked task", async () => {
        mocks.readGenerationLogTrace.mockResolvedValueOnce(null);

        const response = await GET(request(), context());

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "没有关联的生成任务" });
        expect(mocks.readGenerationLogTrace).toHaveBeenCalledWith("log-one");
    });

    it("returns the sanitized trace for the log id", async () => {
        const response = await GET(request(), context());

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ trace: { taskId: "task-one", steps: [{ status: 503, errorMessage: "upstream busy" }] } });
        expect(mocks.readGenerationLogTrace).toHaveBeenCalledWith("log-one");
    });
});

function request() {
    return new Request("http://localhost/api/admin/generation-logs/log-one/trace");
}

function context() {
    return { params: Promise.resolve({ id: "log-one" }) };
}
