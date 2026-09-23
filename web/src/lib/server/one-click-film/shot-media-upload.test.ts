import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
const mocks = vi.hoisted(() => ({ write: vi.fn(), persist: vi.fn(), metadata: vi.fn() }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.write }));
vi.mock("sharp", () => ({ default: () => ({ metadata: mocks.metadata }) }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => ({ ...(await vi.importActual("@/lib/server/drama-lab-shot-generation-service")), persistDramaLabShotUpdate: mocks.persist }));
import { uploadOneClickShotMedia } from "./shot-media-upload";
const shot = { id: "s", imagePrompt: "image", videoPrompt: "video" } as DramaShot;
const project = (extra: Partial<DramaShot> = {}) => ({ id: "p", sourceHandoffId: "one-click-film:p", episodes: [{ id: "e", shots: [{ ...shot, ...extra }] }] }) as DramaProject;
const call = (target: "image" | "video" | "first" | "last", extra: Partial<DramaShot> = {}, file = new File(["png"], "a.png", { type: "image/png" })) =>
    uploadOneClickShotMedia({ userId: "u", project: project(extra), episodeId: "e", shotId: "s", target, file });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ url: "/uploaded", token: "token" });
    mocks.metadata.mockResolvedValue({ width: 800, height: 600 });
    mocks.persist.mockImplementation(async (input) => ({ ...input.project, episodes: [{ id: "e", shots: [{ ...input.project.episodes[0].shots[0], ...input.patch }] }] }));
});
describe("one-click shot media upload", () => {
    it("uploads a classic image with dimensions, preserves previous history and detaches tasks", async () => {
        const result = await call("image", { storyboardImageUrl: "/old", storyboardTaskId: "old-task", storyboardStatus: "success" });
        expect(result.shot).toMatchObject({ storyboardImageUrl: "/uploaded", storyboardStatus: "success", storyboardImageWidth: 800, storyboardImageHeight: 600 });
        expect(result.shot.storyboardTaskId).toBeUndefined();
        expect(result.shot.storyboardHistory?.map((item) => item.url)).toEqual(["/old", "/uploaded"]);
        expect(mocks.persist.mock.calls[0][0].retryOnConflict).toBe(false);
    });
    it.each(["first", "last"] as const)("uploads %s slot independently", async (target) => {
        const result = await call(target, { frames: { key: { prompt: "k", status: "success", url: "/key" } } });
        expect(result.shot.frames?.[target]).toMatchObject({ source: "uploaded", width: 800, url: "/uploaded", status: "success" });
        expect(result.shot.frames?.key?.url).toBe("/key");
    });
    it("rejects locked slots and running replacements before storing anything", async () => {
        await expect(call("first", { frames: { first: { prompt: "", status: "success", locked: true } } })).rejects.toMatchObject({ status: 409 });
        await expect(call("image", { storyboardStatus: "running" })).rejects.toMatchObject({ status: 409 });
        await expect(call("video", { generationStatus: "running" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.write).not.toHaveBeenCalled();
    });
    it("uploads videos using platform media storage without invoking generation", async () => {
        const result = await call("video", { videoUrl: "/old.mp4" }, new File(["video"], "v.mp4", { type: "video/mp4" }));
        expect(result.shot.videoUrl).toBe("/uploaded");
        expect(result.shot.generationStatus).toBe("success");
        expect(mocks.write.mock.calls[0][1]).toBe("video");
    });
    it("rejects MIME mismatch and invalid image bytes", async () => {
        await expect(call("video")).rejects.toMatchObject({ status: 400 });
        mocks.metadata.mockRejectedValue(new Error("invalid"));
        await expect(call("image")).rejects.toMatchObject({ status: 400 });
        expect(mocks.write).not.toHaveBeenCalled();
    });
});
