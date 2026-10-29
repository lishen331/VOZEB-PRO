import { describe, expect, it } from "vitest";

import { majorFlowBySlug } from "@/app/bluegamma/flow/flow-data";
import { canGenerate, downstreamOf, flowReducer, initialFlowState, nextStepKey, nodeOf, type FlowState } from "@/app/bluegamma/flow/flow-state";

const flow = majorFlowBySlug("interior");

function run(state: FlowState, key: string) {
    const created = flowReducer(state, { type: "create", flow, key });
    return flowReducer(flowReducer(created, { type: "start", key }), { type: "finish", flow, key });
}

describe("引导式画布状态", () => {
    it("新建节点会选中并填好第一个模板（含课题）", () => {
        const state = flowReducer(initialFlowState(flow), { type: "create", flow, key: "research" });
        expect(state.selectedKey).toBe("research");
        expect(nodeOf(state, "research")?.prompt).toContain(flow.brief);
        expect(nodeOf(state, "research")?.presetIndex).toBe(0);
    });

    it("上游没完成时下游不能生成，完成后解锁", () => {
        let state = initialFlowState(flow);
        expect(canGenerate(flow, state, "research")).toBe(true);
        expect(canGenerate(flow, state, "sketch")).toBe(false);
        state = run(state, "research");
        expect(canGenerate(flow, state, "sketch")).toBe(true);
        expect(nextStepKey(flow, state)).toBe("sketch");
    });

    it("文本步骤产出要点；结果记下所用模板，手改描述记为自定义", () => {
        let state = run(initialFlowState(flow), "research");
        expect(nodeOf(state, "research")?.lines?.length).toBeGreaterThan(0);
        expect(nodeOf(state, "research")?.resultLabel).toBe(flow.steps[0].presets[0].name);
        state = flowReducer(flowReducer(state, { type: "create", flow, key: "sketch" }), { type: "set-prompt", key: "sketch", prompt: "自己写" });
        state = flowReducer(flowReducer(state, { type: "start", key: "sketch" }), { type: "finish", flow, key: "sketch" });
        expect(nodeOf(state, "sketch")).toMatchObject({ status: "done", resultLabel: "自定义" });
    });

    it("重做上游会把已完成的下游标成需更新，首次生成不会", () => {
        let state = run(run(run(initialFlowState(flow), "research"), "sketch"), "plan");
        expect(nodeOf(state, "plan")?.status).toBe("done");
        state = run(state, "sketch");
        expect(nodeOf(state, "sketch")?.version).toBe(2);
        expect(nodeOf(state, "plan")?.status).toBe("stale");
        expect(nodeOf(state, "research")?.status).toBe("done");
    });

    it("下游计算包含间接依赖", () => {
        expect(downstreamOf(flow, "sketch")).toEqual(expect.arrayContaining(["plan", "render", "detail", "drawing", "board"]));
        expect(downstreamOf(flow, "board")).toEqual([]);
    });

    it("手改提示词后不再标记为模板", () => {
        let state = flowReducer(initialFlowState(flow), { type: "create", flow, key: "research" });
        state = flowReducer(state, { type: "set-prompt", key: "research", prompt: "自己写的" });
        expect(nodeOf(state, "research")).toMatchObject({ prompt: "自己写的", presetIndex: null });
        state = flowReducer(state, { type: "pick-preset", flow, key: "research", index: 1 });
        expect(nodeOf(state, "research")?.presetIndex).toBe(1);
    });

    it("节点按流程顺序排列，重复新建只会选中", () => {
        let state = flowReducer(initialFlowState(flow), { type: "create", flow, key: "plan" });
        state = flowReducer(state, { type: "create", flow, key: "research" });
        expect(state.nodes.map((node) => node.key)).toEqual(["research", "plan"]);
        state = flowReducer(state, { type: "create", flow, key: "plan" });
        expect(state.nodes).toHaveLength(2);
        expect(state.selectedKey).toBe("plan");
    });
});
