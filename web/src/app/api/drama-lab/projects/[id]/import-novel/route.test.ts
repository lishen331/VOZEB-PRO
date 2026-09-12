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
        constructor(
            message: string,
            readonly status = 400,
        ) {
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
        mocks.importDramaLabNovelForUser.mockResolvedValue({ committed: false, fileName: "故事.txt", sourceCharacters: 2, sourceBytes: 6, sourceText: "正文", drafts: [{ title: "第 1 集", script: "正文", sourceRange: "全文分段 1" }] });
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
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { committed: false, sourceText: "正文" }, msg: "小说解析完成，请确认导入" });
    });

    it("accepts a multipart novel file and forwards its text metadata", async () => {
        const form = new FormData();
        form.append("file", new Blob(["第一章\n正文"], { type: "text/markdown" }), "故事.md");
        form.append("targetCharacters", "120");
        form.append("commit", "true");

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", body: form }), context("project-one"));

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith({ userId: "user-one", projectId: "project-one", sourceText: "第一章\n正文", fileName: "故事.md", targetCharacters: 120, commit: true });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { committed: false } });
    });

    it("decodes a legacy GB18030 multipart file before parsing", async () => {
        const form = new FormData();
        form.append("file", new Blob([Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4])], { type: "text/plain" }), "故事.txt");

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", body: form }), context("project-one"));

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith({ userId: "user-one", projectId: "project-one", sourceText: "中文", fileName: "故事.txt", targetCharacters: 0, commit: false });
    });

    it("returns a client error for an undecodable multipart file", async () => {
        const form = new FormData();
        form.append("file", new Blob([Uint8Array.from([0x81])], { type: "text/plain" }), "故事.txt");

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", body: form }), context("project-one"));

        expect(response.status).toBe(415);
        expect(mocks.importDramaLabNovelForUser).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ code: 415 });
    });

    it("preserves multipart boundary casing while buffering the upload", async () => {
        const boundary = "----VozebBoundaryAaBb";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="故事.md"',
            "Content-Type: text/markdown",
            "",
            "第一章\n正文",
            `--${boundary}`,
            'Content-Disposition: form-data; name="commit"',
            "",
            "false",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` }, body }), context("project-one"));

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith(expect.objectContaining({ fileName: "故事.md", sourceText: "第一章\n正文", commit: false }));
    });
    it("accepts a DOCX multipart file and extracts Word paragraphs on the server", async () => {
        const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一章</w:t></w:r></w:p><w:p><w:r><w:t>中文正文 &amp; 继续</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>下一段</w:t></w:r></w:p></w:body></w:document>`;
        const docx = new Uint8Array(await import("fflate").then(({ zipSync }) => zipSync({ "word/document.xml": new TextEncoder().encode(documentXml) })));
        const form = new FormData();
        form.append("file", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "故事.docx");

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/import-novel", { method: "POST", body: form }), context("project-one"));

        expect(response.status).toBe(200);
        expect(mocks.importDramaLabNovelForUser).toHaveBeenCalledWith(expect.objectContaining({ fileName: "故事.docx", sourceText: "第一章\n中文正文 & 继续\t下一段", commit: false }));
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
