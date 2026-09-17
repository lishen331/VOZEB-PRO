import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { OneClickShotCrudError, createOneClickShot, deleteOneClickShot, insertOneClickShotBefore, updateOneClickShot } from "./shot-crud";

/**
 * 基线是 LocalMiniDrama `storyboardService.js`：
 * - createStoryboard 落库即 status='pending'
 * - insertBeforeStoryboard 把目标及其后序号 +1，继承 segment_index/segment_title
 * - updateStoryboard 只写 allowed 白名单，且「角色勾选变更不删除 frame_prompts」
 */
function shot(id: string, order: number, extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id,
        order,
        title: `镜头${order}`,
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
    };
}

function project(shots: DramaShot[]): DramaProject {
    return {
        id: "project-one",
        sourceHandoffId: "one-click-film:abc",
        characters: [{ id: "character-a", name: "角色A" }],
        scenes: [{ id: "scene-a", name: "场景A" }],
        props: [{ id: "prop-a", name: "道具A" }],
        clues: [],
        episodes: [{ id: "episode-one", shots }],
    } as unknown as DramaProject;
}

describe("one-click-film shot CRUD (L parity)", () => {
    it("creates a shot appended with a continuous order and pending status", () => {
        const { project: next, shot: created } = createOneClickShot(project([shot("s1", 1)]), "episode-one", { title: "新镜头" });
        const shots = next.episodes[0].shots;
        expect(shots).toHaveLength(2);
        expect(created.order).toBe(2);
        expect(created.title).toBe("新镜头");
        // L createStoryboard 固定写入 pending
        expect(created.storyboardStatus).toBe("pending");
        expect(created.creationMode).toBe("classic");
    });

    it("inserts before a target, shifting later orders and inheriting segment info", () => {
        const source = project([shot("s1", 1, { segmentIndex: 4, segmentTitle: "第四段" }), shot("s2", 2)]);
        const { project: next, shot: inserted } = insertOneClickShotBefore(source, "episode-one", "s1");
        const shots = next.episodes[0].shots;

        expect(shots.map((item) => item.id)).toEqual([inserted.id, "s1", "s2"]);
        // 序号必须保持 1 起连续
        expect(shots.map((item) => item.order)).toEqual([1, 2, 3]);
        // L 继承目标的 segment_index / segment_title
        expect(inserted.segmentIndex).toBe(4);
        expect(inserted.segmentTitle).toBe("第四段");
        expect(inserted.storyboardStatus).toBe("pending");
    });

    it("only writes whitelisted fields and never clears frame state", () => {
        const frames = { key: { prompt: "关键帧提示词", status: "success" as const, url: "https://cdn/key.png" } };
        const source = project([shot("s1", 1, { frames, storyboardImageUrl: "https://cdn/key.png" })]);
        const { shot: updated } = updateOneClickShot(source, "episode-one", "s1", {
            title: "改后标题",
            universalSegmentText: "全能文本",
            // 白名单外的字段必须被忽略
            id: "hacked",
            order: 99,
            storyboardStatus: "success",
        } as never);

        expect(updated.title).toBe("改后标题");
        expect(updated.universalSegmentText).toBe("全能文本");
        expect(updated.id).toBe("s1");
        expect(updated.order).toBe(1);
        // L 明确：角色/字段变更不得删除已保存的首尾帧提示词
        expect(updated.frames).toEqual(frames);
    });

    it("replaces asset links wholesale but rejects ids outside the project", () => {
        const source = project([shot("s1", 1, { characterIds: ["character-a"] })]);
        const { shot: updated } = updateOneClickShot(source, "episode-one", "s1", { characterIds: [], propIds: ["prop-a"], sceneId: "scene-a" });
        expect(updated.characterIds).toEqual([]);
        expect(updated.propIds).toEqual(["prop-a"]);
        expect(updated.sceneId).toBe("scene-a");

        // 规范禁止幽灵资产
        expect(() => updateOneClickShot(source, "episode-one", "s1", { characterIds: ["ghost"] })).toThrow(OneClickShotCrudError);
        expect(() => updateOneClickShot(source, "episode-one", "s1", { propIds: ["ghost"] })).toThrow("道具不存在");
        expect(() => updateOneClickShot(source, "episode-one", "s1", { sceneId: "ghost" })).toThrow("场景不存在");
    });

    it("persists the three creation/frame modes L supports", () => {
        const source = project([shot("s1", 1)]);
        // 经典单图 → 首尾帧：L 靠 storyboardFrameMode !== "single" 判定
        const firstLast = updateOneClickShot(source, "episode-one", "s1", { storyboardFrameMode: "first_last" }).shot;
        expect(firstLast.storyboardFrameMode).toBe("first_last");

        const single = updateOneClickShot(source, "episode-one", "s1", { storyboardFrameMode: "single" }).shot;
        expect(single.storyboardFrameMode).toBe("single");

        // 全能模式
        const universal = updateOneClickShot(source, "episode-one", "s1", { creationMode: "universal", universalSegmentText: "全能文本" }).shot;
        expect(universal.creationMode).toBe("universal");
        expect(universal.universalSegmentText).toBe("全能文本");
    });

    it("deletes a shot and keeps the remaining order continuous", () => {
        const next = deleteOneClickShot(project([shot("s1", 1), shot("s2", 2), shot("s3", 3)]), "episode-one", "s2");
        expect(next.episodes[0].shots.map((item) => item.id)).toEqual(["s1", "s3"]);
        expect(next.episodes[0].shots.map((item) => item.order)).toEqual([1, 2]);
    });

    it("reports missing episode and shot distinctly", () => {
        const source = project([shot("s1", 1)]);
        expect(() => createOneClickShot(source, "nope", {})).toThrow("分集不存在");
        expect(() => updateOneClickShot(source, "episode-one", "nope", {})).toThrow("分镜不存在");
        expect(() => deleteOneClickShot(source, "episode-one", "nope")).toThrow("分镜不存在");
        expect(() => insertOneClickShotBefore(source, "episode-one", "nope")).toThrow("目标分镜不存在");
    });

    it("does not mutate the input project", () => {
        const source = project([shot("s1", 1)]);
        const snapshot = structuredClone(source);
        createOneClickShot(source, "episode-one", { title: "x" });
        updateOneClickShot(source, "episode-one", "s1", { title: "y" });
        deleteOneClickShot(source, "episode-one", "s1");
        expect(source).toEqual(snapshot);
    });
});
