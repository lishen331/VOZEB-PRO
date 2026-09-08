import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIpContentFile: vi.fn(), requireVisibleIp: vi.fn() }));

vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({ getIpContentFile: mocks.getIpContentFile }),
    requireVisibleIp: mocks.requireVisibleIp,
}));
vi.mock("./school-access-service", () => ({ getSchoolContextForUser: vi.fn(), SchoolServiceError: class SchoolServiceError extends Error {} }));

import { getIpDetailForUser } from "./ip-library-service";

const now = "2026-09-08T00:00:00.000Z";

describe("IP library user service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireVisibleIp.mockResolvedValue({
            detail: {
                id: "ip-one",
                title: "星海计划",
                slug: "star-sea",
                summary: "",
                visibility: "public",
                status: "enabled",
                createdByUserId: "admin-one",
                createdAt: now,
                updatedAt: now,
                subIps: [
                    {
                        id: "child-one",
                        ipId: "ip-one",
                        title: "第一子 IP",
                        summary: "",
                        tags: [],
                        sortOrder: 0,
                        createdByUserId: "admin-one",
                        createdAt: now,
                        updatedAt: now,
                        items: [item("text", "file-text"), item("image", "file-image"), item("audio", "file-pending"), item("video", "file-missing")],
                    },
                ],
            },
        });
        mocks.getIpContentFile.mockImplementation(async (_ipId: string, fileId: string) => {
            if (fileId === "file-text") return { kind: "text", status: "ready", extractedText: "可用正文" };
            if (fileId === "file-image") return { kind: "image", status: "ready" };
            if (fileId === "file-pending") return { kind: "audio", status: "processing" };
            return null;
        });
    });

    it("only exposes content backed by a matching ready file", async () => {
        const result = await getIpDetailForUser("student-one", "ip-one");

        expect(result.subIps[0]?.items).toEqual([
            expect.objectContaining({ id: "text-file-text", textContent: "可用正文" }),
            expect.objectContaining({ id: "image-file-image", previewUrl: "/api/ip-library/ip-one/items/image-file-image/media?subIpId=child-one" }),
        ]);
    });
});

function item(kind: "text" | "image" | "audio" | "video", fileId: string) {
    return {
        id: `${kind}-${fileId}`,
        subIpId: "child-one",
        kind,
        category: kind === "text" ? "story_summary" : kind === "image" ? "character" : kind === "audio" ? "background_music" : "trailer",
        title: kind,
        summary: "",
        fileId,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
    };
}
