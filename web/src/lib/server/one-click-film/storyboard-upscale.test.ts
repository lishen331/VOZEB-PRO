import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ONE_CLICK_UPSCALE_KERNEL, ONE_CLICK_UPSCALE_SCALE, OneClickUpscaleError } from "./storyboard-upscale";

const servicePath = resolve(process.cwd(), "src/lib/server/one-click-film/storyboard-upscale.ts");
const routePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/shots/[shotId]/upscale/route.ts");
const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");

/**
 * 基线：L `storyboards.upscale`（backend-node/src/routes/storyboards.js）。
 *
 * L 的行为是：读分镜本地图 → sharp 2 倍 lanczos3 放大 → 改写 local_path。
 * 这里锁死"放大参数"与"落库字段"，因为这两处一改就不再是 1:1。
 */
describe("one-click-film storyboard upscale (L parity)", () => {
    it("keeps L's fixed 2x lanczos3 parameters", () => {
        // L 写死 const scale = 2 与 kernel: 'lanczos3'，两者都不可配置
        expect(ONE_CLICK_UPSCALE_SCALE).toBe(2);
        expect(ONE_CLICK_UPSCALE_KERNEL).toBe("lanczos3");
    });

    it("falls back to 512 when the source has no readable dimensions, like L", async () => {
        const source = await readFile(servicePath, "utf8");
        // L: (info.width || 512) * scale
        expect(source).toContain("metadata.width || 512");
        expect(source).toContain("metadata.height || 512");
        expect(source).toContain("ONE_CLICK_UPSCALE_SCALE");
    });

    it("repoints the shot's main image at the upscaled result", async () => {
        const source = await readFile(servicePath, "utf8");
        // L 改写 local_path；V 的等价字段是 storyboardImageUrl，且尺寸要一起更新
        expect(source).toContain("storyboardImageUrl: url");
        expect(source).toContain("storyboardImageWidth: width");
        expect(source).toContain("storyboardImageHeight: height");
        expect(source).toContain("persistDramaLabShotUpdate");
    });

    it("refuses to upscale when there is no usable source image", async () => {
        const source = await readFile(servicePath, "utf8");
        // L: '分镜没有本地图片，无法超分'
        expect(source).toContain("分镜没有分镜图，无法超分");
        // data:/blob: 不是可再取回的地址，必须拒绝而不是静默成功
        expect(source).toContain("isPersistentMediaUrl");
        expect(source).toContain('value.startsWith("data:")');
    });

    it("imports sharp statically, unlike L's optional require", async () => {
        const source = await readFile(servicePath, "utf8");
        // L 用 try { require('sharp') } 并在缺失时报 'sharp 模块不可用'，因为在 L 里 sharp 是可选依赖。
        // V 的 package.json 把 sharp 列为正式依赖，且 image-layer-output 等服务都是静态 import，
        // 所以这里同样静态 import：缺失属于构建期问题，不该退化成运行期分支。这是有意的承载差异。
        expect(source).toContain('import sharp from "sharp"');
        expect(source).not.toContain("loadSharp");
    });

    it("always cleans up its temp workdir", async () => {
        const source = await readFile(servicePath, "utf8");
        expect(source).toContain("mkdtemp");
        expect(source).toContain("} finally {");
        expect(source).toContain("rm(workdir, { recursive: true, force: true })");
    });

    it("carries a usable HTTP status on its errors", () => {
        expect(new OneClickUpscaleError("x").status).toBe(400);
        expect(new OneClickUpscaleError("x", 409).status).toBe(409);
        expect(new OneClickUpscaleError("x", 503).status).toBe(503);
    });

    it("scopes the route to one-click-film projects only", async () => {
        const source = await readFile(routePath, "utf8");
        expect(source).toContain('startsWith("one-click-film:")');
        expect(source).toContain("一键成片项目不存在");
        // 本地图像处理，不该出现模型派发/计费身份
        expect(source).not.toContain("featureModule");
    });

    it("is reachable from the shot card UI", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("/upscale");
        expect(source).toContain("aria-label={`放大分镜 ${index + 1} 分镜图`}");
        // 没有分镜图就不该出现放大入口
        expect(source).toContain("shot.storyboardImageUrl ?");
    });
});
