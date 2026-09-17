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

    it("wires L's first/last frame continuity handoff", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 对应 L POST /storyboards/:id/link-tail-frame 的两段：抽尾帧 → 应用为下一镜首帧
        expect(source).toContain("/extract-tail-frame");
        expect(source).toContain("/accept-first-frame-candidate");
        expect(source).toContain("candidateId=");
        expect(source).toContain("replaceExisting=true");
        // 没有视频就不该出现"提取尾帧"，没有候选就不该出现"应用候选首帧"
        expect(source).toContain("shot.videoUrl ?");
        expect(source).toContain("shot.firstFrameCandidate ?");
        expect(source).toContain("aria-label={`提取分镜 ${index + 1} 视频尾帧`}");
        expect(source).toContain("aria-label={`应用分镜 ${index + 1} 候选首帧`}");
    });

    it("offers AI frame-prompt planning per frame type", async () => {
        const source = await readFile(editorPath, "utf8");
        // 对应 L POST /storyboards/:id/frame-prompt（framePromptService.generateFramePrompt）
        expect(source).toContain("/generate-frame");
        expect(source).toContain("frameType=${frameType}");
        expect(source).toContain('aria-label="AI 生成帧提示词"');
        // 生成结果要回填到编辑框，否则用户看不到 AI 产出
        expect(source).toContain("setFramePrompt(data.prompt)");
        expect(source).toContain("setFrameDescription(data.description)");
    });

    it("offers L's image prompt polish and surfaces the polished result", async () => {
        const source = await readFile(editorPath, "utf8");
        // 对应 L POST /storyboards/:id/polish-prompt
        expect(source).toContain("/polish-prompt");
        expect(source).toContain('aria-label="AI 润色图片提示词"');
        // 润色结果必须可见，否则用户不知道最终提示词是什么
        expect(source).toContain("setPolishedPrompt(data.polishedPrompt)");
        expect(source).toContain('aria-label="润色后的图片提示词"');
    });

    it("offers L's local video-prompt rebuild", async () => {
        const source = await readFile(editorPath, "utf8");
        // 对应 L POST /storyboards/:id/rebuild-video-prompt（纯本地模板重组，不调模型）
        expect(source).toContain("/rebuild-video-prompt");
        expect(source).toContain('aria-label="重建视频提示词"');
        // 重建结果要回填，否则用户看不到最终视频提示词
        expect(source).toContain("setVideoPrompt(data.videoPrompt)");
    });

    it("offers L's AI layout-anchor regeneration", async () => {
        const source = await readFile(editorPath, "utf8");
        // 对应 L POST /storyboards/:id/regenerate-layout-description
        expect(source).toContain("/regenerate-layout-description");
        expect(source).toContain('aria-label="AI 重算空间布局"');
        // 结果要回填并可见，否则用户不知道最终布局锚点是什么
        expect(source).toContain("setLayoutDescription(data.layoutDescription)");
        expect(source).toContain('aria-label="本镜空间布局锚点"');
    });

    it("surfaces the dubbing state the audio runner writes back", async () => {
        const source = await readFile(cardsPath, "utf8");
        // audio-runner 会把 dialogueAudio / narrationAudio 写到分镜上，UI 之前完全没读，
        // 「配音」只是步骤条上的静态文字 —— 那等于用户看不到配音结果。
        expect(source).toContain("shot.dialogueAudio");
        expect(source).toContain("shot.narrationAudio");
        expect(source).toContain("对白");
        expect(source).toContain("旁白");
        // 音色与说话人来自服务端回写，必须可见
        expect(source).toContain("state.speaker");
        expect(source).toContain("state.voice");
        // 失败原因必须可见（规范 §6）
        expect(source).toContain("state?.error");
        // 只播放服务端产物，不在前端合成
        expect(source).toContain("<audio");
        expect(source).toContain("aria-label={`播放分镜 ${index + 1} ${label}配音`}");
    });

    it("wires L's batch photography-parameter inference", async () => {
        const source = await readFile(cardsPath, "utf8");
        // 对应 L POST /storyboards/batch-infer-params（纯本地规则推断，不调模型，不计费）
        expect(source).toContain("/shots/batch-infer-params");
        expect(source).toContain("episodeId: episode.id");
        expect(source).toContain("overwrite: false");
        expect(source).toContain('aria-label="批量补全摄影参数"');
        // 推断出的字段必须在服务端白名单里，否则会被静默丢弃
        const crud = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/shot-crud.ts"), "utf8");
        expect(crud).toContain('"lightingStyle"');
        expect(crud).toContain('"depthOfField"');
    });

    it("binds characters, props and scene from the shot editor", async () => {
        const source = await readFile(editorPath, "utf8");
        // 对应 L POST /storyboards/:id/props（propService.associateWithStoryboard）。
        // L 有独立端点，V 的 PUT shots/:id 白名单已收这三项，走同一入口即等价。
        expect(source).toContain("characterIds");
        expect(source).toContain("propIds");
        expect(source).toContain("sceneId");
        expect(source).toContain('aria-label="分镜出场角色"');
        expect(source).toContain('aria-label="分镜关联道具"');
        expect(source).toContain('aria-label="分镜所属场景"');
        expect(source).toContain('aria-label="保存资产绑定"');
        // 选项必须来自项目的真实资产清单，不能是写死的假数据
        expect(source).toContain("project.characters.map");
        expect(source).toContain("project.props.map");
        expect(source).toContain("project.scenes.map");
    });

    it("keeps the binding fields writable on the server whitelist", async () => {
        // UI 能选但服务端不收就会静默丢失 —— 把两侧绑在一条断言里。
        const crud = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/shot-crud.ts"), "utf8");
        expect(crud).toContain('"sceneId"');
        expect(crud).toContain("characterIds?: string[]");
        expect(crud).toContain("propIds?: string[]");
    });

    it("does not fake async work with setTimeout", async () => {
        for (const path of [cardsPath, editorPath]) {
            const source = await readFile(path, "utf8");
            // 规范 §8 禁止用 setTimeout 假装异步任务
            expect(source).not.toContain("setTimeout");
        }
    });
});
