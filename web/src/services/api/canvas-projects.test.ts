import { afterEach, describe, it, expect, vi } from "vitest";
import { getCanvasProject } from "./canvas-projects";
describe("Canvas entry reconciles server-owned results", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("uses explicit recovery on project entry instead of a read-only stale snapshot", async () => {
        const fetch = vi.fn(async () => Response.json({ code: 0, data: { project: { id: "canvas", nodes: [{ id: "recovered" }] } } }));
        vi.stubGlobal("fetch", fetch);
        expect(await getCanvasProject("canvas")).toMatchObject({ nodes: [{ id: "recovered" }] });
        expect(fetch).toHaveBeenCalledWith("/api/canvas/projects/canvas/recover-agent-results", expect.objectContaining({ method: "POST", cache: "no-store" }));
    });
    it("does not silently display stale data after recovery fails", async () => {
        const fetch = vi.fn(async () => Response.json({ msg: "save failed" }, { status: 503 }));
        vi.stubGlobal("fetch", fetch);
        await expect(getCanvasProject("canvas")).rejects.toThrow("save failed");
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
