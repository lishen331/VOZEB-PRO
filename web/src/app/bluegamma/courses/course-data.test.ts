import { describe, expect, it } from "vitest";

import { MAJOR_FLOWS } from "@/app/bluegamma/flow/flow-data";
import { COURSES, COURSE_FAMILIES, courseBySlug } from "@/app/bluegamma/courses/course-data";

describe("教师备课演示数据", () => {
    it("每个专业一门课，课节与专业流程步骤一一对应", () => {
        expect(COURSES).toHaveLength(MAJOR_FLOWS.length);
        for (const flow of MAJOR_FLOWS) {
            const course = courseBySlug(flow.slug);
            expect(course?.lessons.map((lesson) => lesson.key)).toEqual(flow.steps.map((step) => step.key));
        }
    });

    it("每节课 7 页课件，类型齐全且不重复；示范页带提示词，且课题已替换", () => {
        for (const course of COURSES) {
            for (const lesson of course.lessons) {
                const kinds = lesson.slides.map((slide) => slide.kind);
                expect(new Set(kinds).size, `${course.slug}/${lesson.key}`).toBe(7);
                const prompt = lesson.slides.find((slide) => slide.kind === "prompt")?.code ?? "";
                expect(prompt.length).toBeGreaterThan(0);
                expect(prompt).not.toContain("{课题}");
            }
        }
    });

    it("教学过程加起来是一节 90 分钟的课", () => {
        for (const course of COURSES) {
            for (const lesson of course.lessons) expect(lesson.phases.reduce((sum, phase) => sum + phase.minutes, 0)).toBe(90);
        }
    });

    it("专业大类覆盖全部 12 门课且不重叠", () => {
        const slugs = COURSE_FAMILIES.flatMap((family) => family.slugs);
        expect(new Set(slugs).size).toBe(slugs.length);
        expect([...slugs].sort()).toEqual(COURSES.map((course) => course.slug).sort());
    });

    it("未知课程返回 null", () => {
        expect(courseBySlug("nope")).toBeNull();
        expect(courseBySlug(null)).toBeNull();
    });
});
