import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildStoryboardNarrationSrt, buildStoryboardXlsx, storyboardExportFilename, type StoryboardExportInput } from "./drama-lab-storyboard-export";

const input: StoryboardExportInput = {
    projectTitle: "测试/项目",
    episode: { id: "episode-2", number: 2 },
    scenes: [{ id: "scene", location: "客厅", time: "夜", description: "暖光" }],
    characters: [{ id: "actor", name: "林", description: "年轻女子" }],
    props: [{ id: "prop", name: "信", description: "旧信封" }],
    shots: [
        { id: "later", episodeId: "episode-2", shotNumber: 3, duration: 1.25, narration: " 最后一句\r\n继续 ", dialogue: "不导出的对白" },
        { id: "other-episode", episodeId: "episode-1", shotNumber: 1, duration: 99, narration: "另一集" },
        { id: "silent", episodeId: "episode-2", shotNumber: 2, duration: 2.5, narration: " ", dialogue: "只有对白" },
        {
            id: "first",
            episodeId: "episode-2",
            shotNumber: 1,
            duration: 1.001,
            narration: "第一句",
            title: "=SUM(1,2)",
            sceneId: "scene",
            characterIds: ["actor"],
            propIds: ["prop"],
            description: "画面描述",
            sourceText: "原文",
            dialogue: "中文对白",
            cameraMotion: "缓慢推进",
            imagePrompt: "图片",
            polishedPrompt: "润色图片",
            videoPrompt: "视频",
            frames: { first: { prompt: "首帧" }, last: { prompt: "尾帧" } },
            universalSegmentText: "全能片段",
        },
    ],
};

describe("storyboard episode exports", () => {
    it("encodes narration only with sequential cue numbers and gaps for silent shots", () => {
        const result = buildStoryboardNarrationSrt(input);
        expect(result).toBe("1\n00:00:00,000 --> 00:00:01,001\n第一句\n\n2\n00:00:03,501 --> 00:00:04,751\n最后一句\n继续\n");
        expect(new TextDecoder().decode(new TextEncoder().encode(result))).toBe(result);
    });
    it("uses the production five-second fallback for missing/nonpositive duration", () => {
        expect(
            buildStoryboardNarrationSrt({
                ...input,
                shots: [
                    { id: "one", episodeId: "episode-2", shotNumber: 1, duration: NaN },
                    { id: "two", episodeId: "episode-2", shotNumber: 2, duration: 0, narration: "解说" },
                ],
            }),
        ).toBe("1\n00:00:05,000 --> 00:00:10,000\n解说\n");
    });
    it("formats hour boundaries and removes blank cue separators inside narration", () => {
        expect(
            buildStoryboardNarrationSrt({
                ...input,
                shots: [
                    { id: "one", episodeId: "episode-2", shotNumber: 1, duration: 3599.75 },
                    { id: "two", episodeId: "episode-2", shotNumber: 2, duration: 1, narration: "第一行\n\n第二行" },
                ],
            }),
        ).toBe("1\n00:59:59,750 --> 01:00:00,750\n第一行\n第二行\n");
    });
    it("reports empty episode and no narration without inventing subtitle text", async () => {
        const empty = { ...input, shots: [] };
        await expect(buildStoryboardXlsx(empty)).rejects.toThrow("当前集暂无分镜");
        expect(() => buildStoryboardNarrationSrt(empty)).toThrow("当前集暂无分镜");
        expect(() => buildStoryboardNarrationSrt({ ...input, shots: [{ id: "one", episodeId: "episode-2", shotNumber: 1, duration: 5, dialogue: "对白", script: "原文" }] })).toThrow("当前分镜没有可导出的解说文案");
    });
    it("writes an actual XLSX and decodes one row per saved current-episode shot", async () => {
        const before = structuredClone(input);
        const bytes = await buildStoryboardXlsx(input);
        expect([...new Uint8Array(bytes).slice(0, 2)]).toEqual([0x50, 0x4b]);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(new Uint8Array(bytes).buffer);
        const sheet = workbook.getWorksheet("分镜表")!;
        expect(sheet.rowCount).toBe(4);
        expect(sheet.getCell("A2").value).toBe(1);
        expect(sheet.getCell("B4").value).toBe(3);
        expect(sheet.getCell("C2").value).toBe("=SUM(1,2)");
        expect(sheet.getCell("C2").type).toBe(ExcelJS.ValueType.String);
        expect(sheet.getCell("E2").value).toBe(1.001);
        expect(sheet.getCell("G2").value).toBe("缓慢推进");
        expect(sheet.getCell("H2").value).toBe("客厅\n时间：夜\n描述：暖光");
        expect(sheet.getCell("I2").value).toBe("林\n描述：年轻女子");
        expect(sheet.getCell("J2").value).toBe("信\n描述：旧信封");
        expect(sheet.getCell("N2").value).toBe("中文对白");
        expect(sheet.getCell("O2").value).toBe("第一句");
        expect(sheet.getCell("T2").value).toBe("首帧");
        expect(sheet.getCell("U2").value).toBe("尾帧");
        expect(sheet.getCell("V2").value).toBe("润色图片");
        expect(sheet.getCell("W2").value).toBe("视频");
        expect(sheet.getCell("X2").value).toBe("全能片段");
        expect(input).toEqual(before);
    });
    it("creates safe descriptive current-episode filenames", () => {
        expect(storyboardExportFilename(input, "xlsx")).toBe("测试_项目-第2集-分镜表.xlsx");
        expect(storyboardExportFilename(input, "srt")).toBe("测试_项目-第2集-解说.srt");
    });
});
