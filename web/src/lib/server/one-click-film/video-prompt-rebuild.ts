import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

import angleContract from "./angle-l-contract.json";

export class OneClickVideoPromptRebuildError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickVideoPromptRebuildError";
    }
}

/** L `angleService.toPromptFragment`：景别 → 俯仰 → 水平，逗号分隔。 */
export function oneClickAnglePromptFragment(angleH: string, angleV: string, angleS: string) {
    const horizontal = (angleContract.horizontalDesc as Record<string, string>)[angleH] || angleContract.horizontalDesc.front;
    const elevation = (angleContract.elevationDesc as Record<string, string>)[angleV] || angleContract.elevationDesc.eye_level;
    const shotSize = (angleContract.shotSizeDesc as Record<string, string>)[angleS] || angleContract.shotSizeDesc.medium;
    return `${shotSize}, ${elevation}, ${horizontal}`;
}

/** L `angleService.toChineseLabel`：景别·俯仰·水平。 */
export function oneClickAngleChineseLabel(angleH: string, angleV: string, angleS: string) {
    const horizontal = (angleContract.chineseLabel.horizontal as Record<string, string>)[angleH] || "正面";
    const elevation = (angleContract.chineseLabel.elevation as Record<string, string>)[angleV] || "平视";
    const shotSize = (angleContract.chineseLabel.shotSize as Record<string, string>)[angleS] || "中景";
    return `${shotSize}·${elevation}·${horizontal}`;
}

/** L `normalizeDuration`：容忍 "5s" 之类字符串，非法值归零。 */
export function oneClickNormalizeDuration(value: unknown) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const text = String(value).trim().replace(/s$/i, "");
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 对应 L `episodeStoryboardService.generateVideoPrompt`（纯本地模板重组，无 AI 调用）。
 *
 * 段落顺序与标签逐字照抄 L：
 * 场景 → 镜头标题 → 动作 → 对话 → 解说旁白 → 结果 → 景别 → 镜头角度 → 运镜
 * → 氛围 → 情绪 → 情绪强度 → 时长 → 风格 → =VideoRatio
 * 以「。」连接，全空时回退为「视频场景」。
 *
 * L 里 bgm_prompt / sound_effect 两段在 V 的 DramaShot 合同中没有对应字段，
 * 因此不会出现在输出里 —— 这属于结构差异，不是被我删掉的语义。
 */
export function rebuildOneClickVideoPrompt(project: DramaProject, shot: DramaShot, videoRatio?: string) {
    const parts: string[] = [];

    const location = text(shot.location);
    const time = text(shot.time);
    if (location) parts.push(`场景：${time ? `${location}，${time}` : location}`);

    if (text(shot.title)) parts.push(`镜头标题：${text(shot.title)}`);
    if (text(shot.action)) parts.push(`动作：${text(shot.action)}`);
    if (text(shot.dialogue)) parts.push(`对话：${text(shot.dialogue)}`);
    if (text(shot.narration)) parts.push(`解说旁白：${text(shot.narration)}`);
    if (text(shot.result)) parts.push(`结果：${text(shot.result)}`);
    if (text(shot.shotType)) parts.push(`景别：${text(shot.shotType)}`);

    // L：三段结构化视角齐备时输出「中文标签（英文片段）」，否则回退旧的自由文本 angle。
    if (text(shot.angleH) && text(shot.angleV) && text(shot.angleS)) {
        parts.push(`镜头角度：${oneClickAngleChineseLabel(text(shot.angleH), text(shot.angleV), text(shot.angleS))}（${oneClickAnglePromptFragment(text(shot.angleH), text(shot.angleV), text(shot.angleS))}）`);
    } else if (text(shot.cameraAngle)) {
        parts.push(`镜头角度：${text(shot.cameraAngle)}`);
    }

    if (text(shot.cameraMotion)) parts.push(`运镜：${text(shot.cameraMotion)}`);
    if (text(shot.atmosphere)) parts.push(`氛围：${text(shot.atmosphere)}`);
    if (text(shot.emotion)) parts.push(`情绪：${text(shot.emotion)}`);
    if (shot.emotionIntensity !== undefined && shot.emotionIntensity !== null) parts.push(`情绪强度：${String(shot.emotionIntensity)}`);

    // L：时长缺失回退 5 秒。
    parts.push(`时长：${oneClickNormalizeDuration(shot.duration) || 5}秒`);

    const style = text(project.style);
    if (style) parts.push(`风格：${style}`);
    const ratio = text(videoRatio) || text(project.ratio);
    if (ratio) parts.push(`=VideoRatio: ${ratio}`);

    return parts.length ? parts.join("。") : "视频场景";
}

export function findOneClickRebuildTarget(project: DramaProject, episodeId: string, shotId: string): { episode: DramaEpisode; shot: DramaShot } {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new OneClickVideoPromptRebuildError("分集不存在", 404);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new OneClickVideoPromptRebuildError("分镜不存在", 404);
    return { episode, shot };
}
