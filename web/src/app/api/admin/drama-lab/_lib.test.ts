import { describe, expect, it } from "vitest";

import { databaseNotConfiguredResponse } from "./_lib";

describe("drama lab admin capability responses", () => {
    it("uses the shared PostgreSQL capability limitation contract", async () => {
        const response = databaseNotConfiguredResponse();
        expect(response.status).toBe(501);
        await expect(response.json()).resolves.toEqual({ code: 501, msg: "需要启用 PostgreSQL" });
    });
});
