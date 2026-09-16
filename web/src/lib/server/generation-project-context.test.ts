import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canvas: vi.fn(), drama: vi.fn() }));
vi.mock("@/lib/server/canvas-project-service", () => ({ getCanvasProjectForUser: mocks.canvas }));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.drama }));

import { projectExecutionProfileError, resolveProjectExecutionProfile } from "./generation-project-context";

describe("generation project execution context", () => {
    beforeEach(() => vi.clearAllMocks());
    it("derives the practice profile from the owned canvas project", async () => {
        mocks.canvas.mockResolvedValue({ id: "canvas-1", executionProfile: "open-source-practice" });
        await expect(resolveProjectExecutionProfile("user-1", { surface: "canvas", projectId: "canvas-1" })).resolves.toBe("open-source-practice");
    });

    it("propagates a revoked practice membership instead of selecting the free profile", async () => {
        mocks.canvas.mockRejectedValue(Object.assign(new Error("当前账号没有可用学校身份"), { status: 403 }));
        await expect(resolveProjectExecutionProfile("user-1", { surface: "canvas", projectId: "canvas-1" })).rejects.toMatchObject({ status: 403 });
    });

    it("normalizes project access errors for generation routes", () => {
        expect(projectExecutionProfileError(Object.assign(new Error("当前账号没有可用学校身份"), { status: 403 }))).toEqual({ status: 403, message: "当前账号没有可用学校身份" });
        expect(projectExecutionProfileError(new Error("unexpected"))).toBeNull();
    });

    it("does not trust a project id on unrelated surfaces", async () => {
        await expect(resolveProjectExecutionProfile("user-1", { surface: "chat", projectId: "canvas-1" })).resolves.toBeUndefined();
        expect(mocks.canvas).not.toHaveBeenCalled();
    });
});
