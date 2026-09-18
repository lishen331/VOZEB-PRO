import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";
import type { DramaProject, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
import { findShot, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { downloadMediaToFile } from "@/lib/server/media-download";
import { writeReferenceMediaFile } from "@/lib/server/reference-asset-store";

import { sequenceGridRects } from "./sequence-grid";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export class OneClickSequenceSplitError extends Error {
    readonly status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "OneClickSequenceSplitError";
        this.status = status;
    }
}

export type OneClickSequenceSplitInput = {
    userId: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    mode: DramaLabStoryboardSequenceMode;
    /** 上游返回的整张网格图。 */
    sourceUrl: string;
    /** 产出这张网格图的任务 id，用于历史记录幂等。 */
    taskId: string;
    origin: string;
    cookie?: string;
};

export type OneClickSequenceSplitResult = {
    project: DramaProject;
    panels: Array<{ index: number; label: string; url: string; width: number; height: number }>;
};

/**
 * 把一张 2x2 / 3x3 网格分镜图裁成独立候选图。
 *
 * 对应 L `splitQuadGridToImages` / `splitNineGridToImages`。
 * 纯本地图像处理：不调模型、不计费。
 *
 * 为什么必须裁：分镜图会作为生视频的首帧/参考图，把整张拼贴喂给视频模型会让它去动拼贴本身；
 * 且主参考图/候选挑选逻辑要求每个候选是独立一条记录。
 *
 * 与 L 的**故意差异**：不烧「左上」「俯拍」角标。L 用 SVG composite 烧在每格左上角，
 * 但 V 选中的那张会直接当视频参考图，角标会进成片画面。机位标签只写进历史记录的 prompt
 * 前缀供 UI 展示（`[俯拍] ...`），不进像素。
 *
 * 失败策略同 L：整张原图已经落库可用，拆分失败只抛错让调用方记 warn，
 * 绝不因为拆分失败而把已成功的生图判为失败（那会让用户白付一次费用）。
 */
export async function splitOneClickSequenceGrid(input: OneClickSequenceSplitInput): Promise<OneClickSequenceSplitResult> {
    const { shot } = findShot(input.project, input.episodeId, input.shotId);
    if (!input.sourceUrl.trim()) throw new OneClickSequenceSplitError("网格图地址为空，无法拆分", 409);

    const workdir = await mkdtemp(join(tmpdir(), "vozeb-pro-grid-split-"));
    const sourcePath = join(workdir, "grid-source");
    try {
        try {
            await downloadMediaToFile(input.sourceUrl, sourcePath, { origin: input.origin, cookie: input.cookie, maxBytes: MAX_IMAGE_BYTES });
        } catch (error) {
            throw new OneClickSequenceSplitError(`网格图下载失败：${error instanceof Error ? error.message : "未知错误"}`, 502);
        }

        const metadata = await sharp(sourcePath).metadata();
        const rects = sequenceGridRects(input.mode, metadata.width || 0, metadata.height || 0);
        if (!rects.length) throw new OneClickSequenceSplitError("网格图尺寸不可用，无法按象限拆分", 422);

        const panels: OneClickSequenceSplitResult["panels"] = [];
        for (const rect of rects) {
            const outputPath = join(workdir, `panel-${rect.index}.png`);
            // 每格单独 extract：不做缩放，保持模型输出的原始像素。
            await sharp(sourcePath).extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }).png().toFile(outputPath);
            const outputStat = await stat(outputPath);
            if (!outputStat.isFile() || outputStat.size <= 0) throw new OneClickSequenceSplitError(`第 ${rect.index + 1} 格裁剪结果为空`, 502);

            const asset = await writeReferenceMediaFile(outputPath, "image", "image/png", true, {
                ownerUserId: input.userId,
                source: "one-click-film-sequence-panel",
                projectId: input.project.id,
                originalName: `${input.shotId}-panel${rect.index}.png`,
                maxBytes: MAX_IMAGE_BYTES,
            });
            panels.push({ index: rect.index, label: rect.label, url: asset.url || `/api/reference-assets/${asset.token}`, width: rect.width, height: rect.height });
        }

        // 每格作为一条候选进 storyboardHistory，用户从中挑一张当主分镜图。
        //
        // 注意不能对每格逐次调 appendDramaLabGenerationHistory：那个助手按 taskId 去重
        // （同一任务只留最后一条），而这一组面板共用同一个 taskId，逐次调用会把前面的格子
        // 一个个挤掉，最后只剩 1 条。所以这里整批替换该 taskId 的记录。
        const createdAt = new Date().toISOString();
        const basePrompt = (shot.imagePrompt || shot.polishedPrompt || "").trim();
        const panelEntries: DramaShotGenerationHistory[] = panels.map((panel) => ({
            // id 带 taskId + 序号：同一任务重复拆分不会产生重复候选。
            id: `sequence-panel:${input.taskId}:${panel.index}`,
            // 每格必须带**各自**的 taskId，不能共用网格图那个。
            // 因为回写用的 appendDramaLabGenerationHistory 按 taskId 去重（同 taskId 只留一条），
            // 共用会导致：面板之间互相挤掉，且下一次回写把整组面板连带清空。
            taskId: `${input.taskId}:panel${panel.index}`,
            url: panel.url,
            // 机位标签只在文字里，不在像素里。
            prompt: `[${panel.label}] ${basePrompt}`.trim().slice(0, 1000),
            createdAt,
            width: panel.width,
            height: panel.height,
        }));
        // 只清掉本任务上一次拆出的面板，保留网格原图那条记录与其他任务的历史。
        const panelPrefix = `${input.taskId}:panel`;
        const history = [...(shot.storyboardHistory || []).filter((entry) => !entry.taskId.startsWith(panelPrefix)), ...panelEntries].slice(-20);

        const project = await persistDramaLabShotUpdate({
            userId: input.userId,
            project: input.project,
            episodeId: input.episodeId,
            shotId: input.shotId,
            // 主图保持指向整张网格图：让用户先看到全部机位再自己挑一格，
            // 系统不替用户猜哪个机位更好。
            patch: { storyboardHistory: history },
            retryOnConflict: true,
        });
        return { project, panels };
    } finally {
        await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
}
