import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school production groups panel", () => {
    it("keeps group management and settlement actions in the school tenant", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/components/production-groups-panel.tsx"), "utf8");
        expect(source).toContain("schoolComputeApi.listGroups");
        expect(source).toContain("schoolComputeApi.createGroup");
        expect(source).toContain("schoolComputeApi.allocate");
        expect(source).toContain("schoolComputeApi.listAllocationRequests");
        expect(source).toContain("schoolComputeApi.reviewAllocation");
        expect(source).toContain("schoolComputeApi.listSettlements");
        expect(source).toContain("schoolComputeApi.confirmSettlement");
        expect(source).toContain("制作小组与算力");
        expect(source).toContain("追加申请");
        expect(source).toContain("确认返还");
        expect(source).toContain('width="min(640px, 100vw)"');
    });
});
