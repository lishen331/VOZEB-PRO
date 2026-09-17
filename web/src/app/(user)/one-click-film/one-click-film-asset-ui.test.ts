import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panelPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-asset-panel.tsx");
const workspacePath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");

/**
 * 资产面板（角色/场景/道具）的 UI 契约。
 *
 * L 的四个资产 AI 端点在 V 侧收敛成一条 assets/:assetId/ai：
 *   extract-from-image → describe
 *   generate-prompt    → prompt
 *   extract-anchors    → anchor
 *   generate-stages    → stages
 */
describe("one-click-film asset panel UI", () => {
    it("mounts the asset panel inside the workspace so it is reachable", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("OneClickFilmAssetPanel");
        expect(source).toContain("<OneClickFilmAssetPanel");
        expect(source).toContain("onProjectChange={setProject}");
    });

    it("calls only one-click-film routes, never drama-lab", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("/api/one-click-film/projects/");
        expect(source).not.toContain("/api/drama-lab");
    });

    it("covers all four L asset AI actions", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("/assets/${encodeURIComponent(asset.id)}/ai");
        for (const action of ["describe", "prompt", "anchor", "stages"]) {
            expect(source).toContain(`"${action}"`);
        }
        expect(source).toContain('aria-label="提炼视觉锚点"');
        expect(source).toContain('aria-label="AI 生成阶段造型"');
    });

    it("keeps L's layout default: characters four-view, others single", async () => {
        const source = await readFile(panelPath, "utf8");
        // L：角色固定四视图；场景/道具默认单图
        expect(source).toContain('kind === "characters" ? "four_view" : asset.generationLayout || "single"');
    });

    it("switches between the three asset kinds", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("<Segmented");
        expect(source).toContain('aria-label="资产类型"');
        expect(source).toContain("characters:");
        expect(source).toContain("scenes:");
        expect(source).toContain("props:");
    });

    it("writes AI output back onto the project instead of only showing it", async () => {
        const source = await readFile(panelPath, "utf8");
        // 只展示不落库等于假功能，必须 PUT 回项目
        expect(source).toContain('method: "PUT"');
        for (const field of ["description", "appearance", "polishedPrompt", "imagePrompt", "profile", "stages"]) {
            expect(source).toContain(field);
        }
    });

    it("exposes asset reference-image generation that bills to one-click-film", async () => {
        const source = await readFile(panelPath, "utf8");
        // 对应 L generate-image / generate-four-view-image
        expect(source).toContain("/generate-image");
        expect(source).toContain('kind === "characters" ? "four_view"');
        expect(source).toContain("生成四视图");
        expect(source).toContain("生成设定图");
    });

    it("manages reference images: upload, set primary, remove", async () => {
        const source = await readFile(panelPath, "utf8");
        // 对应 L POST /characters/:id/upload-image 与 PUT /characters/:id/image
        expect(source).toContain("/references");
        expect(source).toContain('action: "upload"');
        expect(source).toContain('action: "primary"');
        expect(source).toContain('action: "remove"');
        expect(source).toContain('aria-label="上传参考图"');
        expect(source).toContain("设为主参考图");
        // 主图判定复用平台既有纯函数，不自己另写一套
        expect(source).toContain("dramaAssetPrimaryReference");
        expect(source).toContain("dramaAssetReferences");
    });

    it("uploads through the server instead of persisting in the browser", async () => {
        const source = await readFile(panelPath, "utf8");
        // 前端只读成 dataUrl，持久化由服务端 writeReferenceImageDataUrl 完成
        expect(source).toContain("readAsDataURL");
        expect(source).toContain("dataUrl");
        expect(source).not.toContain("localStorage");
    });

    it("lets users add and delete assets by hand", async () => {
        const source = await readFile(panelPath, "utf8");
        // 之前只能靠 executor assets 步自动提取，界面上无法手动加一个角色（§7 P0 缺口）
        expect(source).toContain("createAsset");
        expect(source).toContain("deleteAsset");
        expect(source).toContain('method: "DELETE"');
        expect(source).toContain("aria-label={`新增${KIND_LABEL[kind]}`}");
        expect(source).toContain("aria-label={`删除${KIND_LABEL[kind]}");
        // 删除必须带 kind，否则服务端不知道删哪一类
        expect(source).toContain("?kind=${kind}");
    });

    it("lets users hand-edit asset fields and save them", async () => {
        const source = await readFile(panelPath, "utf8");
        // 之前弹窗字段全是 readOnly，PUT assets/:assetId 没有调用方
        expect(source).toContain("saveAsset");
        expect(source).toContain('method: "PUT"');
        expect(source).toContain('aria-label="保存资产"');
        // 四个可编辑字段都要有受控 onChange
        for (const field of ["name", "description", "appearance", "imagePrompt"]) {
            expect(source).toContain(`${field}: event.target.value`);
        }
        // 编辑区不应再有只读输入框
        expect(source).not.toContain('readOnly aria-label="资产名称"');
        expect(source).not.toContain('readOnly aria-label="资产描述"');
    });

    it("supports L's batch reference-image generation with its 10-item cap", async () => {
        const source = await readFile(panelPath, "utf8");
        // 对应 L POST /characters/batch-generate-images
        expect(source).toContain("batch-generate-images");
        expect(source).toContain("batchGenerate");
        expect(source).toContain("aria-label={`批量生成${KIND_LABEL[kind]}设定图`}");
        // L 的硬上限：单次最多 10 个
        expect(source).toContain("slice(0, 10)");
        // 优先补齐还没有主参考图的资产，避免重复烧额度
        expect(source).toContain("dramaAssetPrimaryReference(item)");
    });

    it("extracts assets from the episode script and persists them", async () => {
        const source = await readFile(panelPath, "utf8");
        // 对应 L POST /episodes/:episode_id/{characters,props}/extract
        expect(source).toContain("/extract-assets");
        expect(source).toContain("extractAssets");
        expect(source).toContain("KIND_ASSET_TYPE");
        // L 的 assetType 用单数，与集合键不同名
        expect(source).toContain('characters: "character"');
        expect(source).toContain('scenes: "scene"');
        expect(source).toContain('props: "prop"');
        expect(source).toContain("aria-label={`从剧本提取${KIND_LABEL[kind]}`}");
        // 提取结果必须回写项目，否则点了等于没反应
        expect(source).toContain("onProjectChange(data.project as DramaProject)");
    });

    it("offers character voice settings that feed the TTS chain", async () => {
        const source = await readFile(panelPath, "utf8");
        // audio-runner 的 voice/speed/instructions 全部来自角色 voiceProfile，
        // 之前服务端能存但 UI 没入口，等于配音只能用平台默认音色。
        expect(source).toContain("voiceDraft");
        expect(source).toContain("audioVoiceOptions");
        expect(source).toContain('aria-label="角色音色"');
        expect(source).toContain('aria-label="角色语速"');
        expect(source).toContain('aria-label="角色朗读指令"');
        // 只有角色有音色配置
        expect(source).toContain('kind === "characters" ? { voiceProfile:');
        // 空音色传 null 表示清除，回落平台默认
        expect(source).toContain("voiceDraft?.voice ? voiceDraft : null");
    });

    it("keeps voiceProfile writable on the server whitelist", async () => {
        // UI 能改但服务端不收就会静默丢失，这条把两侧绑在一起。
        const crud = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/asset-crud.ts"), "utf8");
        expect(crud).toContain("normalizeOneClickVoiceProfile");
        // 非法音色必须拒绝，而不是把脏数据传给上游
        expect(crud).toContain("不支持的音色");
        // 语速区间与平台一致
        expect(crud).toContain("speedValue >= 0.25 && speedValue <= 4");
    });

    it("bridges assets to and from the material library", async () => {
        const source = await readFile(panelPath, "utf8");
        // 对应 L add-to-library / add-to-material-library / image-from-library
        expect(source).toContain("/library");
        expect(source).toContain('action: "save"');
        expect(source).toContain('action: "apply"');
        expect(source).toContain("libraryAssetId");
        expect(source).toContain("存入素材库");
        expect(source).toContain("取用素材");
        // 挑选器只列当前类别的图片素材，避免把道具图取给角色
        expect(source).toContain("kind=image");
        expect(source).toContain("dramaAssetType=${KIND_ASSET_TYPE[kind]}");
        // 取用后必须回写项目，否则界面看不到新主图
        expect(source).toContain("onProjectChange(data.project as DramaProject)");
    });

    it("keeps the library bridge on the server side", async () => {
        const service = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/asset-library-service.ts"), "utf8");
        // 类别靠 metadata.dramaAssetType 区分（L 用单数）
        expect(service).toContain("dramaAssetType");
        expect(service).toContain('characters: "character"');
        // 没有参考图不允许存入，否则素材库会出现空封面条目
        expect(service).toContain("请先为该资产生成或上传参考图");
        // 取用时旧主图降级为 history，不丢
        expect(service).toContain('role: "history"');
        // blob: 是临时地址，不能落库
        expect(service).toContain('startsWith("blob:")');
    });

    it("does not fake async work with setTimeout", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).not.toContain("setTimeout");
    });
});
