import { describe, expect, it } from "vitest";
import { validateDramaLabUniversalVideoPrompt } from "./drama-lab-universal-video";
const prompt = "画面风格和类型: 写实\n生成一个由以下2个分镜组成的视频。\n环境参考 @图片1。\n分镜1： 1.5秒: 缓推 @图片2 后横移。\n分镜2： 1.5秒: 跟拍 @图片2 后拉回。";
describe("universal multi-beat video contract", () => {
    it("accepts matching fractional beat durations and valid image slots", () => {
        expect(() => validateDramaLabUniversalVideoPrompt(prompt, 3, 2)).not.toThrow();
    });
    it.each([
        { text: prompt.replace("1.5秒", "2秒"), seconds: 3, refs: 2 },
        { text: prompt.replace("以下2个", "以下3个"), seconds: 3, refs: 2 },
        { text: prompt.replace("分镜2：", "分镜3："), seconds: 3, refs: 2 },
        { text: prompt.replaceAll("@图片2", "@图片3"), seconds: 3, refs: 2 },
        { text: prompt.replaceAll("@图片2", "@人物2"), seconds: 3, refs: 2 },
        { text: "单行旧格式", seconds: 3, refs: 1 },
    ])("rejects malformed timing or reference numbering", ({ text, seconds, refs }) => {
        expect(() => validateDramaLabUniversalVideoPrompt(text, seconds, refs)).toThrow();
    });
});
