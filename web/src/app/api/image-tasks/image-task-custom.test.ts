import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchInternalApi: vi.fn() }));

vi.mock("@/lib/server/internal-origin", () => ({
    fetchInternalApi: mocks.fetchInternalApi,
    isInternalApiBaseUrl: (baseUrl: string) => baseUrl.startsWith("/"),
}));

import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import type { ImageTask } from "@/lib/server/image-task-store";
import { readVerifiedSystemAiBusinessRequestId } from "@/lib/server/system-ai-billing";
import { pollCustomImageTask, resolveDeclarativeImageSize } from "./image-task-custom";

describe("declarative image request size", () => {
    it("does not turn Stable Diffusion intelligent requests into a square size", () => {
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("");
    });

    it("preserves explicit dimensions and does not invent custom protocol defaults", () => {
        expect(resolveDeclarativeImageSize({ quality: "high", size: "1536x1024", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("1536x1024");
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "custom" } })).toBe("");
    });

    it("signs trusted practice polling with a stable server-owned request identity", async () => {
        const task = {
            id: "image-one",
            userId: "user-one",
            status: "running",
            createdAt: 1,
            updatedAt: 1,
            executionProfile: "open-source-practice",
            attemptNo: 4,
            kind: "generation",
            username: "user",
            displayName: "User",
            source: "image-workbench",
            prompt: "test",
            references: [],
            config: {
                baseUrl: "/api/ai/system/channel-one",
                apiKey: "system",
                apiFormat: "openai",
                model: "image-one",
                logicalModel: "practice-image",
                executionProfile: "open-source-practice",
                advancedConfig: { ...emptyAdvancedConfig(), protocol: "runninghub", createPath: "/images", queryPath: "/query/:task_id", taskIdField: "id", resultField: "url", statusField: "status" },
            },
        } satisfies ImageTask;
        mocks.fetchInternalApi.mockResolvedValueOnce(Response.json({ status: "processing" }));

        await expect(pollCustomImageTask(task, "upstream-one", "http://localhost/api/ai/system/channel-one/images", "http://localhost/api/ai/system/channel-one/images", "", true)).resolves.toMatchObject({ pending: { id: "upstream-one" } });

        const headers = new Headers((mocks.fetchInternalApi.mock.calls[0]?.[1] as RequestInit).headers);
        expect(readVerifiedSystemAiBusinessRequestId(headers, "practice-image", task.config.model, "open-source-practice")).toBe("image-task:image-one:attempt:4:poll");
    });
});
