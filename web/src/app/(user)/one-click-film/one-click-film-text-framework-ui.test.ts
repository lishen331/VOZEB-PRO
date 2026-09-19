import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");
const routePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/tasks/route.ts");
const enginePath = resolve(process.cwd(), "src/lib/server/one-click-film/engine.ts");

/**
 * L §2 的第二个入口：`startTextFrameworkPipeline`（生成文本框架）。
 *
 * 跳过语义的行为测试在 `src/lib/server/one-click-film/engine.test.ts`；
 * 这里锁「有入口」「模式真的送到服务端」「跳过发生在服务端而非前端假装」。
 */
describe("one-click-film text framework entry", () => {
    it("exposes both of L's §2 entries", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain('aria-label="一键成片带图片视频"');
        expect(source).toContain('aria-label="生成文本框架"');
        expect(source).toContain('void startWorkflow("full")');
        expect(source).toContain('void startWorkflow("text_framework")');
    });

    it("carries L's tooltip so the narrower scope is explicit", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain("仅提取角色、场景、道具与生成分镜文本，不生成图片与视频");
    });

    it("only spins the button that was pressed", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain('loading={starting === "full"}');
        expect(source).toContain('loading={starting === "text_framework"}');
        // 两个入口互斥，避免同时起两个父任务
        expect(source).toContain("disabled={Boolean(starting)}");
    });

    it("sends the mode through options rather than faking it client-side", async () => {
        const source = await readFile(projectPath, "utf8");
        expect(source).toContain('mode === "text_framework" ? { mode }');
        expect(source).toContain("composeOptions:");
        // 请求编号带上模式，避免两个入口撞同一个 clientRequestId 被当成重复请求
        expect(source).toContain("one-click-ui:${mode}");
    });

    it("is forwarded by the tasks route", async () => {
        const route = await readFile(routePath, "utf8");
        expect(route).toContain('options: typeof body.options === "object"');
    });

    it("skips media steps server-side, so no upstream spend happens", async () => {
        // 终点证据：跳过在引擎里落到 step.status，前端无法绕过
        const engine = await readFile(enginePath, "utf8");
        expect(engine).toContain("TEXT_FRAMEWORK_SKIPPED");
        expect(engine).toContain('new Set(["images", "videos", "audio", "compose"])');
        expect(engine).toContain('input.options?.mode === "text_framework"');
        // 步骤仍保留在列表里，便于 UI 显示"已跳过"
        expect(engine).toContain('("skipped" as const)');
    });
});
