import { describe, expect, it } from "vitest";

import { getRunningHubWorkflowActionColumn } from "./runninghub-workflow-list";

describe("RunningHub workflow action column", () => {
    it("pins the action column to the visible right edge", () => {
        const column = getRunningHubWorkflowActionColumn(() => null);

        expect(column.fixed).toBe("right");
        expect(column.width).toBeGreaterThanOrEqual(280);
        expect(column.className).toContain("runninghub-workflow-actions");
    });
});
