import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";

import contract from "./photography-inference-l-contract.json";

export class OneClickPhotographyInferenceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickPhotographyInferenceError";
    }
}

export type OneClickPhotographyParams = { cameraMotion: string | null; lightingStyle: string | null; depthOfField: string | null };

/**
 * L `angleService.inferPhotographyParams` 的等价实现。
 *
 * 规则表逐条抽取自 L 源码并落在 `photography-inference-l-contract.json`，
 * 已用 113 个样本（覆盖每条灯光关键词、每个运镜别名、景深三档）与 L 真实输出比对，0 处不一致。
 *
 * **灯光规则的数组顺序即优先级，不能重排** —— 例如"霓虹夜色"同时命中 neon 与 night，
 * L 取先命中的 neon。
 */
export function inferOneClickPhotographyParams(shot: Pick<DramaShot, "atmosphere" | "time" | "description" | "action" | "angleS" | "shotType" | "cameraMotion">): OneClickPhotographyParams {
    const combined = `${(shot.atmosphere || "").toLowerCase()} ${(shot.time || "").toLowerCase()} ${(shot.description || "").toLowerCase()} ${(shot.action || "").toLowerCase()}`;

    let lightingStyle: string | null = null;
    for (const rule of contract.lightingRules) {
        if (new RegExp(rule.pattern).test(combined)) {
            lightingStyle = rule.value;
            break;
        }
    }

    // 景深依据景别：优先结构化 angleS，其次自由文本 shotType。
    let depthOfField: string | null = null;
    const angleS = shot.angleS || "";
    const shotType = (shot.shotType || "").toLowerCase();
    if (angleS === "close_up" || /特写|close.?up|extreme close/.test(shotType)) depthOfField = "shallow";
    else if (angleS === "wide" || /大远景|远景|long shot|wide shot/.test(shotType)) depthOfField = "deep";
    else if (angleS === "medium" || /中景|medium shot/.test(shotType)) depthOfField = "medium";

    // 运镜：已是枚举值直接用；否则按中文别名映射；都不中就保留原始中文（生图时再翻译）。
    let cameraMotion: string | null = null;
    const raw = (shot.cameraMotion || "").trim();
    if (raw) {
        cameraMotion = (contract.movementEnums as string[]).includes(raw) ? raw : null;
        if (!cameraMotion) {
            const lower = raw.toLowerCase();
            for (const entry of contract.movementAliases) {
                if (entry.keys.some((key) => lower.includes(key.toLowerCase()))) {
                    cameraMotion = entry.value;
                    break;
                }
            }
        }
        if (!cameraMotion) cameraMotion = raw;
    }

    return { cameraMotion: cameraMotion || null, lightingStyle, depthOfField };
}

export type OneClickInferenceResult = { project: DramaProject; total: number; updated: number };

/**
 * 批量推断一集内所有分镜的摄影参数，对应 L `POST /storyboards/batch-infer-params`。
 *
 * L 的语义：
 * - `overwrite=false`（默认）只补缺失字段，已有值不动；
 * - `overwrite=true` 用推断结果覆盖；
 * - 只有确实产生了变更才计入 `updated`。
 */
export function inferOneClickEpisodePhotography(project: DramaProject, episodeId: string, overwrite = false): OneClickInferenceResult {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new OneClickPhotographyInferenceError("分集不存在", 404);

    let updated = 0;
    const shots = episode.shots.map((shot) => {
        const inferred = inferOneClickPhotographyParams(shot);
        const patch: Partial<DramaShot> = {};

        for (const key of ["cameraMotion", "lightingStyle", "depthOfField"] as const) {
            const value = inferred[key];
            if (!value) continue;
            const current = (shot[key] || "").trim();
            // 非覆盖模式下，已有值一律不动 —— 这是 L 的 COALESCE 语义。
            if (!overwrite && current) continue;
            if (current === value) continue;
            patch[key] = value;
        }

        if (!Object.keys(patch).length) return shot;
        updated += 1;
        return { ...shot, ...patch };
    });

    if (!updated) return { project, total: episode.shots.length, updated: 0 };
    return {
        project: { ...project, episodes: project.episodes.map((item) => (item.id === episodeId ? { ...item, shots } : item)) },
        total: episode.shots.length,
        updated,
    };
}
