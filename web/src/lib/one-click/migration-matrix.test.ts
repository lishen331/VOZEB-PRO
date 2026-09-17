import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 计划 Task 1 的守卫测试。
 *
 * 目的不是统计接口数量，而是防止两类已经真实发生过的错误：
 * 1. 把"创作工坊已有功能"当作一键成片的迁移基线（规范 §9.3 明确禁止）；
 * 2. 在没有 L/V 差异矩阵与证据的情况下宣称迁移完成（规范 §9.3）。
 */
const matrixPath = resolve(process.cwd(), "../docs/superpowers/specs/2026-09-15-one-click-video-production-l-v-matrix.zh-CN.md");

async function matrix() {
    return readFile(matrixPath, "utf8");
}

describe("one-click-film L/V migration baseline", () => {
    it("keeps the difference matrix present as the migration baseline", async () => {
        const source = await matrix();
        expect(source).toContain("LocalMiniDrama");
        expect(source).toContain("差异矩阵");
    });

    it("states L is the baseline and the teaching workshop is not", async () => {
        const source = await matrix();
        expect(source).toMatch(/基线是 \*\*L\*\*|基线是 L|基线：.*LocalMiniDrama/);
        expect(source).toMatch(/创作工坊[^\n]*(不改|无关|不作为)/);
    });

    it("records the corrected false conclusions so they are not repeated", async () => {
        const source = await matrix();
        expect(source).toContain("requireFeatureModuleEnabled");
        expect(source).toContain("只控前端显示");
        expect(source).toMatch(/未覆盖\s?UI\s?暴露面/);
    });

    it("flags the drama-lab billing attribution defect as P0", async () => {
        const source = await matrix();
        expect(source).toContain('featureModule: "drama-lab"');
        expect(source).toMatch(/计费/);
    });

    it("does not claim completion while P0 domains remain unmigrated", async () => {
        const source = await matrix();
        expect(source).toContain("不具备可测条件");
        // 只拦"肯定式完成宣称"。"迁移完成度 9%" 这类度量措辞必须放过，
        // 否则断言会把如实报告缺口的文字也判红。
        expect(source).not.toMatch(/迁移已完成|已完成 ?1:1|全部迁移完毕|可以开始测试/);
        // P0 域必须仍标注未迁移，否则说明有人把缺口悄悄划掉了。
        expect(source).toContain("未迁移");
    });
});
