import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    practiceAccess: vi.fn(),
    settings: vi.fn(),
    candidates: vi.fn(),
    fetchInternalApi: vi.fn(),
    trustedHeaders: vi.fn(() => ({ "x-practice": "signed" })),
    mediaRegistration: vi.fn(),
    queryTasks: vi.fn(),
    createTask: vi.fn(),
    attachHistory: vi.fn(),
    getHistory: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.practiceAccess }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.settings }));
vi.mock("@/lib/server/runninghub-workflow-runtime", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/runninghub-workflow-runtime")>()), resolvePracticeGenerationCandidates: mocks.candidates }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: () => "http://internal.test" }));
vi.mock("@/lib/server/generation-execution-policy", () => ({ trustedPracticeTaskHeaders: mocks.trustedHeaders }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.mediaRegistration, isLocalMediaRegistrationExpired: () => false }));
vi.mock("@/lib/server/reference-asset-access", () => ({ createSignedReferenceAssetUrl: (key: string, origin: string, user: string) => `${origin}/api/reference-assets/${key}?owner=${user}` }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "https://app.example" }));

vi.mock("@/lib/server/generation-task-store", () => ({ queryStoredGenerationTasks: mocks.queryTasks, createStoredGenerationTask: mocks.createTask }));

vi.mock("@/lib/server/practice-reverse-prompt-history-store", () => ({ reversePromptHistoryEnabled: () => true, attachReversePromptHistory: mocks.attachHistory, getReversePromptHistory: mocks.getHistory }));

import * as route from "./route";
const { POST } = route;

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
        expect(payload.context).toMatchObject({ executionProfile: "open-source-practice", schoolId: "school-one", surface: "canvas" });
        expect(payload.config.model).toBe("practice-canvas-image");
        expect(payload.references[0].url).toBe("https://app.example/api/reference-assets/permanent/source.png?owner=student-one");
        expect(payload.mask.url).toContain("permanent/mask.png");
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
    it("requests fixed teaching structure for image analysis without losing user focus", async () => {
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ toolId: "reverse-prompt", sourceUrl: baseBody.sourceUrl, prompt: "重点观察配色", clientRequestId: "analysis-req" }) }));
        expect(response.status).toBe(200);
        const [url, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(String(url)).toContain("/api/text-tasks");
        const payload = JSON.parse(init.body);
        expect(payload.messages[0].content[0].text).toContain('"fullPrompt"');
        expect(payload.messages[0].content[0].text).toContain("重点观察配色");
        expect(payload.messages[0].content[1].image_url.url).toContain("permanent/source.png");
    });

    it("links reverse analysis to its durable source and settings without reading client-provided results", async () => {
        const payload = { toolId: "reverse-prompt", sourceUrl: baseBody.sourceUrl, clientRequestId: "analysis-req", reverseHistory: { mode: "detail", extraRequirement: "more detail" } };
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(payload) }));
        expect(response.status).toBe(200);
        expect(mocks.attachHistory).toHaveBeenCalledWith({ userId: "student-one", schoolId: "school-one" }, "task-one", { mode: "detail", extraRequirement: "more detail", sourceKey: "permanent/source.png" });
    });

    it("rejects trial submission pointing at someone else's record before generation", async () => {
        mocks.getHistory.mockResolvedValue(null);
        const payload = { toolId: "reverse-prompt", action: "try-generate", prompt: "a test photo", clientRequestId: "analysis-req", reverseHistoryId: "other-school-task" };
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(payload) }));
        expect(response.status).toBe(404);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("uses an allowed image-capable practice binding when the staging analysis defaults are empty", async () => {
        mocks.settings.mockResolvedValue({
            practiceDefaultModels: {},
            logicalModels: [
                { id: "ordinary-text", enabled: true, capability: "text" },
                { id: "visually-disabled", enabled: true, capability: "text" },
                { id: "practice-vision", enabled: true, capability: "text" },
            ],
            practiceModelPool: { pools: { vision: { "disabled-vision": false } } },
        });
        mocks.candidates.mockImplementation((_settings, _capability, id) => [{ upstreamModel: id === "visually-disabled" ? "disabled-vision" : id, capabilityProfile: { supportsImageInput: id !== "ordinary-text" } }]);
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ toolId: "reverse-prompt", sourceUrl: baseBody.sourceUrl, clientRequestId: "analysis-req" }) }));
        expect(response.status).toBe(200);
        expect(JSON.parse(mocks.fetchInternalApi.mock.calls[0][1].body).config.model).toBe("practice-vision");
    });

    it("does not submit analysis if the only practice binding lacks image input", async () => {
        mocks.settings.mockResolvedValue({ practiceDefaultModels: {}, logicalModels: [{ id: "ordinary-text", enabled: true, capability: "text" }] });
        mocks.candidates.mockReturnValue([{ upstreamModel: "ordinary-text", capabilityProfile: { supportsImageInput: false } }]);
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ toolId: "reverse-prompt", sourceUrl: baseBody.sourceUrl, clientRequestId: "analysis-req" }) }));
        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    const trialBody = { toolId: "reverse-prompt", action: "try-generate", prompt: "学生编辑后的猫咪三视图", clientRequestId: "trial-req" };

    it("dispatches one practice text-to-image task with no reference or mask", async () => {
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(trialBody) }));
        expect(response.status).toBe(200);
        expect(mocks.mediaRegistration).not.toHaveBeenCalled();
        expect(mocks.trustedHeaders).toHaveBeenCalledWith("student-one", "school-one", "trial-req");
        expect(mocks.candidates).toHaveBeenCalledWith(expect.anything(), "image", "gamaimage", { executionProfile: "open-source-practice" });
        const [url, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(String(url)).toContain("/api/image-tasks");
        const payload = JSON.parse(init.body);
        expect(payload).toMatchObject({ kind: "generation", prompt: trialBody.prompt, references: [], source: "practice", config: { model: "gamaimage" }, context: { executionProfile: "open-source-practice" } });
        expect(payload).not.toHaveProperty("mask");
    });

    it.each([{ sourceUrl: baseBody.sourceUrl }, { references: [] }, { maskUrl: baseBody.maskUrl }, { config: {} }, { model: "x" }, { toolId: "local-edit" }, { prompt: " " }])("rejects invalid trial overrides %j", async (override) => {
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify({ ...trialBody, ...override }) }));
        expect(response.status).toBe(400);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("does not use production when the practice image pool is unavailable", async () => {
        mocks.candidates.mockReturnValue([]);
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(trialBody) }));
        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("requires practice access for a trial", async () => {
        mocks.practiceAccess.mockRejectedValue(new Error("没有练习权限"));
        const response = await POST(new Request("http://localhost/api/practice/image-tools", { method: "POST", body: JSON.stringify(trialBody) }));
        expect(response.status).toBe(403);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});

describe("practice local-edit history", () => {
    const request = new Request("http://localhost/api/practice/image-tools?toolId=local-edit&userId=other-student");
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one" });
        mocks.practiceAccess.mockResolvedValue({ schoolId: "school-one" });
        mocks.queryTasks.mockResolvedValue([]);
    });

    it("requires login and active practice access", async () => {
        mocks.currentUser.mockResolvedValueOnce(null);
        expect((await route.GET(request)).status).toBe(401);
        mocks.practiceAccess.mockRejectedValueOnce(Object.assign(new Error("no access"), { status: 403 }));
        expect((await route.GET(request)).status).toBe(403);
        expect(mocks.queryTasks).not.toHaveBeenCalled();
    });

    it("uses the current student's recent local edits and returns only unsigned managed assets and their original instruction", async () => {
        const row = {
            id: "edit-one",
            createdAt: 123,
            prompt: "只修改蒙版标示区域，其余区域尽量保持原样。换成蓝色",
            config: { model: "practice-image", apiKey: "not-public" },
            upstreamPrompt: "not-public",
            references: [{ url: "https://other-host.example/api/reference-assets/permanent/source.png?signature=not-public" }],
            mask: { url: "/api/reference-assets/permanent/mask.png?signature=not-public" },
            result: { serverUrl: "/api/generation-log-assets/permanent/result.png", width: 100, height: 80 },
        };
        mocks.queryTasks.mockResolvedValue([row, { ...row, id: "unsafe", result: { serverUrl: "https://example.test/private-image.png" } }]);
        const response = await route.GET(request);
        expect(response.status).toBe(200);
        expect(mocks.queryTasks).toHaveBeenCalledWith("image", { userId: "student-one", statuses: ["success"], localEditSchoolId: "school-one", limit: 5 });
        const body = await response.json();
        expect(body.records).toEqual([
            expect.objectContaining({
                id: "edit-one",
                prompt: "换成蓝色",
                sourceUrl: "/api/reference-assets/permanent/source.png",
                maskUrl: "/api/reference-assets/permanent/mask.png",
                image: expect.objectContaining({ url: "/api/generation-log-assets/permanent/result.png" }),
            }),
        ]);
        expect(JSON.stringify(body)).not.toContain("not-public");
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });
});

const expression = { face: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, expressionId: "smile", intensity: "strong", excitement: 0.8, affinity: 0.2 };
const expressionUrl = "http://localhost/api/practice/image-tools";
const expressionRequest = () =>
    new Request(expressionUrl, { method: "POST", body: JSON.stringify({ toolId: "expression-reference", sourceUrl: baseBody.sourceUrl, clientRequestId: "expression-request", expression, prompt: "client text is not the source of truth" }) });

describe("expression history", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one", username: "student", displayName: "学生" });
        mocks.practiceAccess.mockResolvedValue({ schoolId: "school-one" });
        mocks.mediaRegistration.mockResolvedValue({ ownerUserId: "student-one", scope: "reference", type: "image" });
        mocks.settings.mockResolvedValue({ practiceDefaultModels: { imageModel: "practice-image" } });
        mocks.candidates.mockReturnValue([{ logicalModelId: "practice-image" }]);
        mocks.fetchInternalApi.mockResolvedValue(new Response(JSON.stringify({ task: { id: "expression-task" } })));
        mocks.createTask.mockImplementation(async (_type, task) => task);
    });

    it("sends only the prompt compiled from the selected expression", async () => {
        expect((await POST(expressionRequest())).status).toBe(200);
        const input = JSON.parse(mocks.fetchInternalApi.mock.calls[0][1].body);
        expect(input).toMatchObject({ practiceExpression: expression, prompt: expect.stringContaining("强烈地呈现“微笑”") });
        expect(input.prompt).not.toContain("client text");
    });

    it("persists an unsuccessful submission with its prompt, without contacting generation", async () => {
        mocks.candidates.mockReturnValue([]);
        const response = await POST(expressionRequest());
        expect(response.status).toBe(503);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(mocks.createTask).toHaveBeenCalledWith("image", expect.objectContaining({ status: "error", userId: "student-one", schoolId: "school-one", practiceExpression: expression }), expect.any(Number));
        expect((await response.json()).record).toMatchObject({ status: "error", selection: expression, sourceUrl: baseBody.sourceUrl });
    });

    it("returns scoped historical settings without signed URLs or task configuration", async () => {
        mocks.queryTasks.mockResolvedValue([
            { id: "expression-task", createdAt: 42, status: "error", practiceExpression: expression, config: { model: "practice-image", apiKey: "not-for-browser" }, prompt: "原始提示词", references: [{ url: baseBody.sourceUrl + "?secret=true" }] },
        ]);
        const response = await route.GET(new Request(expressionUrl + "?history=expression-reference"));
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(mocks.queryTasks).toHaveBeenCalledWith("image", { userId: "student-one", expressionSchoolId: "school-one", limit: 20 });
        const text = await response.text();
        expect(JSON.parse(text).records).toEqual([expect.objectContaining({ id: "expression-task", status: "error", sourceUrl: baseBody.sourceUrl, prompt: "原始提示词", selection: expression })]);
        expect(text).not.toMatch(/secret|not-for-browser/);
    });
});
