import { describe, expect, it, vi } from "vitest";
import type { ScriptDocument } from "@/lib/script-practice-types";
import { createScriptAgentService } from "./script-practice-agent-service";

const now = "2026-09-11T00:00:00.000Z";
const document: ScriptDocument = { id: "doc-a", projectId: "project-a", format: "structured", blocks: [{ id: "b1", type: "action", text: "旧动作" }], version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };

describe("script practice agent service", () => {
    it("cannot read another user project", async () => {
        const repository = { getScriptProject: vi.fn().mockResolvedValue(null), getCurrentScriptDocument: vi.fn(), recordScriptAgentOperation: vi.fn() };
        const service = createScriptAgentService({ repository: repository as never, runModel: vi.fn() });
        await expect(service.propose("user-b", "project-a", { operation: "rewrite_selection", baseVersionId: "version-1", targetBlockIds: ["b1"], instruction: "重写" })).rejects.toMatchObject({ status: 404 });
        expect(repository.getCurrentScriptDocument).not.toHaveBeenCalled();
    });

    it("rejects an operation disabled by the practice script tool settings", async () => {
        const repository = {
            getScriptProject: vi.fn().mockResolvedValue({ id: "project-a", userId: "user-a", title: "剧本", currentVersionId: "version-1" }),
            getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
            recordScriptAgentOperation: vi.fn(),
        };
        const runModel = vi.fn().mockResolvedValue({ structured: { proposedAfter: "新动作" } });
        const service = createScriptAgentService({
            repository: repository as never,
            runModel,
            resolveModel: vi.fn().mockResolvedValue({ modelId: "m", endpointUrl: "http://localhost", executionProfile: "open-source-practice", enabledSkills: [], enabledTools: ["read_selection"] }),
        });
        await expect(service.propose("user-a", "project-a", { operation: "rewrite_selection", baseVersionId: "version-1", targetBlockIds: ["b1"], instruction: "重写" })).rejects.toMatchObject({ status: 403 });
        expect(runModel).not.toHaveBeenCalled();
    });

    it("uses the configured tool allowlist when the model is resolved by the server", async () => {
        const repository = {
            getScriptProject: vi.fn().mockResolvedValue({ id: "project-a", userId: "user-a", title: "剧本", currentVersionId: "version-1" }),
            getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
            recordScriptAgentOperation: vi.fn(),
        };
        const runModel = vi.fn().mockResolvedValue({ structured: { proposedAfter: "新动作" } });
        const resolveModel = vi.fn().mockResolvedValue({ modelId: "m", endpointUrl: "http://localhost", executionProfile: "open-source-practice", enabledSkills: [], enabledTools: ["rewrite_selection"] });
        const service = createScriptAgentService({ repository: repository as never, runModel, resolveModel });
        await expect(service.propose("user-a", "project-a", { operation: "rewrite_selection", baseVersionId: "version-1", targetBlockIds: ["b1"], instruction: "重写" })).resolves.toMatchObject({ proposedAfter: "新动作" });
        expect(resolveModel).toHaveBeenCalledOnce();
    });

    it("returns a bounded proposal and exposes no media task tools", async () => {
        const repository = {
            getScriptProject: vi.fn().mockResolvedValue({ id: "project-a", userId: "user-a", title: "剧本", currentVersionId: "version-1" }),
            getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
            recordScriptAgentOperation: vi.fn().mockImplementation(async (value: unknown) => value),
        };
        const service = createScriptAgentService({ repository: repository as never, runModel: vi.fn().mockResolvedValue({ structured: { proposedAfter: "新动作" } }) });
        await expect(service.propose("user-a", "project-a", { operation: "rewrite_selection", baseVersionId: "version-1", targetBlockIds: ["b1"], instruction: "更紧张" })).resolves.toMatchObject({
            baseVersionId: "version-1",
            targetBlockIds: ["b1"],
            before: "旧动作",
            proposedAfter: "新动作",
        });
        expect(service.toolNames()).not.toEqual(expect.arrayContaining(["create_image_task", "create_video_task", "create_audio_task"]));
    });
});
