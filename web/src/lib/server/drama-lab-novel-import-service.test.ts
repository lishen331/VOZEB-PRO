import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createDramaProjectVersionForUser: vi.fn(),
    getDramaProjectForUser: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-service", () => ({
    createDramaProjectVersionForUser: mocks.createDramaProjectVersionForUser,
    getDramaProjectForUser: mocks.getDramaProjectForUser,
    updateDramaProjectForUser: mocks.updateDramaProjectForUser,
}));

import { DramaLabNovelImportError, importDramaLabNovelForUser, previewDramaLabNovelImport } from "./drama-lab-novel-import-service";

describe("drama lab novel import", () => {
    const project = {
        id: "project-one",
        title: "短剧",
        summary: "原故事",
        style: "现代",
        ratio: "9:16",
        status: "active" as const,
        characters: [{ id: "character-one", name: "甲" }],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard" as const,
        activeEpisodeId: "episode-old",
        episodes: [{ id: "episode-old", episodeNumber: 1, title: "第一集", script: "旧剧本", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [] }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDramaProjectForUser.mockResolvedValue(project);
        mocks.createDramaProjectVersionForUser.mockResolvedValue({ id: "version-one", projectId: project.id, version: 1, reason: "整本小说导入前", createdAt: "2026-09-01T00:00:01.000Z" });
        mocks.updateDramaProjectForUser.mockImplementation(async (_userId: string, _id: string, value: unknown) => value);
    });

    it("recognizes Markdown chapter headings and preserves source ranges", () => {
        const result = previewDramaLabNovelImport({ sourceText: "# 第一章 归来\n她推开门。\n\n## 第二章 真相\n门后没有人。", fileName: "故事.md" });

        expect(result.fileName).toBe("故事.md");
        expect(result.drafts).toHaveLength(2);
        expect(result.drafts[0]).toMatchObject({ sourceRange: "第一章 归来", title: "第 1 集 · 第一章 归来" });
        expect(result.drafts[0]?.script).toContain("# 第一章 归来");
        expect(result.drafts[1]?.sourceRange).toBe("第二章 真相");
    });

    it("falls back to length-based episodes for unstructured text", () => {
        const result = previewDramaLabNovelImport({ sourceText: "甲".repeat(201), targetCharacters: 100 });

        expect(result.drafts.map((draft) => draft.script.length)).toEqual([100, 100, 1]);
        expect(result.drafts.map((draft) => draft.sourceRange)).toEqual(["全文分段 1", "全文分段 2", "全文分段 3"]);
    });

    it("creates a restore version before replacing episodes and keeps assets untouched", async () => {
        const result = await importDramaLabNovelForUser({ userId: "user-one", projectId: project.id, sourceText: "第一章\n新剧本", fileName: "故事.txt", commit: true });

        expect(mocks.createDramaProjectVersionForUser).toHaveBeenCalledWith("user-one", project.id, { reason: "整本小说导入前", snapshot: project });
        expect(mocks.updateDramaProjectForUser).toHaveBeenCalledWith("user-one", project.id, expect.objectContaining({ characters: project.characters, episodes: [expect.objectContaining({ sourceRange: "第一章" })] }));
        expect(result).toMatchObject({ committed: true, versionId: "version-one" });
    });

    it("returns a preview without reading or changing a project", async () => {
        const result = await importDramaLabNovelForUser({ userId: "user-one", projectId: project.id, sourceText: "正文", commit: false });

        expect(result.committed).toBe(false);
        expect(mocks.getDramaProjectForUser).not.toHaveBeenCalled();
        expect(mocks.createDramaProjectVersionForUser).not.toHaveBeenCalled();
        expect(mocks.updateDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("rejects unsupported files and oversized source before project access", async () => {
        expect(() => previewDramaLabNovelImport({ sourceText: "正文", fileName: "故事.pdf" })).toThrowError(DramaLabNovelImportError);
        expect(previewDramaLabNovelImport({ sourceText: "正文", fileName: "故事.docx" }).fileName).toBe("故事.docx");
        expect(() => previewDramaLabNovelImport({ sourceText: "甲".repeat(2 * 1024 * 1024), fileName: "故事.txt" })).toThrowError(/2MB/iu);
        expect(mocks.getDramaProjectForUser).not.toHaveBeenCalled();
    });
});
