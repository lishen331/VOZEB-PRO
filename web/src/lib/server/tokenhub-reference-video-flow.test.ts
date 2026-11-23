import { writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ffmpeg: vi.fn(), ffprobe: vi.fn(), fetch: vi.fn(), save: vi.fn() }));
vi.mock("./ffmpeg", () => ({ runFfmpeg: mocks.ffmpeg, runFfprobe: mocks.ffprobe }));
vi.mock("./safe-outbound-fetch", () => ({ fetchSafeOutbound: mocks.fetch }));
vi.mock("./reference-asset-store", () => ({ writeReferenceMediaFile: mocks.save }));
vi.mock("./reference-asset-access", () => ({ createSignedReferenceAssetUrl: () => "https://app.fixture/api/reference-assets/temporary/video.mp4?signature=fixture" }));

import { prepareTokenHubVideoReferences } from "./tokenhub-reference-video";

const channel = { channelId: "wD0cO6S6cyhbyvYIRDE28", model: "cdance2.0-0807", advancedConfig: { protocol: "seedance" } };
const video = { type: "video" as const, url: "https://media.fixture/reference.mp4" };
const context = { userId: "test-user", internalOrigin: "http://localhost", publicOrigin: "https://app.fixture", signal: new AbortController().signal };
const metadata = (fps: string) => ({ stdout: JSON.stringify({ streams: [{ width: 656, height: 1280, avg_frame_rate: fps, r_frame_rate: "30/1" }], format: { format_name: "mov,mp4", duration: "10.0", tags: { major_brand: "isom" } } }) });

describe("TokenHub reference conversion", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.fetch.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
        mocks.save.mockResolvedValue({ token: "temporary/video.mp4" });
        mocks.ffmpeg.mockImplementation(async (args: string[]) => writeFile(args.at(-1)!, new Uint8Array([4, 5, 6])));
    });

    it("does not download videos for unaffected channels", async () => {
        await expect(prepareTokenHubVideoReferences({ ...channel, channelId: "other" }, [video], false, context)).resolves.toEqual({ references: [video] });
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("passes through a compliant source and asks before converting a low average FPS", async () => {
        mocks.ffprobe.mockResolvedValueOnce(metadata("30/1")).mockResolvedValueOnce(metadata("201/10"));
        await expect(prepareTokenHubVideoReferences(channel, [video], false, context)).resolves.toEqual({ references: [video] });
        await expect(prepareTokenHubVideoReferences(channel, [video], false, context)).resolves.toMatchObject({ issues: [expect.stringContaining("20.1 FPS")] });
        expect(mocks.ffmpeg).not.toHaveBeenCalled();
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it.each([true, false])("uses a signed copy only after successful revalidation = %s", async (valid) => {
        mocks.ffprobe.mockResolvedValueOnce(metadata("201/10")).mockResolvedValueOnce(metadata(valid ? "30/1" : "201/10"));
        const result = await prepareTokenHubVideoReferences(channel, [video], true, context);
        expect(mocks.ffmpeg).toHaveBeenCalledTimes(1);
        expect(mocks.ffmpeg.mock.calls[0][0]).toContainEqual(expect.stringContaining("fps=30"));
        expect(mocks.save).toHaveBeenCalledTimes(valid ? 1 : 0);
        if (valid) expect(result.references?.[0].url).toContain("signature=fixture");
        else expect(result.error).toContain("转换后仍不符合要求");
        expect(video.url).toBe("https://media.fixture/reference.mp4");
    });
});
