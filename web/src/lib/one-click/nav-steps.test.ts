import { describe, expect, it } from "vitest";

import type { DramaEpisode, DramaNamedAsset, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { buildOneClickNavSteps, hasOneClickAssetImage, hasOneClickShotImage } from "./nav-steps";

/**
 * 基线：L `FilmCreate.vue` 的 `navSteps` computed（7 步 + 四态）。
 *
 * 这里是**真实行为测试**，不是对源码字符串断言 —— 状态判定错了会直接算出不同的 status。
 */
function asset(extra: Partial<DramaNamedAsset> = {}): DramaNamedAsset {
    return { id: "a1", name: "资产", description: "", ...extra } as DramaNamedAsset;
}

function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头",
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

function episode(shots: DramaShot[], script = ""): DramaEpisode {
    return { id: "e1", title: "第 1 集", script, outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots } as DramaEpisode;
}

function project(extra: Partial<DramaProject> = {}): DramaProject {
    return { id: "p1", title: "项目", characters: [], scenes: [], props: [], clues: [], episodes: [], ...extra } as unknown as DramaProject;
}

function statusOf(steps: ReturnType<typeof buildOneClickNavSteps>, key: string) {
    const found = steps.find((step) => step.key === key);
    if (!found) throw new Error("missing step: " + key);
    return found.status;
}

describe("one-click-film nav steps (L navSteps parity)", () => {
    it("exposes L's 7 steps in order with L's anchors", () => {
        const steps = buildOneClickNavSteps(project(), undefined);
        expect(steps.map((s) => s.key)).toEqual(["script", "chars", "props", "scenes", "sb", "sbimg", "video"]);
        expect(steps.map((s) => s.label)).toEqual(["故事剧本", "角色", "道具", "场景", "分镜脚本", "分镜图", "分镜视频"]);
        // L 里分镜脚本与分镜图共用 anchor-storyboard
        expect(steps.find((s) => s.key === "sb")?.anchor).toBe("anchor-storyboard");
        expect(steps.find((s) => s.key === "sbimg")?.anchor).toBe("anchor-storyboard");
        expect(steps.find((s) => s.key === "video")?.anchor).toBe("anchor-video");
    });

    it("marks every step pending on an empty project", () => {
        const steps = buildOneClickNavSteps(project(), undefined);
        expect(steps.every((s) => s.status === "pending")).toBe(true);
        expect(steps.every((s) => s.count === 0)).toBe(true);
    });

    it("marks script done only when the episode script is non-blank", () => {
        expect(statusOf(buildOneClickNavSteps(project(), episode([], "   ")), "script")).toBe("pending");
        expect(statusOf(buildOneClickNavSteps(project(), episode([], "正文")), "script")).toBe("done");
    });

    it("uses L's partial semantics: some assets lack images", () => {
        // L: charList.length > 0 && every(hasAssetImage) → done，否则 partial
        const partial = project({ characters: [asset({ id: "c1", referenceImageUrl: "/a.png" }), asset({ id: "c2" })] });
        expect(statusOf(buildOneClickNavSteps(partial, undefined), "chars")).toBe("partial");

        const done = project({ characters: [asset({ id: "c1", referenceImageUrl: "/a.png" }), asset({ id: "c2", references: [{ id: "r1", url: "/b.png" }] as never })] });
        expect(statusOf(buildOneClickNavSteps(done, undefined), "chars")).toBe("done");
    });

    it("counts assets per domain independently", () => {
        const steps = buildOneClickNavSteps(project({ characters: [asset(), asset()], props: [asset()], scenes: [asset(), asset(), asset()] }), undefined);
        expect(steps.find((s) => s.key === "chars")?.count).toBe(2);
        expect(steps.find((s) => s.key === "props")?.count).toBe(1);
        expect(steps.find((s) => s.key === "scenes")?.count).toBe(3);
    });

    it("treats a running storyboard task as generating, which outranks partial", () => {
        const ep = episode([shot({ id: "s1", storyboardImageUrl: "/x.png" }), shot({ id: "s2", storyboardStatus: "running" })]);
        expect(statusOf(buildOneClickNavSteps(project(), ep), "sbimg")).toBe("generating");
    });

    it("accepts queued and pending as running too", () => {
        for (const status of ["queued", "pending", "running"] as const) {
            const ep = episode([shot({ storyboardStatus: status })]);
            expect(statusOf(buildOneClickNavSteps(project(), ep), "sbimg")).toBe("generating");
        }
    });

    it("counts a first/last frame slot as having an image", () => {
        // L hasSbImage 覆盖首尾帧槽位，不只看经典主图
        const first = episode([shot({ frames: { first: { prompt: "p", status: "success", url: "/f.png" } } })]);
        expect(statusOf(buildOneClickNavSteps(project(), first), "sbimg")).toBe("done");
        const last = episode([shot({ frames: { last: { prompt: "p", status: "success", url: "/l.png" } } })]);
        expect(statusOf(buildOneClickNavSteps(project(), last), "sbimg")).toBe("done");
    });

    it("marks video done only when every shot has a video url", () => {
        expect(statusOf(buildOneClickNavSteps(project(), episode([shot({ videoUrl: "/v.mp4" }), shot({ id: "s2" })])), "video")).toBe("partial");
        expect(statusOf(buildOneClickNavSteps(project(), episode([shot({ videoUrl: "/v.mp4" })])), "video")).toBe("done");
    });

    it("keeps L's video count at 0 even when shots exist", () => {
        // L: { key: 'video', ..., count: 0 }
        expect(buildOneClickNavSteps(project(), episode([shot(), shot()])).find((s) => s.key === "video")?.count).toBe(0);
    });

    it("drives 分镜脚本 generating from the caller flag, not from shot fields", () => {
        const ep = episode([shot()]);
        expect(statusOf(buildOneClickNavSteps(project(), ep), "sb")).toBe("done");
        expect(statusOf(buildOneClickNavSteps(project(), ep, { scriptSplitting: true }), "sb")).toBe("generating");
        // 没有分镜时，拆解中也应显示 generating
        expect(statusOf(buildOneClickNavSteps(project(), episode([]), { scriptSplitting: true }), "sb")).toBe("generating");
    });

    it("ignores blank-only urls", () => {
        expect(hasOneClickAssetImage(asset({ referenceImageUrl: "   " }))).toBe(false);
        expect(hasOneClickShotImage(shot({ storyboardImageUrl: "  " }))).toBe(false);
        expect(hasOneClickShotImage(shot({ storyboardImageUrl: "/x.png" }))).toBe(true);
    });
});
