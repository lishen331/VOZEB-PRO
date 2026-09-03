import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canvas: vi.fn(), drama: vi.fn() }));
vi.mock("@/lib/server/canvas-project-service", () => ({ getCanvasProjectForUser: mocks.canvas }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.drama }));

import { resolveProjectExecutionProfile } from "./generation-project-context";

describe("generation project execution context", () => {
    beforeEach(() => vi.clearAllMocks());
    it("derives the practice profile from the owned canvas project", async () => {
        mocks.canvas.mockResolvedValue({ id: "canvas-1", executionProfile: "open-source-practice" });
        await expect(resolveProjectExecutionProfile("user-1", { surface: "canvas", projectId: "canvas-1" })).resolves.toBe("open-source-practice");
    });

    it("does not trust a project id on unrelated surfaces", async () => {
        await expect(resolveProjectExecutionProfile("user-1", { surface: "chat", projectId: "canvas-1" })).resolves.toBeUndefined();
        expect(mocks.canvas).not.toHaveBeenCalled();
    });
});
