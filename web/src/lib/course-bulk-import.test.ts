import { describe, expect, it } from "vitest";

import { BULK_IMPORT_COLUMNS, courseBulkImportTemplateRows, planCourseBulkImport } from "./course-bulk-import";

const tree = { chapters: [{ id: "c1", title: "第一章 入门", lessons: [{ id: "l1", title: "第一课" }] }] };
const files = [
    { fileName: "第一课-课件.pdf", storageKey: "k1" },
    { fileName: "第二课.pptx", storageKey: "k2" },
    { fileName: "补充.zip", storageKey: "k3" },
];
const header = [...BULK_IMPORT_COLUMNS];

describe("course bulk import plan", () => {
    it("matches existing chapters and lessons by name and plans new ones", () => {
        const plan = planCourseBulkImport([header, ["第一章 入门", " 第一课 ", "第一课-课件.pdf", ""], ["第一章  入门", "第二课", "第二课.pptx", "第二课课件"], [], ["第二章", "第三课", "补充.zip", ""]], tree, files);

        expect(plan.errors).toEqual([]);
        expect(plan.rows.map((row) => [row.chapterId, row.lessonId, row.title, row.storageKey])).toEqual([
            ["c1", "l1", "第一课-课件.pdf", "k1"],
            ["c1", "", "第二课课件", "k2"],
            ["", "", "补充.zip", "k3"],
        ]);
        expect(plan.newChapters).toEqual(["第二章"]);
        expect(plan.newLessons).toEqual(["第一章 入门 / 第二课", "第二章 / 第三课"]);
        expect(plan.unusedFiles).toEqual([]);
    });

    it("reports missing columns, unknown files, duplicates and incomplete rows with line numbers", () => {
        expect(planCourseBulkImport([["章节名", "文件名"]], tree, files).errors[0]).toContain("课时名");

        const plan = planCourseBulkImport([header, ["第一章 入门", "第一课", "不存在.pdf"], ["第一章 入门", "", "第二课.pptx"], ["第一章 入门", "第一课", "补充.zip"], ["第一章 入门", "第一课", "补充.zip"]], tree, files);

        expect(plan.errors).toEqual(["第 2 行：没有找到已上传的文件「不存在.pdf」", "第 3 行：章节名、课时名、文件名都要填", "第 5 行：文件「补充.zip」在表里出现了不止一次"]);
        expect(plan.unusedFiles).toEqual(["第一课-课件.pdf", "第二课.pptx"]);
    });

    it("matches uploaded files whose names contain repeated or full-width whitespace", () => {
        const spaced = [
            { fileName: "第一课  课件.pdf", storageKey: "s1" },
            { fileName: "第二课　讲义.pdf", storageKey: "s2" },
        ];
        const template = courseBulkImportTemplateRows(tree, spaced);
        const plan = planCourseBulkImport([header, ["第一章 入门", "第一课", template[1][2]], ["第一章 入门", "第一课", "第二课　讲义.pdf"]], tree, spaced);

        expect(plan.errors).toEqual([]);
        expect(plan.rows.map((row) => row.storageKey)).toEqual(["s1", "s2"]);
        expect(plan.unusedFiles).toEqual([]);
    });

    it("rejects uploads whose names collide after whitespace cleanup", () => {
        const plan = planCourseBulkImport([header, ["第一章 入门", "第一课", "课件 一.pdf"]], tree, [
            { fileName: "课件 一.pdf", storageKey: "a" },
            { fileName: "课件  一.pdf", storageKey: "b" },
        ]);

        expect(plan.errors[0]).toContain("去掉多余空格后同名");
    });

    it("rejects an empty sheet and oversized sheets", () => {
        expect(planCourseBulkImport([header], tree, files).errors).toEqual(["表格里没有数据行"]);
        expect(planCourseBulkImport([header, ...Array.from({ length: 501 }, () => ["a", "b", "c"])], tree, files).errors[0]).toContain("500");
    });

    it("prefills the template with lessons and files whose names start with the lesson title", () => {
        expect(courseBulkImportTemplateRows(tree, files)).toEqual([header, ["第一章 入门", "第一课", "第一课-课件.pdf", ""], ["", "", "第二课.pptx", ""], ["", "", "补充.zip", ""]]);
    });
});
