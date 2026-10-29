import { describe, expect, it } from "vitest";

import { LESSON_PLAN_LIMITS, lessonPlanMissingItems, lessonPlanTotalMinutes, normalizeLessonPlanContent, normalizeLessonPlanRehearsal, starterLessonPlan } from "./teaching-lesson-plan";

describe("normalizeLessonPlanContent", () => {
    it("returns an empty plan for garbage input", () => {
        expect(normalizeLessonPlanContent("nope")).toEqual({ objectives: [], keyPoints: "", difficulties: "", preparation: "", phases: [], homework: "", reflection: "" });
    });

    it("trims text, drops empty objectives and clamps minutes", () => {
        const content = normalizeLessonPlanContent({
            objectives: ["  能写出提示词  ", "", 42, "   "],
            keyPoints: "  重点  ",
            phases: [
                { id: "a", name: " 导入 ", minutes: 999, teacher: "讲", student: "听", notes: "", materialIds: ["m1", "m1", "", 3] },
                { id: "b", name: "练习", minutes: -4 },
            ],
        });
        expect(content.objectives).toEqual(["能写出提示词"]);
        expect(content.keyPoints).toBe("重点");
        expect(content.phases[0]).toEqual({ id: "a", name: "导入", minutes: LESSON_PLAN_LIMITS.phaseMinutes, teacher: "讲", student: "听", notes: "", materialIds: ["m1"] });
        expect(content.phases[1].minutes).toBe(0);
    });

    it("gives duplicate or missing phase ids a unique id", () => {
        const content = normalizeLessonPlanContent({ phases: [{ id: "x", name: "一" }, { id: "x", name: "二" }, { name: "三" }] });
        expect(new Set(content.phases.map((phase) => phase.id)).size).toBe(3);
    });

    it("caps list sizes and text length", () => {
        const content = normalizeLessonPlanContent({
            objectives: Array.from({ length: 50 }, (_, index) => `目标 ${index}`),
            phases: Array.from({ length: 50 }, (_, index) => ({ id: `p${index}`, name: `环节 ${index}`, minutes: 1 })),
            homework: "字".repeat(LESSON_PLAN_LIMITS.textLength + 100),
        });
        expect(content.objectives).toHaveLength(LESSON_PLAN_LIMITS.objectives);
        expect(content.phases).toHaveLength(LESSON_PLAN_LIMITS.phases);
        expect(content.homework).toHaveLength(LESSON_PLAN_LIMITS.textLength);
    });
});

describe("lessonPlanMissingItems", () => {
    it("lists what an empty plan still needs", () => {
        expect(lessonPlanMissingItems(normalizeLessonPlanContent({}))).toEqual(["至少写 1 条教学目标", "填写教学重点", "至少安排 1 个教学环节"]);
    });

    it("names the phase that is incomplete", () => {
        const content = normalizeLessonPlanContent({ objectives: ["目标"], keyPoints: "重点", phases: [{ id: "a", name: "导入", minutes: 0, teacher: "" }] });
        expect(lessonPlanMissingItems(content)).toEqual(expect.arrayContaining(["「导入」设置时长"]));
        expect(lessonPlanMissingItems(content).length).toBeGreaterThanOrEqual(1);
    });

    it("accepts the starter plan as complete", () => {
        expect(lessonPlanMissingItems(starterLessonPlan({ title: "空间效果图" }))).toEqual([]);
    });
});

describe("starterLessonPlan", () => {
    it("builds a 90-minute plan around the lesson title and attaches materials", () => {
        const content = starterLessonPlan({ title: "空间效果图", description: "生成客厅效果图" }, ["m1", "m2", "m3"]);
        expect(lessonPlanTotalMinutes(content)).toBe(90);
        expect(content.objectives[0]).toContain("空间效果图");
        expect(content.keyPoints).toContain("生成客厅效果图");
        expect(content.phases[0].materialIds).toEqual(["m1"]);
        expect(content.phases[1].materialIds).toEqual(["m2", "m3"]);
        expect(normalizeLessonPlanContent(content)).toEqual(content);
    });
});

describe("normalizeLessonPlanRehearsal", () => {
    const content = starterLessonPlan({ title: "空间效果图" });
    const at = "2026-10-28T10:00:00.000Z";

    it("keeps only phases that exist in the plan and snapshots their names", () => {
        const result = normalizeLessonPlanRehearsal(
            {
                totalSeconds: 1500.6,
                phases: [
                    { phaseId: "phase-1", seconds: 600 },
                    { phaseId: "ghost", seconds: 10 },
                ],
            },
            content,
            at,
        );
        expect(result.phases).toEqual([{ phaseId: "phase-1", name: "导入", plannedMinutes: 10, seconds: 600 }]);
        expect(result.totalSeconds).toBe(1501);
        expect(result.at).toBe(at);
    });

    it("clamps negative and huge durations", () => {
        expect(normalizeLessonPlanRehearsal({ totalSeconds: -5, phases: [] }, content, at).totalSeconds).toBe(0);
        expect(normalizeLessonPlanRehearsal({ totalSeconds: 10 ** 9, phases: [] }, content, at).totalSeconds).toBe(12 * 60 * 60);
    });
});
