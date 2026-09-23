import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspacePath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");

/**
 * 本集成片与下载的 UI 契约。
 *
 * 对应 L `POST /episodes/:episode_id/finalize` 与 `GET /episodes/:episode_id/download`。
 */
describe("one-click-film episode render UI", () => {
    it("creates the render task through the one-click-film route", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("/episodes/${encodeURIComponent(episodeId)}/render");
        expect(source).not.toContain("/api/drama-lab");
        // L §6 的按钮文案就是「合成视频」；此前 V 写的是「合成本集成片」，本轮对齐 L 改名。
        expect(source).toContain('aria-label="合成视频"');
        expect(source).toContain("clientRequestId");
    });

    it("polls the render task instead of faking progress", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("refreshRenderTask");
        // 状态由服务端持久化，前端只轮询；不得用 setTimeout 假装完成
        expect(source).toContain('["pending", "running"].includes(renderTask.status)');
        expect(source).toContain("window.setInterval");
    });

    it("declares render hooks before the early returns", async () => {
        const source = await readFile(workspacePath, "utf8");
        // React Hook 规则：useCallback/useEffect 不能落在 if (loading) 之后
        const hookIndex = source.indexOf("const refreshRenderTask = useCallback");
        const earlyReturnIndex = source.indexOf("    if (loading)");
        expect(hookIndex).toBeGreaterThan(0);
        expect(earlyReturnIndex).toBeGreaterThan(0);
        expect(hookIndex).toBeLessThan(earlyReturnIndex);
    });

    it("only offers the download once an artifact exists", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("renderTask?.result?.artifactId");
        expect(source).toContain("/render/artifact/");
        expect(source).toContain("taskId=");
        expect(source).toContain('aria-label="下载成片"');
        // 成片相关入口必须集中在 §6，不能又回到 header 造成重复
        expect(source).not.toContain('aria-label="合成本集成片"');
    });

    it("keeps the project export entry separate from the episode download", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("/export");
        expect(source).toContain('aria-label="导出项目"');
    });
});
