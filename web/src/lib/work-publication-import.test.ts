import { describe, expect, it } from "vitest";
import { cleanOfficialWorkTitle, normalizeOfficialCategory } from "./work-publication-import";

describe("official work import normalization", () => {
    it.each([
        ["01_建筑室内空间设计", "视觉设计"],
        ["02_电商产品虚拟摄影", "摄影"],
        ["03_创意广告品牌设计", "品牌内容"],
        ["04_创意脑洞特效合成", "视觉设计"],
        ["06_平面设计视觉传达", "视觉设计"],
        ["07_艺术插画创意风格", "插画"],
        ["08_图像分析信息拆解", "视觉设计"],
        ["09_故事分镜角色设定", "插画"],
        ["10_卡通漫画电影游戏", "插画"],
        ["11_图像编辑与修复增强", "视觉设计"],
        ["12_手工玩具微缩手办", "插画"],
        ["13_特定场景环境生成", "视觉设计"],
        ["14_社交媒体营销", "品牌内容"],
        ["15_表情包趣味拼图", "品牌内容"],
        ["05_人物肖像与写实摄影", "摄影"],
        ["05_生活时尚短视频Vlog", "视频"],
        ["插画", "插画"],
        ["摄影", "摄影"],
        ["品牌内容", "品牌内容"],
        ["视频", "视频"],
        ["短剧", "短剧"],
    ])("maps %s to %s", (input, expected) => expect(normalizeOfficialCategory(input)).toBe(expected));

    it("removes internal filename suffixes", () => {
        expect(cleanOfficialWorkTitle("地标建筑生长动画_8tgkoxugln")).toBe("地标建筑生长动画");
    });
});
