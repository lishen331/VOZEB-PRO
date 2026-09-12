import { describe, expect, it, vi } from "vitest";
import { confirmScriptStage } from "./script-practice-stage-service";
import type { ScriptDocument } from "@/lib/script-practice-types";

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

it("materializes a structured screenplay result into editable script blocks", async () => {
    const document: ScriptDocument = { id: "doc", projectId: "p", format: "structured", blocks: [{ id: "old", type: "action", text: "旧内容" }], version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
    const repo = {
        getScriptProject: vi.fn().mockResolvedValue({ id: "p", userId: "u", currentVersionId: "v1", title: "剧本", sourceType: "idea" }),
        getScriptStage: vi
            .fn()
            .mockResolvedValue({
                projectId: "p",
                key: "screenplay",
                status: "awaiting_review",
                draft: { screenplay: { projectTitle: "剧本", scenes: [{ title: "球场", action: "她投篮不中。", dialogueVO: [{ speaker: "她", line: "再来一次。" }] }] } },
                updatedAt: now,
            }),
        listScriptStages: vi.fn().mockResolvedValue([]),
        setScriptStage: vi.fn().mockImplementation(async (_p: string, _u: string, stage: unknown) => stage),
        getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
        nextScriptVersionNumber: vi.fn().mockResolvedValue(2),
        createScriptVersion: vi.fn().mockImplementation(async (version: unknown) => version),
        compareAndSetCurrentVersion: vi.fn().mockResolvedValue(true),
    };
    await confirmScriptStage(repo as never, "u", "p", "screenplay");
    expect(repo.createScriptVersion).toHaveBeenCalledWith(
        expect.objectContaining({
            documentSnapshot: expect.objectContaining({
                blocks: expect.arrayContaining([expect.objectContaining({ type: "scene-heading", text: "球场" }), expect.objectContaining({ type: "action", text: "她投篮不中。" }), expect.objectContaining({ type: "dialogue", text: "再来一次。" })]),
            }),
        }),
        "u",
    );
});

it("materializes a confirmed screenplay into the current document version", async () => {
    const document: ScriptDocument = { id: "doc", projectId: "p", format: "structured", blocks: [{ id: "old", type: "action", text: "旧内容" }], version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
    const repo = {
        getScriptProject: vi.fn().mockResolvedValue({ id: "p", userId: "u", currentVersionId: "v1", title: "剧本", sourceType: "idea" }),
        getScriptStage: vi.fn().mockResolvedValue({ projectId: "p", key: "screenplay", status: "awaiting_review", draft: { screenplay: "INT. ROOM - DAY\n\n她推开门。" }, updatedAt: now }),
        listScriptStages: vi.fn().mockResolvedValue([]),
        setScriptStage: vi.fn().mockImplementation(async (_p: string, _u: string, stage: unknown) => stage),
        getCurrentScriptDocument: vi.fn().mockResolvedValue(document),
        nextScriptVersionNumber: vi.fn().mockResolvedValue(2),
        createScriptVersion: vi.fn().mockImplementation(async (version: unknown) => version),
        compareAndSetCurrentVersion: vi.fn().mockResolvedValue(true),
    };
    await expect(confirmScriptStage(repo as never, "u", "p", "screenplay")).resolves.toMatchObject({ status: "confirmed" });
    expect(repo.createScriptVersion).toHaveBeenCalledWith(
        expect.objectContaining({ source: "ai", parentVersionId: "v1", documentSnapshot: expect.objectContaining({ version: 2, blocks: expect.arrayContaining([expect.objectContaining({ type: "scene-heading", text: "INT. ROOM - DAY" })]) }) }),
        "u",
    );
    expect(repo.compareAndSetCurrentVersion).toHaveBeenCalledWith("p", "u", "v1", expect.any(String));
});
