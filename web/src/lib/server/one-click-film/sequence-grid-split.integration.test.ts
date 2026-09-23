import { writeFile } from "node:fs/promises";

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ download: vi.fn(), writeAsset: vi.fn(), persist: vi.fn() }));

vi.mock("@/lib/server/media-download", () => ({ downloadMediaToFile: mocks.download }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writeReferenceMediaFile: mocks.writeAsset }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, persistDramaLabShotUpdate: mocks.persist };
});

import { splitOneClickSequenceGrid } from "./sequence-grid-split";

// 造一张四色 2x2 网格图，每格纯色，便于按像素验证裁出来的是哪一格。
async function writeQuadFixture(path: string, size = 64) {
    const half = size / 2;
    const cell = (r: number, g: number, b: number) => ({ create: { width: half, height: half, channels: 3 as const, background: { r, g, b } } });
    const panels = await Promise.all([
        sharp(cell(255, 0, 0))
            .png()
            .toBuffer(),
        sharp(cell(0, 255, 0))
            .png()
            .toBuffer(),
        sharp(cell(0, 0, 255))
            .png()
            .toBuffer(),
        sharp(cell(255, 255, 0))
            .png()
            .toBuffer(),
    ]);
    const composed = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite([
            { input: panels[0], top: 0, left: 0 },
            { input: panels[1], top: 0, left: half },
            { input: panels[2], top: half, left: 0 },
            { input: panels[3], top: half, left: half },
        ])
        .png()
        .toBuffer();
    await writeFile(path, composed);
}

function project(): DramaProject {
    return {
        id: "project-one",
        title: "测试",
        summary: "",
        style: "写实",
        ratio: "9:16",
        status: "active",
        createdAt: "2026-09-01",
        updatedAt: "2026-09-18",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        sourceAssets: [],
        activeEpisodeId: "episode-one",
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "第1集",
                script: "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "雨夜来电",
                        description: "",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "站台上的女人",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 3,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                    },
                ],
            },
        ],
    } as unknown as DramaProject;
}

/**
 * 用真实 sharp 跑，验证的是像素层面的事：
 * 1. 每格裁的是正确象限（用纯色 fixture 反查）；
 * 2. 四格拼回去正好覆盖整图（无黑缝、无重叠）；
 * 3. 不烧角标 —— 裁出来的每格必须仍是纯色；
 * 4. 每格落一条候选，主图不被自动替换。
 */
describe("splitOneClickSequenceGrid with real sharp", () => {
    let captured: Array<{ data: Buffer; width: number; height: number; channels: number }> = [];
    beforeEach(() => {
        vi.resetAllMocks();
        let seq = 0;
        mocks.download.mockImplementation(async (_url: string, target: string) => {
            await writeQuadFixture(target);
            return { bytes: 1, mimeType: "image/png" };
        });
        captured = [];
        mocks.writeAsset.mockImplementation(async (path: string) => {
            seq += 1;
            // 服务在 finally 里删掉临时目录，所以必须在这里、文件还在时把像素读出来。
            const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
            captured.push({ data, width: info.width, height: info.height, channels: info.channels });
            return { token: `panel-${seq}`, url: `/api/reference-assets/panel-${seq}`, bytes: 1, mimeType: "image/png", storage: "local" as const, localPath: path };
        });
        mocks.persist.mockImplementation(async ({ project: current, patch }: { project: DramaProject; patch: Record<string, unknown> }) => {
            const next = structuredClone(current);
            Object.assign(next.episodes[0].shots[0], patch);
            return next;
        });
    });

    const base = { userId: "user-one", episodeId: "episode-one", shotId: "shot-one", sourceUrl: "/grid.png", taskId: "task-grid", origin: "http://localhost" };

    it("crops four seamless panels and records each as a candidate", async () => {
        const result = await splitOneClickSequenceGrid({ ...base, project: project(), mode: "quad_grid" });
        expect(result.panels).toHaveLength(4);
        expect(result.panels.map((panel) => panel.label)).toEqual(["平视", "仰拍", "俯拍", "侧面"]);
        // 四格面积之和等于整图，说明既没丢边也没重叠。
        expect(result.panels.reduce((sum, panel) => sum + panel.width * panel.height, 0)).toBe(64 * 64);

        const history = result.project.episodes[0].shots[0].storyboardHistory || [];
        expect(history).toHaveLength(4);
        // 机位标签只在文字里，供 UI 展示。
        // 每格一个独立 taskId：共用网格图那个会被回写的 taskId 去重整组清空。
        expect(history.map((entry) => entry.taskId)).toEqual(["task-grid:panel0", "task-grid:panel1", "task-grid:panel2", "task-grid:panel3"]);
        expect(history.map((entry) => entry.prompt)).toEqual(["[平视] 站台上的女人", "[仰拍] 站台上的女人", "[俯拍] 站台上的女人", "[侧面] 站台上的女人"]);
    });

    it("writes each panel from its own quadrant, not the same crop four times", async () => {
        await splitOneClickSequenceGrid({ ...base, project: project(), mode: "quad_grid" });
        expect(captured).toHaveLength(4);
        // fixture 每格纯色：左上红、右上绿、左下蓝、右下黄。
        const expected = [
            [255, 0, 0],
            [0, 255, 0],
            [0, 0, 255],
            [255, 255, 0],
        ];
        for (const [index, panel] of captured.entries()) {
            expect([panel.width, panel.height]).toEqual([32, 32]);
            // 取中心像素，避开任何潜在边缘插值。
            const center = (panel.width * Math.floor(panel.height / 2) + Math.floor(panel.width / 2)) * panel.channels;
            expect([panel.data[center], panel.data[center + 1], panel.data[center + 2]]).toEqual(expected[index]);
        }
    });

    it("leaves the panels label-free so a chosen frame carries no burnt-in text", async () => {
        await splitOneClickSequenceGrid({ ...base, project: project(), mode: "quad_grid" });
        const panel = captured[0];
        // 若像 L 那样在左上角烧了角标，这一格就不再是纯红色。
        const distinct = new Set<string>();
        for (let offset = 0; offset < panel.data.length; offset += panel.channels) distinct.add(`${panel.data[offset]},${panel.data[offset + 1]},${panel.data[offset + 2]}`);
        expect([...distinct]).toEqual(["255,0,0"]);
    });

    it("keeps the grid image as the main storyboard image instead of guessing a panel", async () => {
        const result = await splitOneClickSequenceGrid({ ...base, project: project(), mode: "quad_grid" });
        // 系统不替用户挑机位。
        expect(result.project.episodes[0].shots[0].storyboardImageUrl).toBeUndefined();
    });

    it("is idempotent per task so a re-split does not duplicate candidates", async () => {
        const once = await splitOneClickSequenceGrid({ ...base, project: project(), mode: "quad_grid" });
        const twice = await splitOneClickSequenceGrid({ ...base, project: once.project, mode: "quad_grid" });
        expect(twice.project.episodes[0].shots[0].storyboardHistory).toHaveLength(4);
    });

    it("splits nine panels for the 3x3 mode", async () => {
        const result = await splitOneClickSequenceGrid({ ...base, project: project(), mode: "nine_grid" });
        expect(result.panels).toHaveLength(9);
        expect(result.panels.reduce((sum, panel) => sum + panel.width * panel.height, 0)).toBe(64 * 64);
    });
});
