import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageTask } from "./image-task-store";
const mocks = vi.hoisted(() => ({ read: vi.fn(), normalize: vi.fn(), record: vi.fn() }));
vi.mock("./image-result-media-reader", () => ({ readImageResultMedia: mocks.read }));
vi.mock("./media-task-trace", () => ({ recordMediaTaskEvent: mocks.record }));
vi.mock("./generation-log-repository", () => ({ normalizeAssets: mocks.normalize, deleteLocalAsset: vi.fn() }));
import { prepareImageTaskResults } from "./image-task-result-service";
const task: ImageTask = {
    id: "task-1",
    userId: "owner",
    username: "test",
    displayName: "Test",
    source: "canvas",
    surface: "canvas",
    kind: "generation",
    status: "running",
    createdAt: 1,
    updatedAt: 1,
    config: { model: "image-model", apiFormat: "openai", apiKey: "system", baseUrl: "https://upstream.example" },
    prompt: "private prompt",
    references: [],
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.normalize.mockResolvedValue([{ url: "/api/generation-log-assets/permanent/image.png", width: 2, height: 3 }]);
});
describe("canvas result delivery gate", () => {
    it("uses the strict media reader before persisting and emits completion only after assets exist", async () => {
        mocks.read.mockImplementation(async (input) => {
            await input.emit({ phase: "result_media_complete", responseBytes: 20 });
            return { dataUrl: "data:image/png;base64,valid", width: 2, height: 3 };
        });
        await expect(prepareImageTaskResults(task, { dataUrl: "https://cdn.example/result.png" }, "https://platform.example", "cookie=secret")).resolves.toEqual([
            expect.objectContaining({ serverUrl: undefined, dataUrl: "/api/generation-log-assets/permanent/image.png" }),
        ]);
        expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ value: "https://cdn.example/result.png" }));
        expect(mocks.record).toHaveBeenCalledWith("image", task, expect.objectContaining({ phase: "result_persist_complete", referenceCount: 1 }));
    });
    it("does not create assets or claim persistence complete if one generated result is unreadable", async () => {
        mocks.read.mockResolvedValueOnce({ dataUrl: "data:image/png;base64,valid" }).mockRejectedValueOnce(new Error("media_http_error"));
        await expect(prepareImageTaskResults(task, { dataUrl: "https://cdn.example/a.png", results: [{ dataUrl: "https://cdn.example/a.png" }, { dataUrl: "https://cdn.example/b.png" }] }, "https://platform.example", "")).rejects.toThrow(
            "media_http_error",
        );
        expect(mocks.normalize).not.toHaveBeenCalled();
    });
    it("records persistence failure without inventing a readable success asset", async () => {
        mocks.read.mockResolvedValue({ dataUrl: "data:image/png;base64,valid" });
        mocks.normalize.mockRejectedValue(new Error("OSS write failed"));
        await expect(prepareImageTaskResults(task, { dataUrl: "https://cdn.example/a.png" }, "https://platform.example", "")).rejects.toThrow("OSS write failed");
        expect(mocks.record).toHaveBeenCalledWith("image", task, expect.objectContaining({ phase: "result_persist_failed", stage: "persist" }));
        expect(mocks.record.mock.calls.some((c) => c[2].phase === "result_persist_complete")).toBe(false);
    });
});

it("applies Canvas delivery gates to canonical surface even if the logging source is omitted", async () => {
    mocks.read.mockRejectedValue(new Error("media_invalid_image"));
    await expect(prepareImageTaskResults({ ...task, source: "image-workbench" }, { dataUrl: "https://cdn.example/fake.png" }, "https://platform.example", "")).rejects.toThrow("media_invalid_image");
    expect(mocks.normalize).not.toHaveBeenCalled();
});

describe("explicit non-Canvas identity takes precedence over legacy source", () => {
    it.each(["agent", "chat", "drama"])("keeps surface=%s on the existing remote-result path even with source=canvas", async (surface) => {
        const conflictingTask = { ...task };
        // Persisted runtime identities can contain surfaces outside the current ImageTask union.
        Object.defineProperty(conflictingTask, "surface", { value: surface });
        const remoteUrl = "https://cdn.example/result.png";
        mocks.read.mockRejectedValue(new Error("strict Canvas reader must not run"));
        await expect(prepareImageTaskResults(conflictingTask, { dataUrl: remoteUrl, remoteUrl }, "https://platform.example", "")).resolves.toEqual([expect.objectContaining({ dataUrl: "/api/generation-log-assets/permanent/image.png" })]);
        expect(mocks.read).not.toHaveBeenCalled();
        expect(mocks.normalize).toHaveBeenCalledWith([expect.objectContaining({ type: "image", url: remoteUrl, remoteUrl })], expect.objectContaining({ ownerUserId: "owner" }));
    });

    it("does not impose Canvas all-or-nothing persistence on a conflicting Agent identity", async () => {
        const conflictingTask = { ...task };
        Object.defineProperty(conflictingTask, "surface", { value: "agent" });
        mocks.read.mockRejectedValue(new Error("strict Canvas reader must not run"));
        mocks.normalize.mockRejectedValueOnce(new Error("one existing non-Canvas asset failed"));
        const results = ["https://cdn.example/a.png", "https://cdn.example/b.png"].map((remoteUrl) => ({ dataUrl: remoteUrl, remoteUrl }));
        await expect(prepareImageTaskResults(conflictingTask, { ...results[0], results }, "https://platform.example", "")).resolves.toHaveLength(1);
        expect(mocks.read).not.toHaveBeenCalled();
        expect(mocks.normalize).toHaveBeenCalledTimes(2);
    });
});
