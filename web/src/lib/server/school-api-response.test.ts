import { describe, expect, it } from "vitest";

import { schoolApiFailure } from "./school-api-response";

describe("school API error responses", () => {
    it("keeps structured business data without leaking database details", async () => {
        const response = schoolApiFailure({ status: 409, message: "IP 标识已存在，请更换 slug", data: { field: "slug", reason: "duplicate" } }, "操作失败");
        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({ code: 409, data: { field: "slug", reason: "duplicate" }, msg: "IP 标识已存在，请更换 slug" });
    });

    it("uses the fallback for unknown errors", async () => {
        const response = schoolApiFailure({ code: "23505", message: "duplicate key value violates constraint ip_packages_slug_idx" }, "创建 IP 失败");
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({ code: 500, data: null, msg: "创建 IP 失败" });
    });
});
