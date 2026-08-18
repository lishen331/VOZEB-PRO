import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requirePracticeAccess: vi.fn(),
    createCanvas: vi.fn(),
    createDrama: vi.fn(),
    listCanvas: vi.fn(),
    listDrama: vi.fn(),
}));

vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/server/canvas-project-service", () => ({ createCanvasProjectForUser: mocks.createCanvas, listCanvasProjectsForUser: mocks.listCanvas }));
vi.mock("@/lib/server/drama-project-service", () => ({ createDramaProjectForUser: mocks.createDrama, listDramaProjectSummariesForUser: mocks.listDrama }));

import { createPracticeProject, listPracticeProjects } from "./practice-project-service";

const actor = { id: "student-one", role: "user" } as const;

describe("practice projects", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "membership-one", role: "student" });
        mocks.listCanvas.mockResolvedValue({ projects: [], total: 0, page: 1, pageSize: 12 });
        mocks.listDrama.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 });
    });

    it("creates independent canvas and drama projects with immutable practice identity", async () => {
        mocks.createCanvas.mockResolvedValue({ id: "canvas-practice", executionProfile: "open-source-practice", practiceSource: { type: "blank" } });
        mocks.createDrama.mockResolvedValue({ id: "drama-practice", executionProfile: "open-source-practice", practiceSource: { type: "blank" } });

        await expect(createPracticeProject(actor, { kind: "canvas", title: "构图练习" })).resolves.toMatchObject({ kind: "canvas", project: { id: "canvas-practice" } });
        await expect(createPracticeProject(actor, { kind: "drama", title: "分镜练习" })).resolves.toMatchObject({ kind: "drama", project: { id: "drama-practice" } });
        expect(mocks.createCanvas).toHaveBeenCalledWith("student-one", { title: "构图练习" }, { executionProfile: "open-source-practice", practiceSource: { type: "blank" } });
        expect(mocks.createDrama).toHaveBeenCalledWith("student-one", { title: "分镜练习" }, { executionProfile: "open-source-practice", practiceSource: { type: "blank" } });
    });

    it("creates a new practice id each time the same formal source is copied", async () => {
        mocks.createCanvas.mockResolvedValueOnce({ id: "practice-one" }).mockResolvedValueOnce({ id: "practice-two" });
        const source = { type: "published-work" as const, workId: "work-one", versionId: "version-one" };

        const first = await createPracticeProject(actor, { kind: "canvas", title: "第一次", source });
        const second = await createPracticeProject(actor, { kind: "canvas", title: "第二次", source });

        expect(first.project.id).not.toBe(second.project.id);
        expect(mocks.createCanvas).toHaveBeenNthCalledWith(2, "student-one", { title: "第二次" }, { executionProfile: "open-source-practice", practiceSource: source });
    });

    it("filters practice projects before provider pagination", async () => {
        await listPracticeProjects(actor, { kind: "canvas", page: 2, pageSize: 8 });

        expect(mocks.listCanvas).toHaveBeenCalledWith("student-one", { page: 2, pageSize: 8, executionProfile: "open-source-practice" });
        expect(mocks.listDrama).not.toHaveBeenCalled();
    });
});
