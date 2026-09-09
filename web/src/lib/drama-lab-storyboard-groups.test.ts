import { describe, expect, it } from "vitest";
import { groupStoryboardShots } from "./drama-lab-storyboard-groups";

describe("groupStoryboardShots", () => {
    it("returns no groups for no shots", () => {
        expect(groupStoryboardShots([])).toEqual([]);
    });

    it("groups contiguous segments without sorting or changing shot identities", () => {
        const shots = [
            { id: "b", shotNumber: 7, segmentIndex: 0, segmentTitle: "开端", prompt: "保留" },
            { id: "a", shotNumber: 9, segmentIndex: 0, segmentTitle: "开端", prompt: "原值" },
            { id: "c", shotNumber: 3, segmentIndex: 1, segmentTitle: "转折", prompt: "继续" },
            { id: "d", shotNumber: 4, segmentIndex: 0, segmentTitle: "开端", prompt: "回到" },
        ];
        const groups = groupStoryboardShots(Object.freeze(shots));
        expect(groups.map((group) => group.shots.map((shot) => shot.id))).toEqual([["b", "a"], ["c"], ["d"]]);
        expect(groups.flatMap((group) => group.shots)).toEqual(shots);
        expect(groups[0].shots[0]).toBe(shots[0]);
        expect(groups[0]).toMatchObject({ id: "b", label: "第 1 幕 · 开端", rangeLabel: "镜头 7–9", startShotNumber: 7, endShotNumber: 9 });
        expect(groups[1].rangeLabel).toBe("镜头 3");
        expect(new Set(groups.map((group) => group.id)).size).toBe(3);
    });

    it("never invents act numbers for missing metadata and keeps unassigned runs separate", () => {
        const groups = groupStoryboardShots([
            { id: "a", shotNumber: 1 },
            { id: "b", shotNumber: 2 },
            { id: "c", shotNumber: 3, segmentIndex: 2 },
            { id: "d", shotNumber: 4 },
        ]);
        expect(groups.map((group) => group.label)).toEqual(["未分幕", "第 3 幕", "未分幕"]);
        expect(groups[0].segmentIndex).toBeUndefined();
        expect(groups[0].shots).toHaveLength(2);
    });

    it("uses supplied titles without assigning an index and splits distinct title-only segments", () => {
        const groups = groupStoryboardShots([
            { id: "a", shotNumber: 1, segmentTitle: " 开端 " },
            { id: "b", shotNumber: 2, segmentTitle: "开端" },
            { id: "c", shotNumber: 3, segmentTitle: "转折" },
            { id: "d", shotNumber: 4, segmentTitle: " " },
        ]);
        expect(groups.map((group) => group.label)).toEqual(["开端", "转折", "未分幕"]);
        expect(groups[0].shots).toHaveLength(2);
        expect(groups[0].segmentIndex).toBeUndefined();
    });

    it("uses explicit segment identity even when a shot has no title", () => {
        const groups = groupStoryboardShots([
            { id: "a", shotNumber: 1, segmentIndex: 0 },
            { id: "b", shotNumber: 2, segmentIndex: 0, segmentTitle: "开端" },
            { id: "c", shotNumber: 3, segmentTitle: "开端" },
        ]);
        expect(groups.map((group) => group.shots.length)).toEqual([2, 1]);
        expect(groups[0].label).toBe("第 1 幕 · 开端");
    });

    it.each([-1, 0.5, NaN, Infinity])("does not turn invalid index %s into an act", (segmentIndex) => {
        expect(groupStoryboardShots([{ id: "a", shotNumber: 1, segmentIndex }])[0].label).toBe("未分幕");
    });
});
