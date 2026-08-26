import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteCourseAttachments: vi.fn(),
    getCurrentUser: vi.fn(),
    storeCourseAttachment: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/course-attachment-service", () => ({ deleteCourseAttachments: mocks.deleteCourseAttachments, storeCourseAttachment: mocks.storeCourseAttachment }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: vi.fn() }));

import { DELETE, PUT } from "./route";

describe("admin course attachments route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["education.manage"] });
    });

    it("requires education.manage before reading an upload body", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: [] });
        const response = await PUT(new Request("http://localhost/api/admin/course-attachments", { method: "PUT", body: "file" }));

        expect(response.status).toBe(403);
        expect(mocks.storeCourseAttachment).not.toHaveBeenCalled();
    });

    it("passes the raw request stream and decoded file metadata to the service", async () => {
        const attachment = { title: "课程案例.zip", fileName: "课程案例.zip", url: "/api/reference-assets/permanent/file.zip", storageKey: "permanent/file.zip", mimeType: "application/zip", bytes: 4 };
        mocks.storeCourseAttachment.mockResolvedValue(attachment);
        const response = await PUT(
            new Request("http://localhost/api/admin/course-attachments", {
                method: "PUT",
                headers: { "content-type": "application/zip", "content-length": "4", "x-file-name": encodeURIComponent("课程案例.zip") },
                body: "file",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: attachment, msg: "课程附件已上传" });
        expect(mocks.storeCourseAttachment).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "admin-one", fileName: "课程案例.zip", declaredMimeType: "application/zip", contentLength: 4, body: expect.anything() }));
    });

    it("deletes uploaded keys through reference-aware cleanup", async () => {
        mocks.deleteCourseAttachments.mockResolvedValue({ deletedFiles: 1, deletedBytes: 4, blocked: [] });
        const response = await DELETE(
            new Request("http://localhost/api/admin/course-attachments", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ storageKeys: ["permanent/file.zip"] }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { deletedFiles: 1 }, msg: "课程附件已清理" });
        expect(mocks.deleteCourseAttachments).toHaveBeenCalledWith("admin-one", ["permanent/file.zip"]);
    });
});
