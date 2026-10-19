import { describe, expect, it } from "vitest";

import type { CourseChapter, CourseLesson } from "@/lib/school-domain";
import { flattenLessons, parseTeachingTab, prepBackHref, resolvePrepLesson, teachingCourseHref, teachingHref } from "./teaching-routes";

function lesson(id: string, chapterId: string, sortOrder: number): CourseLesson {
    return { id, courseId: "course", chapterId, title: id, description: "", sortOrder, materials: [], createdAt: "", updatedAt: "" };
}

function chapter(id: string, sortOrder: number, lessons: CourseLesson[]): CourseChapter {
    return { id, courseId: "course", title: id, description: "", sortOrder, materials: [], lessons, createdAt: "", updatedAt: "" };
}

describe("teaching routes", () => {
    it("builds L1 tab links, keeping the default tab parameter-free", () => {
        expect(teachingHref()).toBe("/teaching");
        expect(teachingHref("prep")).toBe("/teaching");
        expect(teachingHref("assignments")).toBe("/teaching?tab=assignments");
    });

    it("falls back to the prep tab for unknown values", () => {
        expect(parseTeachingTab(null)).toBe("prep");
        expect(parseTeachingTab("orders")).toBe("orders");
        expect(parseTeachingTab("commercial-orders")).toBe("prep");
    });

    it("builds L2 links that remember where the teacher came from", () => {
        expect(teachingCourseHref("a/1")).toBe("/teaching/courses/a%2F1");
        expect(teachingCourseHref("a1", { lessonId: "l2", from: "classes" })).toBe("/teaching/courses/a1?lesson=l2&from=classes");
        expect(teachingCourseHref("a1", { from: "prep" })).toBe("/teaching/courses/a1");
        expect(prepBackHref("classes")).toBe("/teaching?tab=classes");
        expect(prepBackHref(null)).toBe("/teaching");
    });

    it("numbers lessons across chapters in sort order", () => {
        const tree = { chapters: [chapter("c2", 2, [lesson("l3", "c2", 1)]), chapter("c1", 1, [lesson("l2", "c1", 2), lesson("l1", "c1", 1)])] };
        expect(flattenLessons(tree).map((item) => [item.id, item.number, item.chapter.id])).toEqual([
            ["l1", 1, "c1"],
            ["l2", 2, "c1"],
            ["l3", 3, "c2"],
        ]);
    });

    it("opens the requested lesson, else the first unprepared one, else the first", () => {
        const lessons = flattenLessons({ chapters: [chapter("c1", 1, [lesson("l1", "c1", 1), lesson("l2", "c1", 2)])] });
        expect(resolvePrepLesson(lessons, "l2")?.id).toBe("l2");
        expect(resolvePrepLesson(lessons, "missing", ["l1"])?.id).toBe("l2");
        expect(resolvePrepLesson(lessons, null, ["l1", "l2"])?.id).toBe("l1");
        expect(resolvePrepLesson([], null)).toBeNull();
    });
});
