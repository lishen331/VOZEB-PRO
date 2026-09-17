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

    it("does not fake async work with setTimeout", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).not.toContain("setTimeout");
    });
});
