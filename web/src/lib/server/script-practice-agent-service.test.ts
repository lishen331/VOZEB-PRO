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
