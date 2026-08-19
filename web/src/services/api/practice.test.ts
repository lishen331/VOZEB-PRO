import { afterEach, describe, expect, it, vi } from "vitest";

import { practiceApi } from "./practice";

describe("practice API client", () => {
    afterEach(() => vi.restoreAllMocks());

    it("sends only the public session contract", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: 0, data: { id: "session-one" }, msg: "ok" }));

        await practiceApi.createSession({ module: "music", title: "配乐练习", input: { prompt: "轻快" }, references: [], clientRequestId: "request-one" });

        expect(fetchMock).toHaveBeenCalledWith("/api/practice/sessions", expect.objectContaining({ method: "POST", body: JSON.stringify({ module: "music", title: "配乐练习", input: { prompt: "轻快" }, references: [], clientRequestId: "request-one" }) }));
    });

    it("maps the shared API error envelope", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: 403, data: null, msg: "当前账号没有可用的学校身份" }, { status: 403 }));

        await expect(practiceApi.listProjects({ kind: "canvas" })).rejects.toThrow("当前账号没有可用的学校身份");
    });
});
