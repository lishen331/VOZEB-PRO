import { describe, expect, it, vi } from "vitest";

const repository = {
    getScriptProject: vi.fn(),
    getCurrentScriptDocument: vi.fn(),
    listScriptVersions: vi.fn(),
    listScriptEntities: vi.fn(),
    listScriptStages: vi.fn(),
};
vi.mock("./database/script-practice-repository", () => ({ createScriptPracticeRepository: () => repository }));

import { getScriptProjectDetail } from "./script-practice-service";

describe("script project detail service", () => {
    it("returns versions as an array for the workspace", async () => {
        repository.getScriptProject.mockResolvedValue({ id: "p", userId: "u", title: "剧本", status: "draft", sourceType: "idea", createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" });
        repository.getCurrentScriptDocument.mockResolvedValue(null);
        repository.listScriptVersions.mockResolvedValue({ items: [{ id: "v1" }], total: 1, page: 1, pageSize: 20 });
        repository.listScriptEntities.mockResolvedValue([]);
        repository.listScriptStages.mockResolvedValue([]);
        const detail = await getScriptProjectDetail("u", "p");
        expect(detail.versions).toEqual([{ id: "v1" }]);
        expect(Array.isArray(detail.versions)).toBe(true);
    });
});
