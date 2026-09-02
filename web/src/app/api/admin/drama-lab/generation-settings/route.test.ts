import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDatabaseProvider: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    hasAnyAdminPermission: vi.fn(),
    getFreshAuthSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAnyAdminPermission: mocks.hasAnyAdminPermission }));
vi.mock("@/lib/auth/store", () => ({ getFreshAuthSettings: mocks.getFreshAuthSettings }));
vi.mock("@/lib/server/database", () => ({ ensurePostgresSchema: mocks.ensurePostgresSchema, getDatabaseProvider: mocks.getDatabaseProvider }));

import { DELETE, GET, POST, PUT } from "./route";

const settings = () => ({
    generationConcurrency: { agent: 2, image: 7, video: 4, audio: 2, text: 4, render: 1 },
    generationDefaults: {
        canvasImageCount: 1,
        imageSize: "1:1",
        imageQuality: "auto",
        imageCount: 2,
        videoQuality: "720",
        videoSeconds: 5,
        audioVoice: "alloy",
        audioFormat: "mp3",
        dramaMaxBatchSize: 13,
        dramaImageTimeoutSeconds: 240,
        dramaVideoTimeoutSeconds: 2100,
    },
});

function requireResponse(response: Response | undefined): Response {
    if (!response) throw new Error("route handler did not return a response");
    return response;
}

describe("Drama Lab generation settings compatibility API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active" });
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.hasAnyAdminPermission.mockReturnValue(true);
        mocks.getFreshAuthSettings.mockResolvedValue(settings());
    });

    it("reads the legacy view from platform-wide settings", async () => {
        const response = requireResponse(await GET());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { imageConcurrency: 7, videoConcurrency: 4, maxBatchSize: 13, imageTimeout: 240, videoTimeout: 2100 } });
        expect(mocks.hasAnyAdminPermission).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-one" }), ["content.manage", "upstream.manage"]);
        expect(mocks.getFreshAuthSettings).toHaveBeenCalledOnce();
    });

    it("rejects all compatibility mutations with 410 after authorization", async () => {
        const handlers = [PUT, POST, DELETE];
        for (const handler of handlers) {
            const response = requireResponse(await handler());
            expect(response.status).toBe(410);
            expect(await response.json()).toMatchObject({ code: 410, data: null });
        }
        expect(mocks.getFreshAuthSettings).not.toHaveBeenCalled();
    });

    it("keeps compatibility mutations unavailable to content-only administrators", async () => {
        mocks.hasAnyAdminPermission.mockImplementation((_user, permissions: string[]) => permissions.includes("content.manage"));
        const response = requireResponse(await PUT());
        expect(response.status).toBe(401);
        expect(mocks.hasAnyAdminPermission).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-one" }), ["upstream.manage"]);
    });
});
