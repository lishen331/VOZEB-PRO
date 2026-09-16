import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    repository: {
        createScriptProject: vi.fn(),
        createScriptVersion: vi.fn(),
        compareAndSetCurrentVersion: vi.fn(),
    },
}));
vi.mock("./database/script-practice-repository", () => ({ createScriptPracticeRepository: () => mocks.repository }));

import { importScriptProject } from "./script-practice-service";

describe("script practice service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.repository.createScriptProject.mockResolvedValue({ id: "project-a", userId: "user-a", title: "导入剧本", status: "draft", sourceType: "fountain", createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" });
        mocks.repository.createScriptVersion.mockImplementation(async (version: unknown) => version);
        mocks.repository.compareAndSetCurrentVersion.mockResolvedValue(true);
    });

    it("commits the confirmed import document as the current version", async () => {
        const result = await importScriptProject("user-a", { title: "导入剧本", format: "fountain", content: "INT. ROOM - DAY\n\n门打开了。", confirm: true });
        expect(mocks.repository.createScriptProject).toHaveBeenCalledWith(expect.objectContaining({ title: "导入剧本", sourceType: "fountain" }), "user-a");
        expect(mocks.repository.createScriptVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: "project-a",
                source: "import",
                documentSnapshot: expect.objectContaining({
                    projectId: "project-a",
                    blocks: expect.arrayContaining([expect.objectContaining({ type: "scene-heading", text: "INT. ROOM - DAY" }), expect.objectContaining({ type: "action", text: "门打开了。" })]),
                }),
            }),
            "user-a",
        );
        expect(mocks.repository.compareAndSetCurrentVersion).toHaveBeenCalledWith("project-a", "user-a", undefined, expect.any(String));
        expect(result).toMatchObject({ project: expect.objectContaining({ id: "project-a" }), document: expect.objectContaining({ projectId: "project-a" }) });
    });
});
