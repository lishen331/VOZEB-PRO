import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebarPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-nav-sidebar.tsx");
const projectPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");
const assetPanelPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-asset-panel.tsx");
const shotCardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");

/**
 * 侧栏对齐 L `FilmCreate.vue` 的 `.quick-nav`。
 *
 * 状态计算的行为测试在 `src/lib/one-click/nav-steps.test.ts`；这里只锁「真的接进页面了」
 * 与「跳转锚点真实存在」——光有组件不算做完，跳到不存在的 DOM 等于按钮是死的。
 */
describe("one-click-film nav sidebar wiring", () => {
    it("is mounted in the workspace with L's layout shell", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain("OneClickFilmNavSidebar");
        expect(source).toContain("<OneClickFilmNavSidebar");
        // L 是「左固定侧栏 + 右可滚动主区」，不是我之前发明的上下堆叠
        expect(source).toContain('className="flex h-full bg-background text-foreground"');
    });

    it("keeps L's 180px / 48px sidebar widths", async () => {
        const source = await readFile(sidebarPath, "utf8");
        expect(source).toContain("collapsed ? 48 : 180");
    });

    it("caps the active-task list at 8 like L and keeps it scrollable", async () => {
        const source = await readFile(sidebarPath, "utf8");
        expect(source).toContain("ACTIVE_TASK_LIMIT = 8");
        expect(source).toContain("还有 {activeTasks.length - ACTIVE_TASK_LIMIT} 个任务...");
        // 用户明确要求：任务一直加也要能滑到
        expect(source).toContain("overflow-y-auto");
        expect(source).toContain("max-h-[180px]");
    });

    it("only offers cancel where a real cancel path exists", async () => {
        const sidebar = await readFile(sidebarPath, "utf8");
        // 不给不可取消的条目放一个点了没反应的 ✕
        expect(sidebar).toContain("onCancelTask && task.cancelable");
        const page = await readFile(projectPath, "utf8");
        expect(page).toContain("cancelable: true");
        expect(page).toContain('item.id.startsWith("workflow:")');
    });

    it("resolves every sidebar anchor to a real DOM id", async () => {
        const page = await readFile(projectPath, "utf8");
        const assetPanel = await readFile(assetPanelPath, "utf8");
        // 非资产锚点必须在页面里有对应 id
        for (const anchor of ["anchor-script", "anchor-storyboard", "anchor-video"]) {
            expect(page).toContain(`id="${anchor}"`);
        }
        // 资产三锚点走「切页签 + 滚到资产区」，故资产区必须有 anchor-assets
        expect(assetPanel).toContain('id="anchor-assets"');
        for (const anchor of ["anchor-characters", "anchor-props", "anchor-scenes"]) {
            expect(page).toContain(anchor);
        }
    });

    it("switches the asset tab when jumping to an asset step", async () => {
        const page = await readFile(projectPath, "utf8");
        expect(page).toContain("ASSET_ANCHORS");
        expect(page).toContain("setAssetKind(assetKindForAnchor)");
        expect(page).toContain("kind={assetKind}");
        expect(page).toContain("onKindChange={setAssetKind}");
        const assetPanel = await readFile(assetPanelPath, "utf8");
        // 面板必须支持受控 kind，否则父组件切不动
        expect(assetPanel).toContain("kind: controlledKind");
        expect(assetPanel).toContain("controlledKind ?? innerKind");
    });

    it("gives each shot card a jump target", async () => {
        const cards = await readFile(shotCardsPath, "utf8");
        expect(cards).toContain("id={`one-click-shot-${shot.id}`}");
        const page = await readFile(projectPath, "utf8");
        expect(page).toContain("one-click-shot-${shotId}");
    });
});
