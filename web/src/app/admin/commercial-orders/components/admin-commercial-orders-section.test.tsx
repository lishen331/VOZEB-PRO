import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin commercial orders section", () => {
    it("supports the platform order, assignment and acceptance workflow", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/commercial-orders/components/admin-commercial-orders-section.tsx"), "utf8");

        expect(source).toContain("commercialOrdersApi.listPlatformCommercialOrders");
        expect(source).toContain("commercialOrdersApi.createCommercialOrder");
        expect(source).toContain("commercialOrdersApi.updateCommercialOrder");
        expect(source).toContain("commercialOrdersApi.assignCommercialOrder");
        expect(source).toContain("commercialOrdersApi.getPlatformCommercialOrder");
        expect(source).toContain("commercialOrdersApi.reviewCommercialOrder");
        expect(source).toContain("内部金额");
        expect(source).toContain("正式交付");
        expect(source).toContain("退回修改");
        expect(source).toContain("验收通过");
        expect(source).toContain('size="min(760px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).toContain('order.status === "accepted"');
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("线上结算");
    });
});
