import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panelPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-asset-panel.tsx");
const singleRoutePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/assets/[assetId]/generate-image/route.ts");
const batchRoutePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/assets/batch-generate-images/route.ts");
const servicePath = resolve(process.cwd(), "src/lib/server/one-click-film/asset-image-service.ts");

/**
 * 资产设定图版式开关，对应 L 的 `propUseQuadGrid`（生成四视图道具）与
 * `sceneUseQuadGrid`（生成四宫格场景），默认单图。
 *
 * 服务端本来就接收 generationLayout，但此前 UI 从不让用户选，属于
 * 「后端有、前端没接 = 等于没做」。这里锁住 UI → 单个/批量路由 → 服务端解析整条链路。
 */
describe("one-click-film asset layout toggle", () => {
    it("offers L's quad toggles for props and scenes", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain('aria-label={kind === "props" ? "生成四视图道具" : "生成四宫格场景"}');
        expect(source).toContain("生成四视图道具（默认单图，纯色无缝背景）");
        expect(source).toContain("生成四宫格场景（默认单图）");
    });

    it("hides the toggle for characters, matching L", async () => {
        const source = await readFile(panelPath, "utf8");
        // L 角色区没有这个勾选：四视图写死在后端角色提示词里
        expect(source).toContain('{kind !== "characters" ? (');
        expect(source).toContain("quadGrid: { props: boolean; scenes: boolean }".replace("quadGrid: ", ""));
    });

    it("defaults both kinds to single image like L", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("{ props: false, scenes: false }");
    });

    it("sends the chosen layout on both single and batch generation", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("generationLayout: layoutForKind(asset)");
        expect(source).toContain("generationLayout: layoutForKind()");
    });

    it("keeps characters pinned to four_view", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain('if (kind === "characters") return "four_view";');
        const service = await readFile(servicePath, "utf8");
        // 服务端同样兜底：角色永远 four_view，前端传什么都不改变这一点
        expect(service).toContain('if (kind === "characters") return "four_view" as const;');
    });

    it("is actually consumed by both routes", async () => {
        // 终点证据：两条路由都读 generationLayout，否则 UI 选了也没用
        const single = await readFile(singleRoutePath, "utf8");
        expect(single).toContain("generationLayout");
        const batch = await readFile(batchRoutePath, "utf8");
        expect(batch).toContain("generationLayout");
        expect(batch).toContain("requestedLayout");
    });
});
