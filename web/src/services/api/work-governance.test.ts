import { afterEach, describe, expect, it, vi } from "vitest";

import { setAdminWorkPullFilm } from "./work-governance";

describe("work governance api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("updates pull-film state with PATCH and returns the version-bound state", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, data: { hasProcess: true, processVersionId: "version-one", updatedAt: "2026-08-19T00:00:00.000Z" }, msg: "OK" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(setAdminWorkPullFilm("work/a", true)).resolves.toEqual({ hasProcess: true, processVersionId: "version-one", updatedAt: "2026-08-19T00:00:00.000Z" });
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/works/work%2Fa/pull-film", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: true }), cache: "no-store" }));
    });
});
