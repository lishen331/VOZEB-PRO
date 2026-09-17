import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");
const routePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/episodes/[episodeId]/storyboards/generate/route.ts");
const optionsPath = resolve(process.cwd(), "src/lib/drama-lab-storyboard-options.ts");

/**
 * L §4 配置行：分镜数量 / 视频总时长 / 全能分镜模式 / 生成解说旁白。
 *
 * 重点不是「有没有控件」，而是**这些值真的会影响拆解结果**：
 * UI → 请求体 storyboardOptions → 服务端校验 → 工作流 → 拆解提示词约束。
 * 只要中间断一环，就是一排点了不生效的开关。
 */
describe("one-click-film storyboard config row", () => {
    it("exposes L's four config controls", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('aria-label="分镜数量"');
        expect(source).toContain('aria-label="视频总时长"');
        expect(source).toContain('aria-label="全能分镜模式"');
        expect(source).toContain('aria-label="生成解说旁白"');
    });

    it("keeps L's blank-means-auto semantics", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 留空不应发送该字段，交给 AI 决定；不能默认塞一个数字进去
        expect(source).toContain("shotCount.trim() ? { shotCount: shotCount.trim() } : {}");
        expect(source).toContain("totalDuration.trim() ? { totalDuration: totalDuration.trim() } : {}");
    });

    it("sends the options to the regenerate route", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("/storyboards/generate");
        expect(source).toContain("JSON.stringify({ storyboardOptions })");
        expect(source).toContain('creationMode: universalMode ? "universal" : "classic"');
        expect(source).toContain("generateNarration,");
    });

    it("validates the options server-side instead of trusting the client", async () => {
        const route = await readFile(routePath, "utf8");
        expect(route).toContain("normalizeDramaLabStoryboardOptions");
        expect(route).toContain("body.storyboardOptions");
        // 非法参数是调用方问题，必须回 400 而不是一律 500
        expect(route).toContain("DramaLabStoryboardOptionsError ? 400 : 500");
    });

    it("forwards the options into the workflow rather than hardcoding them", async () => {
        const route = await readFile(routePath, "utf8");
        // 早期版本把 options 写死，导致配置行不可能生效
        expect(route).toContain("Object.keys(storyboardOptions).length ? { storyboardOptions } : {}");
    });

    it("reaches the extraction prompt for all four fields", async () => {
        // 终点证据：这四项都必须能变成拆解提示词约束
        const options = await readFile(optionsPath, "utf8");
        expect(options).toContain("shotCount");
        expect(options).toContain("totalDuration");
        expect(options).toContain("creationMode");
        expect(options).toContain("generateNarration");
        expect(options).toContain("dramaLabStoryboardConstraintText");
    });
});
