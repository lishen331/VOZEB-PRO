import { describe, expect, it } from "vitest";
import type { GenerationLogTraceStep } from "@/lib/server/generation-log-trace";
import { buildGenerationLogFlow } from "./generation-log-flow";

const at = (offset: number) => 1_700_000_000_000 + offset * 1000;

/** 测试服任务 7a425869 的真实事件序列：两次调用都 503，第二次换了模型。 */
const stagingFailure: GenerationLogTraceStep[] = [
    { at: at(0), phase: "task_created", model: "agnes-image-2.5-flash", channelName: "Agnes AI 渠道" },
    { at: at(1), phase: "state", model: "agnes-image-2.5-flash", state: "queued" },
    { at: at(2), phase: "state", model: "agnes-image-2.5-flash", state: "running" },
    { at: at(3), phase: "state", model: "agnes-image-2.5-flash", state: "submitting" },
    { at: at(4), phase: "provider_start", model: "agnes-image-2.5-flash" },
    { at: at(5), phase: "poll", state: "api_response:submitting" },
    { at: at(6), phase: "transport_request", model: "agnes-image-2.5-flash" },
    { at: at(7), phase: "transport_policy", model: "agnes-image-2.5-flash" },
    { at: at(8), phase: "upstream_request", model: "agnes-image-2.5-flash" },
    { at: at(9), phase: "upstream_response", model: "agnes-image-2.5-flash", status: 503, durationMs: 22623, errorMessage: "no available server" },
    { at: at(10), phase: "upstream_body_first_byte", model: "agnes-image-2.5-flash" },
    { at: at(11), phase: "upstream_body_complete", model: "agnes-image-2.5-flash" },
    { at: at(12), phase: "transport_response", model: "agnes-image-2.5-flash", status: 503 },
    { at: at(13), phase: "provider_exception", model: "agnes-image-2.5-flash", errorName: "GenerationSubmissionUncertainError" },
    { at: at(14), phase: "state", model: "agnes-image-2.1-flash", state: "created" },
    { at: at(15), phase: "poll", state: "pending" },
    { at: at(16), phase: "poll", model: "agnes-image-2.1-flash", state: "api_response:created" },
    { at: at(17), phase: "state", model: "agnes-image-2.1-flash", state: "submitting" },
    { at: at(18), phase: "provider_start", model: "agnes-image-2.1-flash" },
    { at: at(19), phase: "transport_request", model: "agnes-image-2.1-flash" },
    { at: at(20), phase: "transport_policy", model: "agnes-image-2.1-flash" },
    { at: at(21), phase: "upstream_request", model: "agnes-image-2.1-flash" },
    { at: at(22), phase: "poll", state: "api_response:submitting" },
    { at: at(23), phase: "upstream_response", model: "agnes-image-2.1-flash", status: 503, durationMs: 18000, errorMessage: "no available server" },
    { at: at(24), phase: "upstream_body_first_byte", model: "agnes-image-2.1-flash" },
    { at: at(25), phase: "upstream_body_complete", model: "agnes-image-2.1-flash" },
    { at: at(26), phase: "transport_response", model: "agnes-image-2.1-flash", status: 503 },
    { at: at(27), phase: "provider_exception", model: "agnes-image-2.1-flash", errorName: "GenerationSubmissionUncertainError" },
    { at: at(28), phase: "state", model: "agnes-image-2.1-flash", state: "error" },
    { at: at(29), phase: "state", model: "agnes-image-2.1-flash", state: "completed" },
    { at: at(30), phase: "recovery_end", model: "agnes-image-2.1-flash", state: "failed" },
    { at: at(31), phase: "poll", state: "api_response:completed" },
];

describe("buildGenerationLogFlow", () => {
    it("folds the staging failure timeline into a failover flow", () => {
        const flow = buildGenerationLogFlow(stagingFailure);

        expect(flow.map((node) => node.label)).toEqual(["建任务", "调用 1", "轮询 ×2", "调用 2", "任务失败", "轮询"]);
        expect(flow[1]).toMatchObject({ tone: "danger", status: 503, model: "agnes-image-2.5-flash", errorMessage: "no available server", connector: "故障转移" });
        expect(flow[1].durationMs).toBe(22623);
        expect(flow[3]).toMatchObject({ tone: "danger", status: 503, model: "agnes-image-2.1-flash" });
        expect(flow[4]).toMatchObject({ tone: "danger", state: "failed" });
        expect(flow.reduce((sum, node) => sum + node.collapsedCount, 0)).toBeGreaterThan(0);
    });

    it("marks a succeeded call as success and skips the failover connector", () => {
        const flow = buildGenerationLogFlow([
            { at: at(0), phase: "task_created", model: "agnes-image-2.5-flash" },
            { at: at(1), phase: "provider_start", model: "agnes-image-2.5-flash" },
            { at: at(2), phase: "upstream_response", model: "agnes-image-2.5-flash", status: 200, durationMs: 41000 },
            { at: at(3), phase: "provider_end", model: "agnes-image-2.5-flash" },
            { at: at(4), phase: "result_persist_complete" },
        ]);

        expect(flow.map((node) => node.label)).toEqual(["建任务", "调用 1", "结果已保存"]);
        expect(flow[1]).toMatchObject({ tone: "success", status: 200 });
        expect(flow[1].connector).toBeUndefined();
        expect(flow[2].tone).toBe("success");
    });

    it("returns no nodes when nothing was collected", () => {
        expect(buildGenerationLogFlow([])).toEqual([]);
    });
});
