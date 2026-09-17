import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");
const editorPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-editor.tsx");
const workspacePath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");

/**
 * 分镜卡片与编辑弹窗的 UI 契约。
 *
 * 重点不是像素，而是三件事：
 * 1. 所有请求都打一键成片自有路由，不得回落到 /api/drama-lab；
 * 2. L 的关键交互都有入口（新增、前插、按音频拆镜、删除、编辑、首尾帧提示词）；
 * 3. 核心按钮有可定位的 aria-label（规范 §6 要求）。
 */
describe("one-click-film shot card UI", () => {
    it("mounts the shot cards inside the workspace so they are reachable", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("OneClickFilmShotCards");
        expect(source).toContain("<OneClickFilmShotCards");
        expect(source).toContain("onProjectChange={setProject}");
    });

    it("calls only one-click-film routes, never drama-lab", async () => {
        for (const path of [cardsPath, editorPath]) {
            const source = await readFile(path, "utf8");
            expect(source).toContain("/api/one-click-film/projects/");
            expect(source).not.toContain("/api/drama-lab");
        }
    });

    it("exposes L's storyboard actions with locatable labels", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 对应 L: POST /storyboards, POST /storyboards/:id/insert-before,
        // POST /storyboards/:id/split-by-audio, DELETE /storyboards/:id
        expect(source).toContain("/shots${query}");
        expect(source).toContain("/insert-before");
        expect(source).toContain("/split-by-audio");
        expect(source).toContain('method: "DELETE"');
        expect(source).toContain('aria-label="新增分镜"');
        expect(source).toContain("aria-label={`编辑分镜");
        expect(source).toContain("aria-label={`在分镜");
        expect(source).toContain("aria-label={`按音频拆分镜");
        expect(source).toContain("aria-label={`删除分镜");
    });

    it("previews before applying an audio split, matching L's append-only flow", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain('action: "preview"');
        expect(source).toContain('action: "apply"');
        // 应用时必须带上预览产出的 plan 与 expectedUpdatedAt，避免覆盖更新的项目快照
        expect(source).toContain("plan: preview?.plan");
        expect(source).toContain("expectedUpdatedAt: preview?.sourceUpdatedAt");
    });

    it("shows per-shot mode and task status instead of a static card", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("creationMode");
        expect(source).toContain("storyboardFrameMode");
        expect(source).toContain("storyboardStatus");
        expect(source).toContain("generationStatus");
        // 错误必须可见（规范 §6：错误原因必须可见）
        expect(source).toContain("storyboardError");
        expect(source).toContain("generationError");
    });

    it("edits the L whitelist fields and saves frame prompts with layout", async () => {
        const source = await readFile(editorPath, "utf8");
        for (const field of ["title", "description", "dialogue", "narration", "imagePrompt", "videoPrompt"]) {
            expect(source).toContain(field);
        }
        expect(source).toContain("/frame-prompts");
        expect(source).toContain("frameLayout");
        // 三种帧类型与 L 实际落库的一致
        expect(source).toContain('value: "first"');
        expect(source).toContain('value: "key"');
        expect(source).toContain('value: "last"');
        expect(source).toContain('aria-label="保存帧提示词"');
    });

    it("offers L's three creation modes and persists the switch", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("<Segmented");
        expect(source).toContain('{ value: "single", label: "经典" }');
        expect(source).toContain('{ value: "first_last", label: "首尾帧" }');
        expect(source).toContain('{ value: "universal", label: "全能" }');
        // 切换必须落库：经典/首尾帧靠 storyboardFrameMode，全能靠 creationMode
        expect(source).toContain("storyboardFrameMode: mode");
        expect(source).toContain('creationMode: "universal"');
        expect(source).toContain('method: "PUT"');
        expect(source).toContain("aria-label={`分镜 ${index + 1} 创作模式`}");
    });

    it("exposes per-shot generation that bills to one-click-film", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 走自有路由，因此上游 featureModule 是 one-click-film 而非 drama-lab
        expect(source).toContain("/generate-${kind}");
        expect(source).toContain("aria-label={`生成分镜 ${index + 1} 分镜图`}");
        expect(source).toContain("aria-label={`生成分镜 ${index + 1} 视频`}");
        expect(source).toContain("分镜图任务已创建");
        expect(source).toContain("分镜视频任务已创建");
    });

    it("keeps the frame-mode field writable on the server whitelist", async () => {
        // UI 能切但服务端白名单不收，就会静默丢失 —— 这条把两侧绑在一起。
        const crud = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/shot-crud.ts"), "utf8");
        expect(crud).toContain('"storyboardFrameMode"');
        expect(crud).toContain('"creationMode"');
    });

    it("does not fake async work with setTimeout", async () => {
        for (const path of [cardsPath, editorPath]) {
            const source = await readFile(path, "utf8");
            // 规范 §8 禁止用 setTimeout 假装异步任务
            expect(source).not.toContain("setTimeout");
        }
    });
});
