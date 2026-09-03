import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    importDramaLabProjectForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-project-archive", () => ({
    DramaLabProjectArchiveError: class DramaLabProjectArchiveError extends Error {
        constructor(
            message: string,
            readonly status = 422,
        ) {
            super(message);
        }
    },
    importDramaLabProjectForUser: mocks.importDramaLabProjectForUser,
}));

import { POST } from "./route";

describe("/api/drama-lab/projects/import", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.importDramaLabProjectForUser.mockResolvedValue({
            project: { id: "drama-imported", title: "导入项目" },
            mediaCount: 2,
            warnings: [],
        });
    });

    it("requires authentication before reading the archive", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/import", { method: "POST", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "application/zip" } }));
        expect(response.status).toBe(401);
        expect(mocks.importDramaLabProjectForUser).not.toHaveBeenCalled();
    });

    it("accepts a multipart archive and scopes import to the current user", async () => {
        const form = new FormData();
        form.set("file", new File([new Uint8Array([80, 75, 3, 4])], "project.zip", { type: "application/zip" }));
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/import", { method: "POST", body: form, headers: { cookie: "session=test" } }));
        expect(response.status).toBe(200);
        expect(mocks.importDramaLabProjectForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", cookie: "session=test", archive: expect.any(Uint8Array) }));
        expect(Array.from(mocks.importDramaLabProjectForUser.mock.calls[0][0].archive)).toEqual([80, 75, 3, 4]);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { project: { id: "drama-imported" }, mediaCount: 2 } });
    });

    it("rejects an empty upload", async () => {
        const form = new FormData();
        form.set("file", new File([], "empty.zip", { type: "application/zip" }));
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/import", { method: "POST", body: form }));
        expect(response.status).toBe(400);
        expect(mocks.importDramaLabProjectForUser).not.toHaveBeenCalled();
    });

    it("accepts a raw zip body for API clients", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/import", { method: "POST", body: new Uint8Array([80, 75, 3, 4]), headers: { "content-type": "application/zip" } }));
        expect(response.status).toBe(200);
        expect(Array.from(mocks.importDramaLabProjectForUser.mock.calls[0][0].archive)).toEqual([80, 75, 3, 4]);
    });
});
