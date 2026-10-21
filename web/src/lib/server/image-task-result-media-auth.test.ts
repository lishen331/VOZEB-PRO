import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    generationMediaProxyHeaders: vi.fn(),
    inlineRemoteImageResult: vi.fn(),
    normalizeAssets: vi.fn(),
}));

vi.mock("@/app/api/image-tasks/image-task-support", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/api/image-tasks/image-task-support")>()),
    inlineRemoteImageResult: mocks.inlineRemoteImageResult,
}));
vi.mock("@/lib/server/generation-media-authorization", () => ({ generationMediaProxyHeaders: mocks.generationMediaProxyHeaders }));
vi.mock("@/lib/server/generation-log-repository", () => ({ deleteLocalAsset: vi.fn(), normalizeAssets: mocks.normalizeAssets }));

import { prepareImageTaskResults } from "@/lib/server/image-task-result-service";
import type { ImageTask } from "@/lib/server/image-task-store";

describe("image task result media authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.generationMediaProxyHeaders.mockReturnValue({ "x-vozeb-pro-media-authorization": "signed-test-claim" });
        mocks.inlineRemoteImageResult.mockResolvedValue({ dataUrl: "data:image/png;base64,AQID", remoteUrl: "https://api.modelbay.io/result.png" });
        mocks.normalizeAssets.mockResolvedValue([{ serverUrl: "/api/reference-assets/permanent/result.png", url: "/api/reference-assets/permanent/result.png", bytes: 3, width: 1, height: 1, mimeType: "image/png" }]);
    });

    it("signs a routed image result for the actual upstream model, not the selected logical model", async () => {
        const remoteUrl = "https://api.modelbay.io/result.png";
        const task = {
            id: "image-task-one",
            userId: "user-one",
            source: "canvas",
            prompt: "test image",
            title: "test image",
            config: {
                model: "gpt-image-2-image-to-image",
                logicalModel: "gpt-image-2.5-sunburst",
                channelId: "channel-modelbay",
                baseUrl: "/api/ai/system/channel-modelbay",
            },
        } as unknown as ImageTask;

        const resultUrl = `https://gammatv.gammablue-x.com/api/ai/system/channel-modelbay/_media?url=${encodeURIComponent(remoteUrl)}`;
        await prepareImageTaskResults(task, { dataUrl: resultUrl, remoteUrl }, "https://gammatv.gammablue-x.com", "");

        expect(mocks.generationMediaProxyHeaders).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-one",
                taskType: "image",
                taskId: "image-task-one",
                channelId: "channel-modelbay",
                upstreamModel: "gpt-image-2-image-to-image",
                url: remoteUrl,
            }),
        );
        expect(mocks.inlineRemoteImageResult).toHaveBeenCalledWith(resultUrl, "https://gammatv.gammablue-x.com", "", remoteUrl, { "x-vozeb-pro-media-authorization": "signed-test-claim" });
    });
});
