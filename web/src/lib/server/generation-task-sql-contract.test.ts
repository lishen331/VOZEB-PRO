import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
describe("generation task insert SQL", () => {
    it("keeps columns, placeholders and school/surface values aligned", async () => {
        const source = await readFile(new URL("./generation-task-store.ts", import.meta.url), "utf8");
        const inserts = [...source.matchAll(/INSERT INTO generation_tasks \(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)/g)];
        expect(inserts).toHaveLength(2);
        for (const match of inserts) {
            const columns = match[1].split(",").map((v) => v.trim());
            const values = match[2].split(",");
            expect(values.length).toBe(columns.length);
            expect(columns.indexOf("school_id")).toBe(10);
            expect(columns.indexOf("surface")).toBe(11);
        }
        const taskValues = source.slice(source.indexOf("function taskValues<"), source.indexOf("async function readFileTasks"));
        expect(taskValues.indexOf("context.schoolId || null")).toBeLessThan(taskValues.indexOf("context.surface || null"));
    });
});
