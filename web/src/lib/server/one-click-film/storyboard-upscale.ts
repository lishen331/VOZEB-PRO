import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { downloadMediaToFile } from "@/lib/server/media-download";
import { writeReferenceMediaFile } from "@/lib/server/reference-asset-store";

/** L `upscale` 固定 2 倍，不可配置。 */
export const ONE_CLICK_UPSCALE_SCALE = 2;
/** L 用 sharp 的 lanczos3 内核，换内核会改变像素输出，属行为不等价。 */
export const ONE_CLICK_UPSCALE_KERNEL = "lanczos3" as const;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export class OneClickUpscaleError extends Error {
    readonly status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "OneClickUpscaleError";
        this.status = status;
    }
}

export type OneClickUpscaleInput = {
    userId: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    origin: string;
    cookie?: string;
};

export type OneClickUpscaleResult = {
    project: DramaProject;
    shot: DramaShot;
    url: string;
    width: number;
    height: number;
};

/**
 * 分镜图 2 倍超分，对应 L `POST /storyboards/:id/upscale`。
 *
 * 与 L 的行为等价点：
 * - 固定 2 倍、lanczos3 内核；
 * - 源图缺失或不可读时报可读错误，而不是静默成功；
 * - 成功后把分镜的主图指向放大后的新图（L 是改写 local_path）。
 *
 * 与 L 的承载差异：L 直接读写本地 storage 目录，V 的媒体统一走 reference 媒体库并登记
 * 归属，所以这里下载源图到临时目录、放大、再写回 V 的媒体库，不落地任何裸文件。
 * 纯本地图像处理，不调用模型，因此不产生计费，也不需要 featureModule。
 */
export async function upscaleOneClickStoryboardImage(input: OneClickUpscaleInput): Promise<OneClickUpscaleResult> {
    const { shot } = findShot(input.project, input.episodeId, input.shotId);
    const sourceUrl = shot.storyboardImageUrl?.trim() || "";
    if (!sourceUrl) throw new OneClickUpscaleError("分镜没有分镜图，无法超分", 409);
    if (!isPersistentMediaUrl(sourceUrl)) throw new OneClickUpscaleError("分镜图地址不可用，请先同步分镜图结果", 409);

    const workdir = await mkdtemp(join(tmpdir(), "vozeb-pro-upscale-"));
    const sourcePath = join(workdir, "source-image");
    const outputPath = join(workdir, "upscaled.png");
    try {
        try {
            await downloadMediaToFile(sourceUrl, sourcePath, { origin: input.origin, cookie: input.cookie, maxBytes: MAX_IMAGE_BYTES });
        } catch (error) {
            throw new OneClickUpscaleError(`分镜图下载失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        let width = 0;
        let height = 0;
        try {
            const metadata = await sharp(sourcePath).metadata();
            // L 在读不到尺寸时回落到 512，这里保持一致，避免尺寸缺失直接失败。
            width = (metadata.width || 512) * ONE_CLICK_UPSCALE_SCALE;
            height = (metadata.height || 512) * ONE_CLICK_UPSCALE_SCALE;
            await sharp(sourcePath).resize(width, height, { kernel: ONE_CLICK_UPSCALE_KERNEL }).png().toFile(outputPath);
            const outputStat = await stat(outputPath);
            if (!outputStat.isFile() || outputStat.size <= 0 || outputStat.size > MAX_IMAGE_BYTES) throw new Error("放大后的图片为空或超过大小限制");
        } catch (error) {
            if (error instanceof OneClickUpscaleError) throw error;
            throw new OneClickUpscaleError(`分镜图超分失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        let asset: Awaited<ReturnType<typeof writeReferenceMediaFile>>;
        try {
            asset = await writeReferenceMediaFile(outputPath, "image", "image/png", true, {
                ownerUserId: input.userId,
                source: "one-click-film-upscale",
                projectId: input.project.id,
                originalName: `${shot.id}-upscaled-${ONE_CLICK_UPSCALE_SCALE}x.png`,
                maxBytes: MAX_IMAGE_BYTES,
            });
        } catch (error) {
            throw new OneClickUpscaleError(`放大结果持久化失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        const url = asset.url || `/api/reference-assets/${asset.token}`;
        // L 改写 local_path，即分镜主图直接指向放大结果，这里等价地改写 storyboardImageUrl。
        // storyboardHistory 保持不动：其中仍留有放大前那次生成的记录，用户可据此回退。
        const savedProject = await persistDramaLabShotUpdate({
            userId: input.userId,
            project: input.project,
            episodeId: input.episodeId,
            shotId: input.shotId,
            patch: { storyboardImageUrl: url, storyboardImageWidth: width, storyboardImageHeight: height },
            retryOnConflict: true,
        });
        const savedShot = findShot(savedProject, input.episodeId, input.shotId).shot;
        return { project: savedProject, shot: savedShot, url, width, height };
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
}

function isPersistentMediaUrl(value: string) {
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) return false;
    if (value.startsWith("/")) return true;
    try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}
