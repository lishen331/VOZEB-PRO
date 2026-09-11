import { describe, expect, it, vi } from "vitest";
import type { ScriptDocument } from "@/lib/script-practice-types";
import { applyScriptPatch, createScriptStageService } from "./script-practice-stage-service";

const now = "2026-09-11T00:00:00.000Z";
const document: ScriptDocument = { id: "doc-a", projectId: "project-a", format: "structured", blocks: [{ id: "b1", type: "action", text: "原文" }], version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
function repository() {
    return {
        getScriptProject: vi.fn().mockResolvedValue({ id: "project-a", userId: "user-a", title: "剧本", status: "draft", sourceType: "idea", createdAt: now, updatedAt: now }),
        getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
        getScriptStage: vi.fn().mockResolvedValue(null),
        setScriptStage: vi.fn().mockImplementation(async (_project: string, _owner: string, stage: unknown) => stage),
        createScriptVersion: vi.fn().mockResolvedValue({ id: "version-2", projectId: "project-a", documentSnapshot: document, source: "ai", createdAt: now }),
        compareAndSetCurrentVersion: vi.fn().mockResolvedValue(true),
        nextScriptVersionNumber: vi.fn().mockResolvedValue(2),
        recordScriptAgentOperation: vi.fn(),
    };
}

describe("script practice stage service", () => {
    it("uses the response schema for the requested stage", async () => {
        const repo = repository();
        const runModel = vi.fn().mockResolvedValue({ structured: { synopsis: "公开梗概" } });
        const service = createScriptStageService({ repository: repo as never, runModel });
        await service.generate("user-a", "project-a", "generate_synopsis", { idea: "末班车" });
        expect(runModel).toHaveBeenCalledWith(expect.objectContaining({ responseSchema: expect.objectContaining({ required: ["synopsis"] }) }), expect.anything());
    });
    it("requires confirmed upstream input and stores a proposal as awaiting review", async () => {
        const repo = repository();
        const service = createScriptStageService({ repository: repo as never, runModel: vi.fn().mockResolvedValue({ structured: { synopsis: "公开梗概" } }) });
        await expect(service.generate("user-a", "project-a", "generate_synopsis", { idea: "末班车" })).resolves.toMatchObject({ status: "awaiting_review", result: { synopsis: "公开梗概" } });
        expect(repo.setScriptStage).toHaveBeenCalledWith("project-a", "user-a", expect.objectContaining({ key: "synopsis", status: "awaiting_review" }));
    });
    it("passes only the confirmed prerequisite stage to downstream generation", async () => {
        const repo = repository();
        repo.getScriptStage.mockImplementation(async (_project: string, _owner: string, key: string) => (key === "synopsis" ? { projectId: "project-a", key: "synopsis", status: "confirmed", confirmed: { synopsis: "已确认梗概" }, updatedAt: now } : null));
        const runModel = vi.fn().mockResolvedValue({ structured: { outline: "公开大纲" } });
        const service = createScriptStageService({ repository: repo as never, runModel });
        await expect(service.generate("user-a", "project-a", "generate_outline", { synopsis: "不可信的调用方输入" })).resolves.toMatchObject({ stage: "outline" });
        expect(runModel).toHaveBeenCalledWith(expect.objectContaining({ stageInput: { confirmed: { synopsis: "已确认梗概" } } }), expect.anything());
    });
    it("rejects downstream generation when the prerequisite is not confirmed", async () => {
        const repo = repository();
        const runModel = vi.fn();
        const service = createScriptStageService({ repository: repo as never, runModel });
        await expect(service.generate("user-a", "project-a", "generate_outline", { synopsis: "调用方伪造" })).rejects.toMatchObject({ status: 409 });
        expect(runModel).not.toHaveBeenCalled();
        expect(repo.setScriptStage).not.toHaveBeenCalled();
    });
    it("does not apply a patch over a newer user version", async () => {
        const repo = repository();
        repo.getCurrentScriptDocument.mockResolvedValue({ ...document, version: 2 });
        await expect(
            applyScriptPatch(repo as never, "user-a", { projectId: "project-a", baseVersionId: "version-1", currentVersionId: "version-2", targetBlockIds: ["b1"], operation: "rewrite_selection", before: "原文", proposedAfter: "新文" }),
        ).rejects.toMatchObject({ status: 409 });
        expect(repo.createScriptVersion).not.toHaveBeenCalled();
    });
});
