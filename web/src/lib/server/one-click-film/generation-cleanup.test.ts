import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { DramaProject, DramaShot, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
import { OneClickCleanupError, removeOneClickImageRecord, removeOneClickMergeRecord, removeOneClickVideoRecord } from "./generation-cleanup";

/**
 * 基线：L `DELETE /images/:id`（imageService.deleteById）、`DELETE /videos/:id`
 * （videoService.deleteById）、`DELETE /video-merges/:merge_id`。
 *
 * L 的关键行为不是"删掉那一行"，而是**顺带解除分镜对它的引用**，
 * 否则会留下悬空的 image_url / local_path。这里把这条锁死。
 */
function record(extra: Partial<DramaShotGenerationHistory> = {}): DramaShotGenerationHistory {
    return { id: "r1", taskId: "t1", url: "/api/reference-assets/a1", prompt: "p", createdAt: "2026-09-17T00:00:00.000Z", ...extra };
}

function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头1",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    } as DramaShot;
}

function project(shots: DramaShot[], renderTaskId?: string): DramaProject {
    return {
        id: "p1",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        episodes: [{ id: "e1", shots, ...(renderTaskId ? { renderTask: { id: renderTaskId, status: "success" } } : {}) }],
    } as unknown as DramaProject;
}

function shotOf(result: { project: DramaProject }) {
    return result.project.episodes[0].shots[0];
}

describe("one-click-film generation cleanup (L parity)", () => {
    it("removes the image record and reports it as removed", () => {
        const result = removeOneClickImageRecord(project([shot({ storyboardHistory: [record(), record({ id: "r2", taskId: "t2", url: "/u2" })] })]), "e1", "s1", "r1");
        expect(result.removed).toBe(1);
        expect(shotOf(result).storyboardHistory?.map((entry) => entry.id)).toEqual(["r2"]);
    });

    it("clears the main storyboard image when it pointed at the deleted record", () => {
        // 对应 L 清 image_url / local_path
        const current = shot({ storyboardHistory: [record()], storyboardImageUrl: "/api/reference-assets/a1", storyboardImageWidth: 100, storyboardImageHeight: 200 });
        const after = shotOf(removeOneClickImageRecord(project([current]), "e1", "s1", "r1"));
        expect(after.storyboardImageUrl).toBeUndefined();
        expect(after.storyboardImageWidth).toBeUndefined();
        expect(after.storyboardImageHeight).toBeUndefined();
    });

    it("keeps an unrelated main image intact", () => {
        const current = shot({ storyboardHistory: [record()], storyboardImageUrl: "/other" });
        expect(shotOf(removeOneClickImageRecord(project([current]), "e1", "s1", "r1")).storyboardImageUrl).toBe("/other");
    });

    it("unbinds first/last frames that referenced the deleted record", () => {
        // 对应 L 那两条 UPDATE storyboards SET first/last_frame_image_id = NULL
        const current = shot({
            storyboardHistory: [record()],
            frames: {
                first: { prompt: "f", status: "success", url: "/api/reference-assets/a1", storageKey: "a1", taskId: "t1", locked: true },
                last: { prompt: "l", status: "success", url: "/keep", storageKey: "b1", taskId: "t9" },
            },
        });
        const after = shotOf(removeOneClickImageRecord(project([current]), "e1", "s1", "r1"));
        expect(after.frames?.first?.url).toBeUndefined();
        expect(after.frames?.first?.storageKey).toBeUndefined();
        expect(after.frames?.first?.status).toBe("idle");
        // 锁定也要解开，否则界面显示"已锁定"却没有图
        expect(after.frames?.first?.locked).toBe(false);
        // 无关帧不能被动到
        expect(after.frames?.last?.url).toBe("/keep");
    });

    it("drops a first-frame candidate that came from the deleted record", () => {
        const current = shot({
            storyboardHistory: [record()],
            firstFrameCandidate: { id: "c1", frameType: "first", url: "/api/reference-assets/a1", source: "video_tail", sourceVideoTaskId: "t1" },
        } as Partial<DramaShot>);
        expect(shotOf(removeOneClickImageRecord(project([current]), "e1", "s1", "r1")).firstFrameCandidate).toBeUndefined();
    });

    it("removes the video record and clears a matching main video url", () => {
        const current = shot({ videoHistory: [record({ url: "/v1" })], videoUrl: "/v1" });
        const after = removeOneClickVideoRecord(project([current]), "e1", "s1", "r1");
        expect(after.removed).toBe(1);
        expect(shotOf(after).videoHistory).toEqual([]);
        expect(shotOf(after).videoUrl).toBeUndefined();
    });

    it("reports removed=0 for an unknown record so the route can answer 404 like L", () => {
        // L: if (!ok) return response.notFound(res, '记录不存在')
        expect(removeOneClickImageRecord(project([shot({ storyboardHistory: [record()] })]), "e1", "s1", "nope").removed).toBe(0);
        expect(removeOneClickVideoRecord(project([shot({ videoHistory: [record()] })]), "e1", "s1", "nope").removed).toBe(0);
        expect(removeOneClickMergeRecord(project([shot()], "m1"), "e1", "nope").removed).toBe(0);
    });

    it("removes the episode render record", () => {
        const after = removeOneClickMergeRecord(project([shot()], "m1"), "e1", "m1");
        expect(after.removed).toBe(1);
        expect(after.project.episodes[0].renderTask).toBeUndefined();
    });

    it("rejects unknown episodes and shots with 404", () => {
        expect(() => removeOneClickImageRecord(project([shot()]), "missing", "s1", "r1")).toThrow(OneClickCleanupError);
        expect(() => removeOneClickImageRecord(project([shot()]), "e1", "missing", "r1")).toThrow(OneClickCleanupError);
        try {
            removeOneClickImageRecord(project([shot()]), "missing", "s1", "r1");
        } catch (error) {
            expect((error as OneClickCleanupError).status).toBe(404);
        }
    });

    it("never mutates the input project in place", () => {
        const input = project([shot({ storyboardHistory: [record()] })]);
        removeOneClickImageRecord(input, "e1", "s1", "r1");
        expect(input.episodes[0].shots[0].storyboardHistory).toHaveLength(1);
    });
});

describe("one-click-film generation cleanup routes and UI", () => {
    const imageRoute = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/shots/[shotId]/images/[recordId]/route.ts");
    const videoRoute = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/shots/[shotId]/videos/[recordId]/route.ts");
    const mergeRoute = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/episodes/[episodeId]/render/[recordId]/route.ts");
    const editorPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-editor.tsx");
    const projectPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");

    it("answers 404 with L's message when nothing was removed", async () => {
        for (const path of [imageRoute, videoRoute, mergeRoute]) {
            const source = await readFile(path, "utf8");
            expect(source).toContain("if (!result.removed)");
            expect(source).toContain("记录不存在");
            expect(source).toContain('startsWith("one-click-film:")');
            // 纯数据清理，不该出现模型派发/计费身份
            expect(source).not.toContain("featureModule");
        }
    });

    it("exposes record deletion from the shot editor", async () => {
        const source = await readFile(editorPath, "utf8");
        expect(source).toContain('method: "DELETE"');
        expect(source).toContain("storyboardHistory");
        expect(source).toContain("videoHistory");
        expect(source).toContain("<Popconfirm");
        expect(source).toContain("aria-label={`删除${label}");
    });

    it("exposes render-record deletion from the workspace", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain("removeRenderRecord");
        expect(source).toContain('aria-label="删除本集成片记录"');
        expect(source).toContain("/render/${encodeURIComponent(renderTask.id)}");
    });
});
