import { describe, expect, it } from "vitest";

import { TEACH_CLASSES, overall, stepAverages, stuckStep } from "@/app/bluegamma/courses/teach-data";

describe("教师看板演示数据", () => {
    it("确定性：同一份数据重复计算结果一致", () => {
        const first = TEACH_CLASSES.map((group) => stepAverages(group).join(","));
        const again = TEACH_CLASSES.map((group) => stepAverages(group).join(","));
        expect(again).toEqual(first);
    });

    it("每个学生的进度长度 = 课节数，且是「前面全 1、当前 0..1、后面 null」的形状", () => {
        for (const group of TEACH_CLASSES) {
            for (const student of group.students) {
                expect(student.progress).toHaveLength(group.course.lessons.length);
                const firstNull = student.progress.indexOf(null);
                const cut = firstNull === -1 ? student.progress.length : firstNull;
                expect(student.progress.slice(cut).every((value) => value === null)).toBe(true);
                expect(student.progress.slice(0, Math.max(0, cut - 1)).every((value) => value === 1)).toBe(true);
            }
        }
    });

    it("平均完成度随步骤不增（越往后做的人越少），整体完成度在 0..100", () => {
        for (const group of TEACH_CLASSES) {
            const averages = stepAverages(group);
            for (let i = 1; i < averages.length; i += 1) expect(averages[i]).toBeLessThanOrEqual(averages[i - 1]);
            expect(overall(group)).toBeGreaterThanOrEqual(0);
            expect(overall(group)).toBeLessThanOrEqual(100);
        }
    });

    it("卡点指向一个真实存在的步骤，人数不超过班级人数", () => {
        for (const group of TEACH_CLASSES) {
            const stuck = stuckStep(group);
            expect(stuck.index).toBeGreaterThanOrEqual(0);
            expect(stuck.index).toBeLessThan(group.course.lessons.length);
            expect(stuck.count).toBeLessThanOrEqual(group.students.length);
        }
    });

    it("下一节课的课节号在课程范围内", () => {
        for (const group of TEACH_CLASSES) expect(group.course.lessons[group.schedule.lessonIndex]).toBeTruthy();
    });
});
