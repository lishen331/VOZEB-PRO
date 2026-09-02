import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    importDramaLabNovelForUser: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));
vi.mock("@/lib/server/drama-lab-novel-import-service", () => ({
    DramaLabNovelImportError: class DramaLabNovelImportError extends Error {
        constructor(message: string, readonly status = 400) {
            super(message);
        }
    },
    importDramaLabNovelForUser: mocks.importDramaLabNovelForUser,
}));

import { DramaLabNovelImportError } from "@/lib/server/drama-lab-novel-import-service";
import { POST } from "./route";

describe("POST /api/drama-lab/projects/:id/import-novel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: { id: "project-one", episodes: [] }, ownerUserId: "user-one" });
        mocks.assertDramaLabStageAllowed.mockResolvedValue(undefined);
        mocks.importDramaLabNovelForUser.mockResolvedValue({ committed: false, fileName: "故事.txt", sourceCharacters: 2, sourceBytes: 6, drafts: [{ title: "第 1 集", script: "正文", sourceRange: "全文分段 1" }] });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await POST(jsonRequest({ sourceText: "正文" }), context("project-one"));

        expect(response.status).toBe(401);
        expect(mocks.importDramaLabNovelForUser).not.toHaveBeenCalled();
    });

    it("supports preview and forwards project ownership plus commit flag", async () => {
        const response = await POST(jsonRequest({ sourceText: "正文", fileName: "故事.md", targetCharacters: 100, commit: false }), context("project-one"));

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith({ userId: "user-one", projectId: "project-one", sourceText: "正文", fileName: "故事.md", targetCharacters: 100, commit: false });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { committed: false }, msg: "小说解析完成，请确认导入" });
    });

    it("accepts a multipart novel file and forwards its text metadata", async () => {
        const form = new FormData();
        form.append("file", new Blob(["第一章\n正文"], { type: "text/markdown" }), "故事.md");
        form.append("targetCharacters", "120");
        form.append("commit", "true");

        const response = await POST(
            new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", body: form }),
            context("project-one"),
        );

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith({ userId: "user-one", projectId: "project-one", sourceText: "第一章\n正文", fileName: "故事.md", targetCharacters: 120, commit: true });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { committed: false } });
    });

    it("returns domain errors with their status", async () => {
        mocks.importDramaLabNovelForUser.mockRejectedValue(new DramaLabNovelImportError("小说文件超过 2MB 限制", 413));

        const response = await POST(jsonRequest({ sourceText: "正文" }), context("project-one"));

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toMatchObject({ code: 413, msg: "小说文件超过 2MB 限制" });
    });
});

function jsonRequest(value: unknown) {
    return new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}

function context(id: string) {
    return { params: Promise.resolve({ id }) };
}
