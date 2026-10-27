import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { ImageTask } from "./image-task-store";

const mocks = vi.hoisted(() => ({ persist: vi.fn(), normalize: vi.fn() }));
vi.mock("./media-task-diagnostic-store", () => ({ persistMediaDiagnostic: mocks.persist }));
vi.mock("./generation-log-repository", () => ({ normalizeAssets: mocks.normalize, deleteLocalAsset: vi.fn() }));
import { prepareImageTaskResults } from "./image-task-result-service";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalize.mockResolvedValue([{ url: "/api/generation-log-assets/permanent/image.png", width: 2, height: 3 }]);
});

it("records actual strict media reading and persistence for a historical source-only Canvas task", async () => {
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "blue" } })
        .png()
        .toBuffer();
    const task: ImageTask = {
        id: "historical-task",
        userId: "owner",
        username: "test",
        displayName: "Test",
        source: "canvas",
        kind: "generation",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
        config: { model: "image-model", apiFormat: "openai", apiKey: "system", baseUrl: "https://upstream.example" },
        prompt: "private prompt",
        references: [],
    };
    await prepareImageTaskResults(task, { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` }, "https://platform.example", "");
    expect(mocks.persist.mock.calls.map(([, event]) => event.phase)).toEqual(["result_media_start", "result_media_complete", "result_persist_start", "result_persist_complete"]);
    for (const [context] of mocks.persist.mock.calls) expect(context).toMatchObject({ taskId: "historical-task", userId: "owner", surface: "canvas" });
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phase: "result_media_complete", width: 2, height: 3, responseBytes: bytes.length }));
});
