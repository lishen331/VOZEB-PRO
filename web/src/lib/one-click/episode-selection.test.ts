import { describe, it, expect } from "vitest";
import { selectEpisode, replaceEpisode } from "./episode-selection";
const episodes = [
    { id: "e1", script: "第一集" },
    { id: "e2", script: "第二集" },
];
describe("episode selection", () => {
    it("honors an explicitly selected second episode", () => expect(selectEpisode(episodes, "e2", "e1")?.id).toBe("e2"));
    it("restores the persisted active episode", () => expect(selectEpisode(episodes, undefined, "e2")?.id).toBe("e2"));
    it("falls back for stale ids and handles an empty project", () => {
        expect(selectEpisode(episodes, "deleted", "e2")?.id).toBe("e2");
        expect(selectEpisode([], "deleted", undefined)).toBeUndefined();
    });
    it("updates the selected episode without replacing or reordering siblings", () => {
        const result = replaceEpisode(episodes, { id: "e2", script: "修改第二集" });
        expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
        expect(result[0]).toBe(episodes[0]);
        expect(result[1].script).toBe("修改第二集");
    });
});
