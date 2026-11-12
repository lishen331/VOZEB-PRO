import { describe, expect, it } from "vitest";

import type { StoredGenerationLog } from "./generation-log-types";
import { buildAdminGenerationOverviewSummary, buildAdminSuccessRatePanel, generationOverviewWindow, successRateWindow } from "./generation-overview-service";
import { successRatePercent } from "@/lib/admin-generation-overview";

describe("generation overview summary", () => {
    const now = new Date("2026-07-26T04:00:00.000Z");

    it("uses seven complete Asia/Shanghai calendar days", () => {
        expect(generationOverviewWindow(now)).toEqual({
            dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"],
            startAt: "2026-07-19T16:00:00.000Z",
            endAt: "2026-07-26T16:00:00.000Z",
        });
    });

    it("aggregates file-provider logs without leaking records outside the window", () => {
        const logs = [
            log("before", "2026-07-19T15:59:59.999Z", "success", "user-out", "old", "unknown", "image"),
            log("start", "2026-07-19T16:00:00.000Z", "success", "user-one", "image-pro", "agent", "image"),
            log("middle", "2026-07-25T08:00:00.000Z", "failed", "user-two", "video-pro", "drama", "video"),
            log("today", "2026-07-26T15:59:59.999Z", "pending", "user-one", "image-pro", "canvas", "image"),
            log("after", "2026-07-26T16:00:00.000Z", "success", "user-out", "future", "unknown", "image"),
        ];

        const summary = buildAdminGenerationOverviewSummary(logs, now);

        expect(summary).toMatchObject({ windowDays: 7, totalCalls: 3, successCalls: 1, failedCalls: 1, activeUsers: 2, successRate: 33 });
        expect(summary.dailyCalls.map((item) => item.value)).toEqual([1, 0, 0, 0, 0, 1, 1]);
        expect(summary.modelDistribution).toEqual([
            { label: "image-pro", value: 2, percent: 67 },
            { label: "video-pro", value: 1, percent: 33 },
        ]);
        expect(summary.sourceDistribution.map((item) => item.label)).toEqual(["Agent 工作台", "画布", "短剧"]);
        expect(summary.kindDistribution).toEqual([
            { label: "图片", value: 2, percent: 67 },
            { label: "视频", value: 1, percent: 33 },
        ]);
    });
});

describe("generation success rate panel", () => {
    const now = new Date("2026-07-26T04:00:00.000Z");

    it("aligns 1d/7d/30d windows to Asia/Shanghai calendar days", () => {
        expect(successRateWindow("1d", now)).toMatchObject({ startAt: "2026-07-25T16:00:00.000Z", endAt: "2026-07-26T16:00:00.000Z", windowLabel: "今天" });
        expect(successRateWindow("7d", now)).toMatchObject({ startAt: "2026-07-19T16:00:00.000Z", endAt: "2026-07-26T16:00:00.000Z", windowLabel: "近 7 天" });
        expect(successRateWindow("30d", now).startAt).toBe("2026-06-26T16:00:00.000Z");
    });

    it("keeps pending out of the success-rate denominator", () => {
        const logs = [
            log("a", "2026-07-25T08:00:00.000Z", "success", "u1", "m", "canvas", "image"),
            log("b", "2026-07-25T09:00:00.000Z", "failed", "u2", "m", "canvas", "image"),
            log("c", "2026-07-25T10:00:00.000Z", "pending", "u3", "m", "canvas", "image"),
            log("d", "2026-07-25T11:00:00.000Z", "success", "u4", "m", "canvas", "video"),
        ];

        const panel = buildAdminSuccessRatePanel(logs, "7d", now);
        expect(panel.kinds.find((row) => row.label === "图片")).toMatchObject({ success: 1, failed: 1, pending: 1, settled: 2, successRate: 50 });
        expect(panel.kinds.find((row) => row.label === "音频")).toMatchObject({ settled: 0, successRate: null });
        expect(panel.profiles.find((row) => row.label === "生产")).toMatchObject({ settled: 3, successRate: 67 });
    });

    it("returns a null rate for an empty window", () => {
        const panel = buildAdminSuccessRatePanel([], "1d", now);
        expect(panel.kinds.every((row) => row.successRate === null && row.settled === 0)).toBe(true);
        expect(panel.channels).toEqual([]);
    });

    it("rounds the percentage and returns null when nothing settled", () => {
        expect(successRatePercent(2, 1)).toBe(67);
        expect(successRatePercent(0, 0)).toBeNull();
    });
});

function log(id: string, createdAt: string, status: StoredGenerationLog["status"], userId: string, model: string, source: StoredGenerationLog["source"], kind: StoredGenerationLog["kind"]): StoredGenerationLog {
    return {
        id,
        userId,
        username: userId,
        displayName: userId,
        kind,
        source,
        status,
        title: id,
        prompt: "",
        model,
        summary: "",
        durationMs: 0,
        count: 1,
        successCount: status === "success" ? 1 : 0,
        failCount: status === "failed" ? 1 : 0,
        assets: [],
        createdAt,
        updatedAt: createdAt,
    };
}
