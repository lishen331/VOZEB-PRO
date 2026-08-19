import { afterEach, describe, expect, it, vi } from "vitest";

import { publicWorkPublicationsApi } from "./work-publications";

describe("public work publications api", () => {
    afterEach(() => vi.restoreAllMocks());

    it("loads the public process only from the dedicated detail route", async () => {
        const process = { sourceType: "canvas", versionId: "version-one", title: "公开画布", nodes: [], connections: [], assets: [] };
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: 0, data: { process }, msg: "ok" }));

        await expect(publicWorkPublicationsApi.getProcess("作品/one")).resolves.toEqual(process);
        expect(fetchMock).toHaveBeenCalledWith("/api/public/works/%E4%BD%9C%E5%93%81%2Fone/process", expect.objectContaining({ cache: "no-store" }));
    });

    it("copies once with the caller-owned idempotency key", async () => {
        const result = { kind: "drama", projectId: "practice-one", clientRequestId: "request-one" };
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: 0, data: result, msg: "ok" }));

        await expect(publicWorkPublicationsApi.copyToPractice("public-one", { kind: "drama", clientRequestId: "request-one" })).resolves.toEqual(result);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/public/works/public-one/copy-to-practice",
            expect.objectContaining({
                method: "POST",
                cache: "no-store",
                body: JSON.stringify({ kind: "drama", clientRequestId: "request-one" }),
            }),
        );
    });
});
