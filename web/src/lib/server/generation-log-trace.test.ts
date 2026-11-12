import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getById: vi.fn(),
    getTaskTrace: vi.fn(),
    getChannelNames: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: () => ({ generationLogs: mocks }),
}));

import { readGenerationLogTrace } from "./generation-log-trace";

describe("readGenerationLogTrace", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getById.mockResolvedValue({ id: "log-one", taskId: "task-one" });
        mocks.getTaskTrace.mockResolvedValue({
            executionProfile: "open-source-practice",
            channelId: "channel-one",
            diagnosticsExpired: false,
            events: [
                {
                    phase: "upstream_response",
                    at: 10,
                    model: "agnes-image",
                    channelId: "channel-two",
                    status: 503,
                    durationMs: 22623,
                    errorMessage: "Bearer secret-token ServiceUnavailableError",
                    url: "https://apihub.example.com/v1/images/edits?key=secret",
                    ignored: "not a whitelisted field",
                },
            ],
        });
        mocks.getChannelNames.mockResolvedValue(
            new Map([
                ["channel-one", "练习渠道"],
                ["channel-two", "故障转移渠道"],
            ]),
        );
    });

    it("resolves the task from the log id and redacts the diagnostic event", async () => {
        const trace = await readGenerationLogTrace(" log-one ");

        expect(mocks.getById).toHaveBeenCalledWith("log-one");
        expect(mocks.getTaskTrace).toHaveBeenCalledWith("task-one");
        expect(trace).toMatchObject({
            taskId: "task-one",
            executionProfile: "open-source-practice",
            channelName: "练习渠道",
            diagnosticsExpired: false,
        });
        expect(trace?.steps).toEqual([
            expect.objectContaining({
                at: 10,
                phase: "upstream_response",
                model: "agnes-image",
                channelId: "channel-two",
                channelName: "故障转移渠道",
                status: 503,
                durationMs: 22623,
                url: "https://apihub.example.com/v1/images/edits",
            }),
        ]);
        expect(JSON.stringify(trace)).not.toContain("secret");
        expect(trace?.steps[0]?.errorMessage).toContain("[redacted]");
    });

    it("returns nothing when the log has no linked task", async () => {
        mocks.getById.mockResolvedValueOnce({ id: "log-one" });

        await expect(readGenerationLogTrace("log-one")).resolves.toBeNull();
        expect(mocks.getTaskTrace).not.toHaveBeenCalled();
    });

    it("returns nothing when the linked task no longer exists", async () => {
        mocks.getTaskTrace.mockResolvedValueOnce(null);

        await expect(readGenerationLogTrace("log-one")).resolves.toBeNull();
    });
});
