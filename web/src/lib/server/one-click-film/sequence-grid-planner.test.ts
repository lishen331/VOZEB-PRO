import { describe, expect, it, vi } from "vitest";
import { buildSequencePanelRequest, planOneClickSequenceGrid } from "./sequence-grid-planner";
import { buildSequenceGridPrompt } from "./sequence-grid";
import type { DramaProject } from "@/lib/drama-project-contract";
const project = {
    id: "p",
    style: "写实",
    ratio: "16:9",
    characters: [],
    scenes: [],
    props: [],
    episodes: [{ id: "e", shots: [{ id: "s", title: "开门", description: "走到门边打开门", frames: { key: { prompt: "缓存不可复用" } } }] }],
} as unknown as DramaProject;
describe("L sequence grid planning parity", () => {
    it.each(["quad_grid", "nine_grid"] as const)("plans every %s cell separately with L's first/key/last timeline", async (mode) => {
        const generatePanel = vi.fn(async (input: { index: number; frameType: string; angle: string }) => `${input.index}:${input.frameType}:${input.angle}`);
        const result = await planOneClickSequenceGrid({ project, episodeId: "e", shotId: "s", mode }, { userId: "u", origin: "http://localhost", cookie: "", requestId: "r" }, generatePanel);
        const count = mode === "quad_grid" ? 4 : 9;
        expect(generatePanel).toHaveBeenCalledTimes(count);
        expect(generatePanel.mock.calls.map(([p]) => p.frameType)).toEqual(["first", ...Array(count - 2).fill("key"), "last"]);
        expect(new Set(generatePanel.mock.calls.map(([p]) => p.angle)).size).toBe(count);
        expect(result).toContain(`0:first:平视`);
        expect(result).toContain(`${count - 1}:last:`);
        expect(result).not.toContain("缓存不可复用");
        expect(result).not.toContain("same moment");
    });
    it("keeps L quad time progression and row positions instead of freezing all panels", () => {
        const prompt = buildSequenceGridPrompt({ mode: "quad_grid", panelPrompts: ["a", "b", "c", "d"] });
        expect(prompt).toContain("TOP ROW (left to right):");
        expect(prompt).toContain("initial state");
        expect(prompt).toContain("key action moment");
        expect(prompt).toContain("action continuation");
        expect(prompt).toContain("final state");
        expect(prompt).not.toContain("only the camera angle differs");
    });
});

describe("panel upstream context", () => {
    it("uses L first/key/last systems and prompts instead of a single-frame cache", () => {
        const requests = [0, 1, 3].map((index) => buildSequencePanelRequest({ project, episodeId: "e", shotId: "s", mode: "quad_grid" }, index));
        expect(requests.map((r) => r.frameType)).toEqual(["first", "key", "last"]);
        expect(new Set(requests.map((r) => r.systemPrompt)).size).toBe(3);
        expect(requests[0].userPrompt).toContain("请直接生成首帧");
        expect(requests[1].userPrompt).toContain("请直接生成关键帧");
        expect(requests[2].userPrompt).toContain("请直接生成尾帧");
        for (const request of requests) {
            expect(request.userPrompt).toContain("镜头描述: 走到门边打开门");
            expect(request.systemPrompt).not.toContain("{{");
        }
    });
    it("preserves L structured-angle precedence rather than silently overriding it", () => {
        const enriched = structuredClone(project);
        Object.assign(enriched.episodes[0].shots[0], { angleH: "front", angleV: "eye_level", angleS: "medium", layoutDescription: "小明站左边" });
        const request = buildSequencePanelRequest({ project: enriched, episodeId: "e", shotId: "s", mode: "quad_grid" }, 1);
        expect(request.angle).toBe("仰拍");
        expect(request.userPrompt).toContain("相机角度：中景·平视·正面");
        expect(request.userPrompt).toContain("小明站左边");
        expect(request.userPrompt).toContain("【核心锁定");
    });
    it("retains L nine-angle English labels", () => {
        const prompt = buildSequenceGridPrompt({ mode: "nine_grid", panelPrompts: Array(9).fill("帧") });
        expect(prompt).toContain("rear shot from behind the character");
        expect(prompt).toContain("extreme low angle (worm's eye view)");
        expect(prompt).toContain("extreme high angle (aerial top-down view)");
        expect(prompt).toContain("diagonal 45-degree angle shot");
    });
});
