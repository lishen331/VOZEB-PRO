import { describe, expect, it } from "vitest";
import { cleanOfficialWorkTitle, normalizeOfficialCategory } from "./work-publication-import";

describe("official work import normalization", () => {
    it.each([
        ["01_建筑室内空间设计", "视觉设计"],
        ["02_广告营销电商宣传", "品牌内容"],
        ["03_电影影视剧情创作", "视频"],
        ["04_动漫游戏视觉与IP改编", "插画"],
        ["05_生活时尚短视频Vlog", "视频"],
    ])("maps %s to %s", (input, expected) => expect(normalizeOfficialCategory(input)).toBe(expected));

    it("removes internal filename suffixes", () => {
        expect(cleanOfficialWorkTitle("地标建筑生长动画_8tgkoxugln")).toBe("地标建筑生长动画");
    });
});
