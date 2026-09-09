import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requirePracticeAccess: vi.fn(),
    validateIpReferences: vi.fn(),
    recordIpReferenceUsage: vi.fn(),
    getTextTask: vi.fn(),
    getImageTask: vi.fn(),
    getVideoTask: vi.fn(),
    getAudioTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    ensureAudioLog: vi.fn(),
}));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({
    normalizeIpReferences: (value: unknown) => (Array.isArray(value) ? value : []),
    validateIpReferences: mocks.validateIpReferences,
    recordIpReferenceUsage: mocks.recordIpReferenceUsage,
}));
vi.mock("@/lib/server/text-task-store", () => ({ getTextTask: mocks.getTextTask }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/audio-task-runtime", () => ({ ensurePracticeAudioGenerationLog: mocks.ensureAudioLog }));
vi.mock("@/lib/server/generation-task-store", () => ({ getStoredGenerationTaskByRequest: mocks.getStoredGenerationTaskByRequest }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: () => "file", createPostgresRepositories: vi.fn() }));

import {
    createPracticeSessionForUser,
    getPracticeSessionForUser,
    normalizePracticeModuleInput,
    publicPracticeSession,
    resolvePracticeModelFromSettings,
    retryPracticeSessionForUser,
    type PracticeSessionStore,
    type PracticeTaskDispatchResult,
} from "./practice-session-service";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import type { PracticeSessionRecord } from "./database/repository-types";

function memoryStore(): PracticeSessionStore {
    const records = new Map<string, PracticeSessionRecord>();
    const requests = new Map<string, string>();
    return {
        getByRequest: vi.fn(async (userId, clientRequestId) => records.get(requests.get(`${userId}:${clientRequestId}`) || "") || null),
        create: vi.fn(async (input) => {
            const key = `${input.userId}:${input.clientRequestId}`;
            const existing = records.get(requests.get(key) || "");
            if (existing) return existing;
            const record = { ...input, executionProfile: "open-source-practice", createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z" };
            records.set(input.id, record);
            requests.set(key, input.id);
            return record;
        }),
        get: vi.fn(async (userId, id) => {
            const record = records.get(id);
            if (!record || record.userId !== userId) return null;
            return record;
        }),
        claimDispatch: vi.fn(async (userId, id) => {
            const record = records.get(id);
            if (!record || record.userId !== userId || record.status !== "queued" || (Array.isArray(record.taskRefs) && record.taskRefs.length)) return null;
            const claimed = { ...record, status: "running" as const };
            records.set(id, claimed);
            return claimed;
        }),
        resetForRetry: vi.fn(async (userId, id) => {
            const record = records.get(id);
            if (!record || record.userId !== userId || (record.status !== "failed" && record.status !== "cancelled" && !(record.status === "running" && (!Array.isArray(record.taskRefs) || !record.taskRefs.length)))) return null;
            const reset = { ...record, status: "queued" as const, taskRefs: [] };
            records.set(id, reset);
            return reset;
        }),
        update: vi.fn(async (userId, id, patch) => {
            const record = records.get(id);
            if (!record || record.userId !== userId) return null;
            const updated = { ...record, ...patch };
            records.set(id, updated);
            return updated;
        }),
        delete: vi.fn(async (userId, id) => {
            const record = records.get(id);
            if (!record || record.userId !== userId) return;
            records.delete(id);
        }),
    };
}

describe("practice sessions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.validateIpReferences.mockResolvedValue([]);
        mocks.recordIpReferenceUsage.mockResolvedValue(undefined);
        mocks.getTextTask.mockResolvedValue(undefined);
        mocks.getImageTask.mockResolvedValue(undefined);
        mocks.getVideoTask.mockResolvedValue(undefined);
        mocks.getAudioTask.mockResolvedValue(undefined);
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue(null);
        mocks.ensureAudioLog.mockResolvedValue(undefined);
    });

    it("validates module-specific workflow inputs", () => {
        const workflow = { inputSchema: [{ key: "prompt", label: "提示词", type: "textarea", required: true }] } as never;
        expect(normalizePracticeModuleInput("storyboard-image", { prompt: "雨夜远景" }, [], workflow)).toMatchObject({ input: { prompt: "雨夜远景" } });
        expect(() => normalizePracticeModuleInput("storyboard-video", { prompt: "镜头推进" }, [], workflow)).toThrow("请选择一张参考图片");
        expect(normalizePracticeModuleInput("dubbing", { text: "我们出发。" }, [], workflow)).toMatchObject({ input: { text: "我们出发。" } });
        expect(normalizePracticeModuleInput("music", { prompt: "紧张但克制" }, [], workflow)).toMatchObject({ input: { prompt: "紧张但克制" } });
    });

    it("accepts Demo asset modules and blocks character multi-view without a source image", () => {
        const workflow = { workflowCode: "character_multi_view", inputSchema: [{ key: "referenceImage", label: "参考图", type: "image", required: true }] } as never;
        expect(normalizePracticeModuleInput("character", { prompt: "", workflowCode: "character_multi_view" }, [{ type: "asset", id: "asset-main" }], workflow)).toMatchObject({ input: { prompt: "" } });
        expect(() => normalizePracticeModuleInput("character", { prompt: "角色", workflowCode: "character_multi_view" }, [], workflow)).toThrow("参考图");
        expect(normalizePracticeModuleInput("character", { prompt: "角色", workflowCode: "character_multi_view" }, [{ type: "asset", id: "asset-main" }], workflow)).toMatchObject({ input: { prompt: "角色", workflowCode: "character_multi_view" } });
    });

    it("preserves controlled input keys on practice asset references", () => {
        expect(
            normalizePracticeModuleInput(
                "storyboard-image",
                { prompt: "雨夜车站" },
                [
                    { type: "asset", id: "scene-one", inputKey: "sceneImage" },
                    { type: "asset", id: "character-one", inputKey: "characterPropImage1" },
                    { type: "asset", id: "character-two", inputKey: "characterPropImage2" },
                ],
                { inputSchema: [] } as never,
            ),
        ).toMatchObject({
            references: [
                { type: "asset", id: "scene-one", inputKey: "sceneImage" },
                { type: "asset", id: "character-one", inputKey: "characterPropImage1" },
                { type: "asset", id: "character-two", inputKey: "characterPropImage2" },
            ],
        });
    });

    it("preserves workflow identity through session creation and dispatch", async () => {
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-character", taskType: "image" as const }));
        const resolveModel = vi.fn(async (_module: PracticeModuleKind, _model?: string, workflowCode?: string) => {
            expect(workflowCode).toBe("character_main_view");
            return {
                logicalModelId: "practice-image",
                capability: "image" as const,
                workflow: {
                    workflowKey: "character-key",
                    workflowCode: "character_main_view",
                    version: 3,
                    adapterType: "character-main-view",
                    workflowId: "rh-character",
                    channelId: "rh",
                    businessCode: "storyboard-image",
                    capability: "image",
                    providerType: "runninghub",
                    enabled: true,
                    createPath: "/task/openapi/create",
                    queryPath: "/openapi/v2/query",
                    taskIdField: "data.taskId",
                    statusField: "data.status",
                    resultField: "data.result",
                    requestTemplate: "{}",
                    inputSchema: [],
                    nodeMappings: [],
                    outputMappings: [],
                },
            } as never;
        });
        const created = await createPracticeSessionForUser(
            { id: "student-one", role: "user" },
            { module: "character", title: "角色", workflowCode: "character_main_view", input: { prompt: "角色" }, clientRequestId: "character-request" },
            { store, dispatch, resolveModel },
        );
        expect(created).toMatchObject({ module: "character", workflowCode: "character_main_view" });
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ workflow: expect.objectContaining({ workflowCode: "character_main_view", adapterType: "character-main-view" }) }));
    });

    it("preserves video and dialogue reference slot keys for downstream adapters", async () => {
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-video", taskType: "video" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-video", capability: "video" as const }));
        await createPracticeSessionForUser(
            { id: "student-one", role: "user" },
            {
                module: "storyboard-video",
                title: "视频",
                input: { prompt: "推进", audioEnabled: true },
                references: [
                    { type: "asset", id: "image-one", inputKey: "image" },
                    { type: "asset", id: "audio-one", inputKey: "audio" },
                ],
                clientRequestId: "video-slots",
            },
            { store, dispatch, resolveModel },
        );
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                references: [
                    { type: "asset", id: "image-one", inputKey: "image" },
                    { type: "asset", id: "audio-one", inputKey: "audio" },
                ],
            }),
        );
    });

    it("accepts one video image plus one optional audio reference when audio is enabled", () => {
        expect(
            normalizePracticeModuleInput(
                "storyboard-video",
                { prompt: "推进", audioEnabled: true },
                [
                    { type: "asset", id: "image-one", inputKey: "image" },
                    { type: "asset", id: "audio-one", inputKey: "audio" },
                ],
                { inputSchema: [] } as never,
            ),
        ).toMatchObject({
            references: [
                { type: "asset", id: "image-one", inputKey: "image" },
                { type: "asset", id: "audio-one", inputKey: "audio" },
            ],
        });
    });

    it("keeps structured dialogue lines and required workflow dimensions in the persisted dispatch input", async () => {
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-audio", taskType: "audio" as const }));
        const resolveModel = vi.fn(
            async () =>
                ({
                    logicalModelId: "practice-audio",
                    capability: "audio" as const,
                    workflow: {
                        workflowKey: "dubbing-key",
                        workflowCode: "storyboard_dialogue_audio",
                        version: 1,
                        adapterType: "storyboard-dialogue-audio",
                        workflowId: "rh-audio",
                        channelId: "rh",
                        businessCode: "dubbing",
                        capability: "audio",
                        providerType: "runninghub",
                        enabled: true,
                        createPath: "/task/openapi/create",
                        queryPath: "/openapi/v2/query",
                        taskIdField: "data.taskId",
                        statusField: "data.status",
                        resultField: "data.result",
                        requestTemplate: "{}",
                        inputSchema: [
                            { key: "text", label: "台词", type: "text", required: true },
                            { key: "s1_audio", label: "音色", type: "audio", required: false },
                        ],
                        nodeMappings: [],
                        outputMappings: [],
                    },
                }) as never,
        );
        await createPracticeSessionForUser(
            { id: "student-one", role: "user" },
            { module: "dubbing", title: "配音", input: { text: "第一句", lines: [{ text: "第一句", audio: "voice-one", emotion: { happy: 0.8 } }] }, clientRequestId: "dialogue-lines" },
            { store, dispatch, resolveModel },
        );
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ text: "第一句", lines: [{ text: "第一句", audio: "voice-one", emotion: { happy: 0.8 } }] }) }));

        const dimensionDispatch = vi.fn(async () => ({ taskId: "task-character", taskType: "image" as const }));
        const dimensionResolve = vi.fn(
            async () =>
                ({
                    logicalModelId: "practice-image",
                    capability: "image" as const,
                    workflow: {
                        workflowKey: "character-key",
                        workflowCode: "character_main_view",
                        version: 1,
                        adapterType: "character-main-view",
                        workflowId: "rh-character",
                        channelId: "rh",
                        businessCode: "storyboard-image",
                        capability: "image",
                        providerType: "runninghub",
                        enabled: true,
                        createPath: "/task/openapi/create",
                        queryPath: "/openapi/v2/query",
                        taskIdField: "data.taskId",
                        statusField: "data.status",
                        resultField: "data.result",
                        requestTemplate: "{}",
                        inputSchema: [
                            { key: "prompt", label: "描述", type: "text", required: true },
                            { key: "width", label: "宽", type: "number", required: true },
                            { key: "height", label: "高", type: "number", required: true },
                        ],
                        nodeMappings: [],
                        outputMappings: [],
                    },
                }) as never,
        );
        await createPracticeSessionForUser(
            { id: "student-one", role: "user" },
            { module: "character", title: "角色", input: { prompt: "角色", width: 720, height: 1280 }, clientRequestId: "character-dimensions" },
            { store, dispatch: dimensionDispatch, resolveModel: dimensionResolve },
        );
        expect(dimensionDispatch).toHaveBeenCalledWith(expect.objectContaining({ input: { prompt: "角色", width: 720, height: 1280 }, workflow: expect.objectContaining({ workflowCode: "character_main_view" }) }));
    });

    it("does not create a workflow session when model preflight fails", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const resolveModel = vi.fn(async () => {
            throw Object.assign(new Error("当前练习模块没有可用的开源模型"), { status: 503 });
        });
        await expect(
            createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "storyboard-image", title: "镜头", input: { prompt: "雨夜" }, clientRequestId: "preflight-fail" }, { store, dispatch: vi.fn(), resolveModel }),
        ).rejects.toMatchObject({ status: 503 });
        expect(store.create).not.toHaveBeenCalled();
    });

    it("saves manual script without resolving a model or dispatching a task", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const resolveModel = vi.fn();
        const dispatch = vi.fn();
        const result = await createPracticeSessionForUser(
            { id: "student-one", role: "user" },
            { module: "script", title: "人工剧本", input: { title: "第一幕", content: "夜幕降临", notes: "人物从车站入口进入" }, clientRequestId: "manual-script" },
            { store, dispatch, resolveModel },
        );
        expect(result).toMatchObject({ mode: "manual", status: "draft" });
        expect(result).toMatchObject({ input: { title: "第一幕", content: "夜幕降临", notes: "人物从车站入口进入" } });
        expect(resolveModel).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("accepts dubbing text as the workflow input", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "audio-task", taskType: "audio" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-dubbing", capability: "audio" as const }));

        const result = await createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "dubbing", title: "配音练习", input: { text: "我们出发。" }, clientRequestId: "dubbing-text" }, { store, dispatch, resolveModel });

        expect(result).toMatchObject({ module: "dubbing", status: "running", input: { text: "我们出发。" } });
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ capability: "audio", input: { text: "我们出发。" } }));
    });

    it("returns a browser-readable URL for a persisted practice audio result", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const session = await store.create({
            id: "audio-result-session",
            userId: "student-one",
            projectKind: "canvas",
            module: "dubbing",
            mode: "workflow",
            title: "配音练习",
            clientRequestId: "audio-result",
            executionProfile: "open-source-practice",
            prompt: { text: "你好" },
            input: { text: "你好" },
            taskRefs: [{ taskId: "audio-task", taskType: "audio" }] as never,
            selectedLogicalModelId: "practice-audio",
            status: "success",
        });
        mocks.getAudioTask.mockResolvedValue({
            id: "audio-task",
            userId: "student-one",
            status: "success",
            result: { url: "http://127.0.0.1:3000/api/reference-assets/permanent/audio/result.flac", mimeType: "audio/flac" },
        });

        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store })).resolves.toMatchObject({
            result: { status: "success", media: { kind: "audio", url: "/api/reference-assets/permanent/audio/result.flac" } },
        });
        expect(mocks.ensureAudioLog).toHaveBeenCalledWith(expect.objectContaining({ id: "audio-task" }), "success");
    });

    it("persists terminal task failure before exposing a retryable session", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const created = await store.create({
            id: "failed-task-session",
            userId: "student-one",
            projectKind: "canvas",
            module: "storyboard-image",
            mode: "workflow",
            title: "失败镜头",
            clientRequestId: "failed-task-request",
            executionProfile: "open-source-practice",
            prompt: { prompt: "雨夜" },
            input: { prompt: "雨夜" },
            taskRefs: [{ taskId: "image-task", taskType: "image" }] as never,
            selectedLogicalModelId: "practice-image-b",
            status: "running",
        });
        mocks.getImageTask.mockResolvedValueOnce({ id: "image-task", userId: "student-one", status: "error", error: "上游失败" }).mockResolvedValue(undefined);
        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, created.id, { store })).resolves.toMatchObject({ status: "failed", errorCode: "PRACTICE_TASK_FAILED" });
        const retryDispatch = vi.fn(async () => ({ taskId: "image-task-retry", taskType: "image" as const }));
        const resolveModel = vi.fn(async (_module, requested) => ({ logicalModelId: requested || "practice-image-a", capability: "image" as const }));
        await expect(retryPracticeSessionForUser({ id: "student-one", role: "user" }, created.id, { store, dispatch: retryDispatch, resolveModel })).resolves.toMatchObject({ status: "running" });
        expect(resolveModel).toHaveBeenCalledWith("storyboard-image", "practice-image-b");
    });

    it("retries a cancelled workflow session through the same dispatch path", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const cancelled = await store.create({
            id: "cancelled-session",
            userId: "student-one",
            projectKind: "canvas",
            module: "storyboard-image",
            mode: "workflow",
            title: "已取消镜头",
            clientRequestId: "cancelled-request",
            executionProfile: "open-source-practice",
            prompt: { prompt: "雨夜" },
            input: { prompt: "雨夜" },
            taskRefs: [],
            status: "cancelled",
            errorCode: "PRACTICE_TASK_CANCELLED",
            errorMessage: "用户取消",
        });
        const dispatch = vi.fn(async () => ({ taskId: "retry-task", taskType: "image" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-image", capability: "image" as const }));

        await expect(retryPracticeSessionForUser({ id: "student-one", role: "user" }, cancelled.id, { store, dispatch, resolveModel })).resolves.toMatchObject({ status: "running" });
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("maps a legacy queued session without task refs to a visible dispatch failure", async () => {
        const legacy = {
            id: "legacy-session",
            userId: "student-one",
            projectKind: "canvas" as const,
            module: "storyboard-image" as const,
            mode: "workflow" as const,
            title: "旧会话",
            clientRequestId: "legacy-request",
            executionProfile: "open-source-practice" as const,
            prompt: { prompt: "雨夜" },
            input: { prompt: "雨夜" },
            taskRefs: [],
            status: "queued" as const,
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
        };
        await expect(publicPracticeSession(legacy)).resolves.toMatchObject({ status: "failed", errorCode: "PRACTICE_DISPATCH_NOT_STARTED" });
    });

    it("resolves the enabled workflow for a bound practice business code", () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.practiceDefaultModels.imageModel = "practice-image";
        settings.practiceWorkflowModels = { "storyboard-image": ["practice-image"] };
        settings.logicalModels = [{ id: "practice-image", name: "练习图片", capability: "image", enabled: true, bindings: [{ id: "binding", channelId: "rh", upstreamModel: "rh-image", enabled: true, priority: 1 }] }];
        settings.systemChannels = [
            {
                id: "rh",
                name: "练习 RunningHub",
                baseUrl: "https://runninghub.example",
                apiKey: "key",
                apiFormat: "openai",
                models: ["rh-image"],
                enabled: true,
                purpose: "open-source-practice",
                advancedConfig: {
                    protocol: "runninghub",
                    textModel: "",
                    imageModel: "rh-image",
                    videoModel: "",
                    createPath: "/task/create",
                    queryPath: "/task/query",
                    requestTemplate: "{}",
                    resultField: "data.result",
                    statusField: "data.status",
                    durationRange: "",
                    referenceRule: "",
                    supportsReferenceImage: true,
                    supportsReferenceVideo: false,
                    supportsReferenceAudio: false,
                    workflowConfigs: {
                        workflow: {
                            workflowKey: "workflow",
                            workflowCode: "storyboard_shot",
                            workflowName: "分镜图",
                            workflowCode: "storyboard_shot",
                            businessCode: "storyboard-image",
                            capability: "image",
                            providerType: "runninghub",
                            channelId: "rh",
                            workflowId: "wf-1",
                            version: 1,
                            enabled: true,
                            createPath: "/task/create",
                            queryPath: "/task/query",
                            taskIdField: "data.taskId",
                            statusField: "data.status",
                            resultField: "data.result",
                            requestTemplate: "{}",
                            inputSchema: [{ key: "prompt", label: "提示词", type: "textarea", required: true }],
                            nodeMappings: [{ paramKey: "prompt", nodeId: "1", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
                            outputMappings: [{ key: "image", label: "图片", assetType: "IMAGE", required: true }],
                        },
                    },
                },
            },
        ];
        expect(resolvePracticeModelFromSettings(settings, "storyboard-image")).toMatchObject({ logicalModelId: "", capability: "image", workflow: { workflowKey: "workflow", version: 1, businessCode: "storyboard-image" } });
        const second = structuredClone(settings);
        second.practiceWorkflowModels = { "storyboard-image": ["practice-image", "practice-image-b"] };
        second.logicalModels.push({ id: "practice-image-b", name: "练习图片 B", capability: "image", enabled: true, bindings: [{ id: "binding-b", channelId: "rh", upstreamModel: "rh-image", enabled: true, priority: 1 }] });
        expect(resolvePracticeModelFromSettings(second, "storyboard-image", "practice-image-b")).toMatchObject({ logicalModelId: "practice-image-b", capability: "image" });
        expect(resolvePracticeModelFromSettings(second, "storyboard-image", "production-image")).toMatchObject({ logicalModelId: "production-image", capability: "image" });
        expect(() => resolvePracticeModelFromSettings(second, "storyboard-image", undefined, "scene_main_view")).toThrow("当前练习模块没有可用工作流");
    });

    it("dispatches once for an idempotent client request and keeps provider details private", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "image" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-image", capability: "image" as const }));
        const input = { module: "storyboard-image" as const, title: "镜头练习", input: { prompt: "雨夜车站" }, clientRequestId: "request-one" };

        const first = await createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel });
        const retry = await createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel });

        expect(retry.id).toBe(first.id);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ executionProfile: "open-source-practice", capability: "image", logicalModelId: "practice-image", clientRequestId: "request-one" }));
        expect(first).toMatchObject({ status: "running" });
        expect(first).not.toHaveProperty("taskRefs");
        expect(first).not.toHaveProperty("prompt");
        expect(first).not.toHaveProperty("provider");
    });

    it("claims one queued idempotent session before concurrent dispatch", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "image" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-image", capability: "image" as const }));
        const input = { module: "storyboard-image" as const, title: "并发镜头练习", input: { prompt: "雨夜车站" }, clientRequestId: "request-concurrent" };

        const [first, second] = await Promise.all([
            createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel }),
            createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel }),
        ]);

        expect(first.id).toBe(second.id);
        expect(dispatch).toHaveBeenCalledOnce();
        expect(store.claimDispatch).toHaveBeenCalledTimes(2);
    });

    it("returns only the current user's stable public result", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "text" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));
        const created = await createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "剧本练习", input: { prompt: "开场" }, clientRequestId: "request-two" }, { store, dispatch, resolveModel });

        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, created.id, { store })).resolves.toMatchObject({ id: created.id, input: { prompt: "开场" } });
        await expect(getPracticeSessionForUser({ id: "other-user", role: "user" }, created.id, { store })).rejects.toMatchObject({ status: 404 });
    });

    it("sanitizes public input and reuses public references when retrying the same session", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const firstDispatch = vi.fn(async () => {
            throw new Error("上游失败");
        });
        const retryDispatch = vi.fn(async () => ({ taskId: "task-two", taskType: "image" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-image", capability: "image" as const }));

        await expect(
            createPracticeSessionForUser(
                { id: "student-one", role: "user" },
                {
                    module: "storyboard-image",
                    title: "镜头练习",
                    input: { prompt: " 雨夜车站 ", provider: "forged-provider", model: "forged-model" },
                    references: [
                        { type: "asset", id: " asset-one ", storageKey: "private/key" },
                        { type: "asset", id: "asset-one" },
                        { type: "task", id: "private-task" },
                    ],
                    clientRequestId: "request-three",
                },
                { store, dispatch: firstDispatch, resolveModel },
            ),
        ).rejects.toThrow("上游失败");

        const session = await store.getByRequest("student-one", "request-three");
        expect(session).not.toBeNull();
        if (!session) throw new Error("练习会话未创建");
        expect(session.input).toEqual({ prompt: "雨夜车站", references: [{ type: "asset", id: "asset-one" }] });
        expect(session).toMatchObject({ status: "failed", errorCode: "PRACTICE_DISPATCH_FAILED", errorMessage: "练习任务提交失败，请重试" });

        await retryPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store, dispatch: retryDispatch, resolveModel });
        expect(retryDispatch).toHaveBeenCalledWith(expect.objectContaining({ input: { prompt: "雨夜车站" }, references: [{ type: "asset", id: "asset-one" }], clientRequestId: "request-three" }));
    });

    it("keeps the accepted task reference when the first write-back fails", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const baseStore = memoryStore();
        const update = baseStore.update;
        let rejectTaskRefWrite = true;
        const store: PracticeSessionStore = {
            ...baseStore,
            update: vi.fn(async (userId, id, patch) => {
                if (rejectTaskRefWrite && patch.taskRefs) {
                    rejectTaskRefWrite = false;
                    throw new Error("write-back failed");
                }
                return update(userId, id, patch);
            }),
        };
        const acceptedRequests = new Map<string, PracticeTaskDispatchResult>();
        const dispatch = vi.fn(async (input) => {
            const existing = acceptedRequests.get(input.clientRequestId);
            if (existing) return existing;
            const task = { taskId: "task-one", taskType: "text" as const };
            acceptedRequests.set(input.clientRequestId, task);
            return task;
        });
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));

        await expect(createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "写回恢复", input: { prompt: "续写" }, clientRequestId: "request-write-back" }, { store, dispatch, resolveModel })).resolves.toMatchObject({
            status: "running",
        });
        const session = await store.getByRequest("student-one", "request-write-back");
        if (!session) throw new Error("练习会话未创建");

        expect(session).toMatchObject({ status: "running", taskRefs: [{ taskId: "task-one", taskType: "text" }] });

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls.map(([input]) => input.clientRequestId)).toEqual(["request-write-back"]);
        expect(acceptedRequests).toHaveLength(1);
    });

    it("reconciles an unknown submission from the durable generation task record", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const session = await store.create({
            id: "unknown-session",
            userId: "student-one",
            projectKind: "canvas",
            module: "script",
            mode: "workflow",
            title: "待确认提交",
            clientRequestId: "unknown-request",
            executionProfile: "open-source-practice",
            prompt: { prompt: "续写" },
            input: { prompt: "续写" },
            taskRefs: [],
            status: "running",
            errorCode: "PRACTICE_SUBMISSION_UNKNOWN",
            errorMessage: "写回失败",
        });
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue({ id: "durable-task", userId: "student-one", status: "pending", clientRequestId: "unknown-request" });

        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store })).resolves.toMatchObject({ id: session.id, status: "running" });
        expect(store.update).toHaveBeenCalledWith("student-one", session.id, expect.objectContaining({ taskRefs: [{ taskId: "durable-task", taskType: "text" }] }));
    });

    it("does not lose a task when both immediate reference writes fail", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const baseStore = memoryStore();
        const store: PracticeSessionStore = {
            ...baseStore,
            update: vi.fn(async (userId, id, patch) => {
                if (patch.taskRefs) throw new Error("write-back unavailable");
                return baseStore.update(userId, id, patch);
            }),
        };
        mocks.getStoredGenerationTaskByRequest.mockResolvedValue({ id: "durable-task", userId: "student-one", status: "pending", clientRequestId: "orphan-request" });
        const dispatch = vi.fn(async () => ({ taskId: "durable-task", taskType: "text" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));

        await expect(createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "孤儿任务保护", input: { prompt: "续写" }, clientRequestId: "orphan-request" }, { store, dispatch, resolveModel })).rejects.toMatchObject({
            code: "PRACTICE_SUBMISSION_UNKNOWN",
        });
        const session = await store.getByRequest("student-one", "orphan-request");
        if (!session) throw new Error("练习会话未创建");
        expect(session).toMatchObject({ status: "running", errorCode: "PRACTICE_SUBMISSION_UNKNOWN", taskRefs: [] });

        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store })).resolves.toMatchObject({ status: "running" });
        expect(mocks.getStoredGenerationTaskByRequest).toHaveBeenCalledWith("text", "student-one", "orphan-request");
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("keeps a pinned child IP in the session and records its practice usage", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const reference = { type: "ip" as const, id: "ip-one", subIpId: "child-one", itemIds: ["item-one"] };
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));

        const created = await createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "IP 剧本练习", input: { prompt: "续写" }, references: [reference], clientRequestId: "request-ip" }, { store, resolveModel });

        expect(created.input).toEqual({ prompt: "续写", references: [reference] });
        expect(mocks.recordIpReferenceUsage).toHaveBeenCalledWith("student-one", { targetType: "practice", targetId: created.id, references: [reference] });
    });

    it("repairs a queued idempotent session after usage recording failed", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const reference = { type: "ip" as const, id: "ip-one", subIpId: "child-one", itemIds: [] };
        mocks.validateIpReferences.mockResolvedValue([{ reference }]);
        mocks.recordIpReferenceUsage.mockRejectedValueOnce(new Error("usage failed")).mockResolvedValueOnce(undefined);
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "text" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));
        const input = { module: "script" as const, title: "IP 练习", input: { prompt: "续写" }, references: [reference], clientRequestId: "request-repair" };

        await expect(createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel })).rejects.toThrow("usage failed");
        await expect(createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel })).resolves.toMatchObject({ status: "running" });

        expect(mocks.recordIpReferenceUsage).toHaveBeenCalledTimes(2);
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("blocks a failed session retry after its school IP grant is revoked", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const reference = { type: "ip" as const, id: "ip-one", subIpId: "child-one", itemIds: [] };
        mocks.validateIpReferences.mockResolvedValueOnce([{ reference }]);
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));
        const dispatch = vi.fn(async () => {
            throw new Error("上游失败");
        });

        await expect(
            createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "IP 剧本练习", input: { prompt: "续写" }, references: [reference], clientRequestId: "request-revoked" }, { store, dispatch, resolveModel }),
        ).rejects.toThrow("上游失败");
        const session = await store.getByRequest("student-one", "request-revoked");
        if (!session) throw new Error("练习会话未创建");
        mocks.validateIpReferences.mockRejectedValueOnce(Object.assign(new Error("IP 授权已失效"), { status: 403 }));
        const retryDispatch = vi.fn();

        await expect(retryPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store, dispatch: retryDispatch, resolveModel })).rejects.toMatchObject({ status: 403 });
        expect(retryDispatch).not.toHaveBeenCalled();
        await expect(store.get("student-one", session.id)).resolves.toMatchObject({ status: "failed" });
    });

    it("claims one failed session before concurrent retry dispatch", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const firstDispatch = vi.fn(async () => {
            throw new Error("上游失败");
        });
        const retryDispatch = vi.fn(async () => ({ taskId: "task-retry", taskType: "text" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));

        await expect(
            createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "并发重试", input: { prompt: "续写" }, clientRequestId: "request-concurrent-retry" }, { store, dispatch: firstDispatch, resolveModel }),
        ).rejects.toThrow("上游失败");
        const session = await store.getByRequest("student-one", "request-concurrent-retry");
        if (!session) throw new Error("练习会话未创建");

        const [first, second] = await Promise.all([
            retryPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store, dispatch: retryDispatch, resolveModel }),
            retryPracticeSessionForUser({ id: "student-one", role: "user" }, session.id, { store, dispatch: retryDispatch, resolveModel }),
        ]);

        expect(first.id).toBe(second.id);
        expect(store.resetForRetry).toHaveBeenCalledTimes(2);
        expect(retryDispatch).toHaveBeenCalledOnce();
    });
});
