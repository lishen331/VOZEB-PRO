import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");

/**
 * L §4 批量操作：批量生成分镜图 / 批量生成分镜视频 / 停止图片 / 停止视频。
 *
 * 编排语义的真实行为测试在 `src/lib/one-click/batch-media.test.ts`；
 * 这里只锁「按钮真的接到编排模块」与「停止用 ref 而非 state 快照」。
 */
describe("one-click-film batch media wiring", () => {
    it("exposes L's four batch controls", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('aria-label="批量生成分镜图"');
        expect(source).toContain('aria-label="批量生成分镜视频"');
        expect(source).toContain('"停止图片" : "停止视频"');
    });

    it("delegates orchestration to the tested module", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('from "@/lib/one-click/batch-media"');
        expect(source).toContain('void runBatch("image")');
        expect(source).toContain('void runBatch("video")');
        expect(source).toContain("runBatchMedia(episode.shots, kind,");
    });

    it("reads the stop flag from a ref so workers see the latest value", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 用 state 快照的话，已启动的 worker 循环读不到停止请求
        expect(source).toContain("stopRequested = useRef(false)");
        expect(source).toContain("shouldStop: () => stopRequested.current");
        expect(source).toContain("stopRequested.current = true");
    });

    it("shows progress and per-shot failures like L's batch-status block", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('data-testid="one-click-batch-status"');
        expect(source).toContain("batchProgress.current");
        expect(source).toContain("batchProgress.failed");
        expect(source).toContain("batchErrors.map");
        expect(source).toContain("（正在停止...）");
    });

    it("blocks concurrent batches and empty episodes", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('Boolean(batchKind) || busyShotId === "__collection__" || !episode.shots.length');
    });

    it("refreshes the project from the server instead of guessing state", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 结果由服务端回写，前端只刷新；不得本地伪造完成
        expect(source).toContain("onProjectChange(refreshed.project)");
        expect(source).not.toContain("setTimeout");
    });
});
