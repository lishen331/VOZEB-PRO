import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { hasOneClickPendingGeneration } from "./generation-polling";
const project = (shot: Partial<DramaShot>) => ({ episodes: [{ shots: [shot] }] }) as DramaProject;
describe("one-click generation polling", () => {
    it("polls manual image/video/frame work", () => {
        expect(hasOneClickPendingGeneration(project({ storyboardTaskId: "i", storyboardStatus: "running" }))).toBe(true);
        expect(hasOneClickPendingGeneration(project({ generationTaskId: "v", generationStatus: "queued" }))).toBe(true);
        expect(hasOneClickPendingGeneration(project({ frames: { first: { taskId: "f", status: "running", prompt: "p" } } }))).toBe(true);
    });
    it("also settles synchronously completed tasks which have no history yet", () => {
        expect(hasOneClickPendingGeneration(project({ storyboardTaskId: "i", storyboardStatus: "success" }))).toBe(true);
    });
    it("stops for consumed, failed, locked or absent work", () => {
        expect(hasOneClickPendingGeneration(project({ storyboardTaskId: "i", storyboardStatus: "success", storyboardHistory: [{ id: "i", taskId: "i", url: "/i.png", prompt: "p", createdAt: "now" }] }))).toBe(false);
        expect(hasOneClickPendingGeneration(project({ generationTaskId: "v", generationStatus: "error" }))).toBe(false);
        expect(hasOneClickPendingGeneration(project({ frames: { last: { taskId: "f", status: "running", prompt: "p", locked: true } } }))).toBe(false);
        expect(hasOneClickPendingGeneration(undefined)).toBe(false);
    });
});
