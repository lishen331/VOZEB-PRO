import { describe, expect, it } from "vitest";
import { expressionLesson, readExpressionSelection } from "./practice-expression-learning";

const selection = { face: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, expressionId: "smile", intensity: "strong", excitement: 0.8, affinity: 0.2 };

describe("expression practice snapshots", () => {
    it("derives the submitted prompt and lesson from exactly the same instruction parts", () => {
        const value = readExpressionSelection(selection)!;
        const lesson = expressionLesson(value);
        expect(lesson.rows.map((row) => row.value)).toEqual(["画面中位于约 20% 横向、30% 纵向的人物脸部", "强烈地呈现“微笑”表情（柔和微笑）", "整体情绪更激动、更疏离", "保留身份、发型、构图和光线"]);
        expect(lesson.prompt).toBe(lesson.rows.map((row) => row.value).join("，") + "。");
    });

    it("rejects malformed and out-of-bounds choices, and strips non-teaching data", () => {
        expect(readExpressionSelection({ ...selection, excitement: Infinity })).toBeNull();
        expect(readExpressionSelection({ ...selection, face: { ...selection.face, x: 0.9 } })).toBeNull();
        expect(readExpressionSelection({ ...selection, expressionId: "unknown" })).toBeNull();
        expect(readExpressionSelection({ ...selection, face: { ...selection.face, score: 0.95 }, extra: "foo" })).toEqual(selection);
    });
});
