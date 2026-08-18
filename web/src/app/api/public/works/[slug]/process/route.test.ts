import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    getProcess: vi.fn(),
    copy: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/public-work-process-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/public-work-process-service")>()),
    getPublicWorkProcess: mocks.getProcess,
    copyPublicWorkToPractice: mocks.copy,
}));

import { POST as copyToPractice } from "../copy-to-practice/route";
import { GET } from "./route";

const context = { params: Promise.resolve({ slug: "publicwork123" }) };

describe("public work process routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getProcess.mockResolvedValue({ sourceType: "canvas", versionId: "version-one", title: "公开画布", nodes: [], connections: [], assets: [] });
        mocks.copy.mockResolvedValue({ kind: "canvas", projectId: "practice-one", clientRequestId: "request-one" });
    });

    it("returns the sanitized current process with the shared response contract", async () => {
        const response = await GET(new Request("http://localhost/api/public/works/publicwork123/process"), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ code: 0, data: { process: expect.objectContaining({ versionId: "version-one" }) }, msg: "OK" });
        expect(mocks.getProcess).toHaveBeenCalledWith("publicwork123");
    });

    it("requires login before copying and forwards only the slug and client request id", async () => {
        mocks.currentUser.mockResolvedValueOnce(null);
        const denied = await copyToPractice(new Request("http://localhost/api/public/works/publicwork123/copy-to-practice", { method: "POST", body: JSON.stringify({ clientRequestId: "request-one" }) }), context);
        expect(denied.status).toBe(401);

        mocks.currentUser.mockResolvedValueOnce({ id: "student-one", role: "user", status: "active" });
        const response = await copyToPractice(
            new Request("http://localhost/api/public/works/publicwork123/copy-to-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "drama", versionId: "forged-version", clientRequestId: "request-one" }),
            }),
            context,
        );

        expect(response.status).toBe(200);
        expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ id: "student-one" }), "publicwork123", "request-one", "drama");
        expect(await response.json()).toMatchObject({ code: 0, data: { projectId: "practice-one" } });
    });
});
