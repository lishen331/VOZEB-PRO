import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
const mocks = vi.hoisted(() => ({ user: vi.fn(), project: vi.fn(), exec: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.project }));
vi.mock("node:child_process", () => ({ execFileSync: mocks.exec }));
import { POST } from "./route";
const params = { params: Promise.resolve({ id: "p" }) };
function upload(name: string, bytes: BlobPart = "第一集\n夜色中的湖边") {
    const form = new FormData();
    form.set("file", new File([bytes], name));
    return new Request("http://localhost/api/one-click-film/projects/p/script-import", { method: "POST", body: form });
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.exec.mockImplementation(() => {
        throw new Error("converter missing");
    });
    mocks.user.mockResolvedValue({ id: "u" });
    mocks.project.mockResolvedValue({ id: "p", sourceHandoffId: "one-click-film:p" });
});
describe("one-click script file parsing (never persists)", () => {
    it.each(["故事.txt", "故事.md", "故事.markdown"])("decodes %s without changing the project", async (name) => {
        const response = await POST(upload(name), params);
        expect(response.status).toBe(200);
        expect((await response.json()).data).toMatchObject({ fileName: name, text: "第一集\n夜色中的湖边", sourceText: "第一集\n夜色中的湖边" });
        expect(mocks.project).toHaveBeenCalledWith("u", "p");
    });
    it("extracts actual DOCX paragraphs", async () => {
        const bytes = zipSync({ "word/document.xml": strToU8("<w:document><w:p><w:r><w:t>第一集</w:t></w:r></w:p><w:p><w:r><w:t>湖边</w:t></w:r></w:p></w:document>") });
        const response = await POST(upload("故事.docx", new Uint8Array(bytes)), params);
        expect((await response.json()).data.sourceText).toBe("第一集\n湖边");
    });
    it("parses DOC with an available converter", async () => {
        mocks.exec.mockImplementation((command: string) => (command === "antiword" ? Buffer.from("DOC正文") : Buffer.from("antiword")));
        const response = await POST(upload("故事.doc", "doc binary"), params);
        expect(response.status).toBe(200);
        expect((await response.json()).data.sourceText).toBe("DOC正文");
    });
    it("explains missing DOC converter with a 415 instead of silently returning binary text", async () => {
        const response = await POST(upload("故事.doc", "doc binary"), params);
        expect(response.status).toBe(415);
        expect((await response.json()).msg).toContain("antiword");
    });
    it("rejects unauthenticated and foreign module projects before parsing", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await POST(upload("x.txt"), params)).status).toBe(401);
        expect(mocks.project).not.toHaveBeenCalled();
        mocks.project.mockResolvedValue({ sourceHandoffId: "drama-lab:p" });
        expect((await POST(upload("x.txt"), params)).status).toBe(404);
    });
    it("returns useful errors for damaged DOCX, unsupported files and empty content", async () => {
        expect((await POST(upload("x.docx", "broken"), params)).status).toBe(415);
        expect((await POST(upload("x.pdf"), params)).status).toBe(415);
        expect((await POST(upload("x.txt", "  "), params)).status).toBe(400);
    });
    it("rejects oversized requests before buffering", async () => {
        const request = upload("x.txt");
        request.headers.set("content-length", String(21 * 1024 * 1024));
        expect((await POST(request, params)).status).toBe(413);
    });
    it("rejects malformed multipart and missing files", async () => {
        expect((await POST(new Request("http://localhost", { method: "POST", body: "not multipart" }), params)).status).toBe(400);
    });
});
