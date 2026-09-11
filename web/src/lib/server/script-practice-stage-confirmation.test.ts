import { describe, expect, it, vi } from "vitest";
import { confirmScriptStage } from "./script-practice-stage-service";

const now = "2026-09-11T00:00:00.000Z";
describe("confirmScriptStage", () => {
    it("promotes the reviewed draft and marks existing downstream drafts stale", async () => {
        const repo = {
            getScriptProject: vi.fn().mockResolvedValue({ id: "p", userId: "u" }),
            getScriptStage: vi.fn().mockResolvedValue({ projectId: "p", key: "synopsis", status: "awaiting_review", draft: { synopsis: "确认稿" }, updatedAt: now }),
            listScriptStages: vi.fn().mockResolvedValue([
                { projectId: "p", key: "synopsis", status: "awaiting_review", draft: { synopsis: "确认稿" }, updatedAt: now },
                { projectId: "p", key: "outline", status: "awaiting_review", draft: { outline: "旧大纲" }, updatedAt: now },
                { projectId: "p", key: "entities", status: "confirmed", confirmed: { entities: [] }, updatedAt: now },
            ]),
            setScriptStage: vi.fn().mockImplementation(async (_p: string, _u: string, stage: unknown) => stage),
        };
        await expect(confirmScriptStage(repo as never, "u", "p", "synopsis")).resolves.toMatchObject({ status: "confirmed", confirmed: { synopsis: "确认稿" } });
        expect(repo.setScriptStage).toHaveBeenCalledWith("p", "u", expect.objectContaining({ key: "outline", status: "stale", draft: { outline: "旧大纲" } }));
        expect(repo.setScriptStage).toHaveBeenCalledWith("p", "u", expect.objectContaining({ key: "entities", status: "stale" }));
    });

    it("does not confirm a stage without a generated draft", async () => {
        const repo = {
            getScriptProject: vi.fn().mockResolvedValue({ id: "p", userId: "u" }),
            getScriptStage: vi.fn().mockResolvedValue({ projectId: "p", key: "synopsis", status: "draft", updatedAt: now }),
            listScriptStages: vi.fn(),
            setScriptStage: vi.fn(),
        };
        await expect(confirmScriptStage(repo as never, "u", "p", "synopsis")).rejects.toMatchObject({ status: 409 });
        expect(repo.setScriptStage).not.toHaveBeenCalled();
    });
});
