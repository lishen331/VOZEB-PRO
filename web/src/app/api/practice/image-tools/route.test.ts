import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    practiceAccess: vi.fn(),
    settings: vi.fn(),
    candidates: vi.fn(),
    fetchInternalApi: vi.fn(),
    trustedHeaders: vi.fn(() => ({ "x-practice": "signed" })),
    mediaRegistration: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.practiceAccess }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.settings }));
vi.mock("@/lib/server/runninghub-workflow-runtime", () => ({ resolvePracticeGenerationCandidates: mocks.candidates }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: () => "http://internal.test" }));
vi.mock("@/lib/server/generation-execution-policy", () => ({ trustedPracticeTaskHeaders: mocks.trustedHeaders }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.mediaRegistration, isLocalMediaRegistrationExpired: () => false }));
vi.mock("@/lib/server/reference-asset-access", () => ({ createSignedReferenceAssetUrl: (key: string, origin: string, user: string) => `${origin}/api/reference-assets/${key}?owner=${user}` }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "https://app.example" }));

import { POST } from "./route";

const baseBody = { toolId: "local-edit", sourceUrl: "/api/reference-assets/permanent/source.png", maskUrl: "/api/reference-assets/permanent/mask.png", prompt: "把天空改成黄昏", clientRequestId: "req-image-tool" };

describe("POST /api/practice/image-tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one", role: "user" });
        mocks.practiceAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "membership-one", role: "student" });
        mocks.mediaRegistration.mockResolvedValue({ ownerUserId: "student-one", scope: "reference", type: "image", storageKey: "permanent/source.png" });
        mocks.settings.mockResolvedValue({ practiceDefaultModels: { imageModel: "practice-canvas-image", textModel: "practice-canvas-text" } });
        mocks.candidates.mockReturnValue([{ logicalModelId: "practice-canvas-image", channelId: "practice-channel" }]);
        mocks.fetchInternalApi.mockResolvedValue(new Response(JSON.stringify({ task: { id: "task-one", status: "pending" } }), { status: 200 }));
    });

    it("requires a logged in practice user", async () => {
        mocks.currentUser.mockResolvedValue(null);
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(baseBody) }));
        expect(response.status).toBe(401);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("rejects client-selected model or execution profile fields", async () => {
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ ...baseBody, model: "production-model", executionProfile: "production" }) }));
        expect(response.status).toBe(400);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("dispatches edit only through a server-resolved practice model with signed practice context", async () => {
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(baseBody) }));
        expect(response.status).toBe(200);
        expect(mocks.candidates).toHaveBeenCalledWith(expect.anything(), "image", "practice-canvas-image", expect.objectContaining({ executionProfile: "open-source-practice" }));
        expect(mocks.trustedHeaders).toHaveBeenCalledWith("student-one", "school-one", "req-image-tool");
        const [, requestInit] = mocks.fetchInternalApi.mock.calls[0];
        const payload = JSON.parse(requestInit.body);
        expect(payload.context).toMatchObject({ executionProfile: "open-source-practice", schoolId: "school-one", surface: "canvas", practiceImageTool: "local-edit" });
        expect(payload.config.model).toBe("practice-canvas-image");
        expect(payload.references[0].url).toBe("https://app.example/api/reference-assets/permanent/source.png?owner=student-one");
        expect(payload.mask.url).toContain("permanent/mask.png");
    });

    it("uses the dedicated vision default for reverse prompt, not the writing model", async () => {
        mocks.settings.mockResolvedValue({ practiceDefaultModels: { visionModel: "practice-vision", textModel: "practice-writer" } });
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ ...baseBody, toolId: "reverse-prompt", maskUrl: undefined }) }));
        expect(response.status).toBe(200);
        expect(mocks.candidates).toHaveBeenCalledWith(expect.anything(), "text", "practice-vision", expect.objectContaining({ practiceImageTool: "reverse-prompt", requiresImageInput: true }));
        const body = JSON.parse(mocks.fetchInternalApi.mock.calls[0][1].body);
        expect(body.config.model).toBe("practice-vision");
        expect(body.context.practiceImageTool).toBe("reverse-prompt");
        expect(body.messages[0].content[1]).toMatchObject({ type: "image_url" });
    });

    it("rejects a source image registered to a different user", async () => {
        mocks.mediaRegistration.mockResolvedValue({ ownerUserId: "other-student", scope: "reference", type: "image", storageKey: "permanent/source.png" });
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(baseBody) }));
        expect(response.status).toBe(400);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("does not fall back when the configured practice pool is unavailable", async () => {
        mocks.candidates.mockReturnValue([]);
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(baseBody) }));
        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});
