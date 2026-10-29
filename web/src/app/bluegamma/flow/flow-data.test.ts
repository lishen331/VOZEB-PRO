import { describe, expect, it } from "vitest";

import { GAMMA_SUBJECTS } from "@/components/gamma-ui/gamma-subjects";
import { MAJOR_FLOWS, findFlowRefErrors, majorFlowBySlug } from "@/app/bluegamma/flow/flow-data";
import { fillBrief } from "@/app/bluegamma/flow/flow-types";

describe("专业创作流程数据", () => {
    it("12 个专业每个都有流程，且 slug 一一对应", () => {
        expect(MAJOR_FLOWS.map((flow) => flow.slug).sort()).toEqual(GAMMA_SUBJECTS.map((subject) => subject.slug).sort());
    });

    it("每条流程 4–7 步，步骤 key 不重复，每步至少一个模板", () => {
        for (const flow of MAJOR_FLOWS) {
            expect(flow.steps.length, flow.slug).toBeGreaterThanOrEqual(4);
            expect(flow.steps.length, flow.slug).toBeLessThanOrEqual(7);
            expect(new Set(flow.steps.map((step) => step.key)).size, flow.slug).toBe(flow.steps.length);
            for (const step of flow.steps) expect(step.presets.length, `${flow.slug}/${step.key}`).toBeGreaterThan(0);
        }
    });

    it("参考只能指向前面的步骤", () => {
        expect(MAJOR_FLOWS.flatMap(findFlowRefErrors)).toEqual([]);
    });

    it("文本类步骤都有演示要点，模板名在步骤内不重复", () => {
        for (const flow of MAJOR_FLOWS) {
            for (const step of flow.steps) {
                if (step.kind === "text") expect(step.sample?.length, `${flow.slug}/${step.key}`).toBeGreaterThan(0);
                expect(new Set(step.presets.map((preset) => preset.name)).size, `${flow.slug}/${step.key}`).toBe(step.presets.length);
            }
        }
    });

    it("fillBrief 替换课题，空课题有兜底", () => {
        expect(fillBrief("做「{课题}」的调研", "LOFT 公寓")).toBe("做「LOFT 公寓」的调研");
        expect(fillBrief("做「{课题}」", "  ")).toBe("做「我的课题」");
    });

    it("未知 slug 回落到室内设计", () => {
        expect(majorFlowBySlug("nope").slug).toBe("interior");
    });
});
