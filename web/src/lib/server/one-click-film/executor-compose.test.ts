import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.project }));
vi.mock("@/lib/server/drama-lab-workflow-task-service", () => ({ advanceDramaLabWorkflow: vi.fn(), dramaLabWorkflowTaskView: vi.fn(), startDramaLabWorkflow: vi.fn() }));
vi.mock("@/lib/server/drama-lab-final-video-service", () => ({ createDramaLabFinalVideoTask: mocks.create, executeDramaLabFinalVideoTask: mocks.execute }));
vi.mock("./audio-runner", () => ({ runOneClickAudioForEpisodes: vi.fn() }));
vi.mock("./media-runner", () => ({ runOneClickMediaForEpisodes: vi.fn() }));
import { createOneClickFilmWorkflow } from "./engine";
import { createOneClickFilmExecutor } from "./executor";
describe("workflow composition settings", () => {
    it("passes the saved render settings to every selected episode", async () => {
        const composeOptions = { resolution: "1080p", burnSubtitles: true, watermarkText: "客户样片" };
        const task = createOneClickFilmWorkflow({ userId: "u", projectId: "p", clientRequestId: "r", episodeIds: ["e1", "e2"], options: { composeOptions } });
        mocks.project.mockResolvedValue({ episodes: [] });
        mocks.create.mockResolvedValue({ id: "render" });
        mocks.execute.mockResolvedValue({ id: "render", status: "success", result: { url: "/movie.mp4" } });
        await createOneClickFilmExecutor({ origin: "http://localhost", cookie: "" })({ task, step: task.workflow.steps[6] });
        expect(mocks.create).toHaveBeenCalledTimes(2);
        for (const episodeId of ["e1", "e2"]) expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ episodeId, composeOptions }));
    });
});
