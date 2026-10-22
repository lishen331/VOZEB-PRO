import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import { beforeEach, expect, it, vi } from "vitest";
import type { ImageTask } from "@/lib/server/image-task-store";
const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("./image-task-support", async (original) => ({ ...(await original<typeof import("./image-task-support")>()), imageSubmissionFetch: mocks.submit }));
import { runOpenAiImageTask } from "./image-task-openai";
const task: ImageTask = {
    id: "image-url-contract",
    userId: "owner",
    username: "test",
    displayName: "Test",
    kind: "generation",
    source: "canvas",
    status: "running",
    createdAt: 1,
    updatedAt: 1,
    prompt: "private",
    references: [],
    config: { model: "vendor/image", baseUrl: "https://provider.example", apiKey: "system", apiFormat: "openai", advancedConfig: { ...emptyAdvancedConfig(), protocol: "compatible", imageResponseFormat: "url" } },
};
beforeEach(() => vi.resetAllMocks());
it("keeps explicit URL on rejection without retrying b64 or a Responses endpoint", async () => {
    mocks.submit.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Unsupported response_format url; use b64_json" } }), { status: 400, headers: { "content-type": "application/json" } }));
    await expect(runOpenAiImageTask(task, "https://platform.example", "https://platform.example", "", true)).rejects.toThrow();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.submit.mock.calls[0][2].body)).toMatchObject({ response_format: "url", model: "vendor/image" });
});
it("does not regenerate a paid URL result merely because it points to an internal provider host", async () => {
    mocks.submit.mockImplementation(async () => new Response(JSON.stringify({ data: [{ url: "https://images.internal/result.png" }] }), { headers: { "content-type": "application/json" } }));
    await expect(runOpenAiImageTask(task, "https://platform.example", "https://platform.example", "", true)).resolves.toMatchObject({ remoteUrl: "https://provider.example/result.png" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
});
