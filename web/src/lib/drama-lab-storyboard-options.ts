import productionModes from "./drama-lab-production-storyboard-modes.json";
export type DramaLabStoryboardOptions = { shotCount?: number; totalDuration?: number; creationMode?: "classic" | "universal"; generateNarration?: boolean };
export class DramaLabStoryboardOptionsError extends Error {
    readonly status = 400;
}

export function normalizeDramaLabStoryboardOptions(value: unknown): DramaLabStoryboardOptions {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value)) throw new DramaLabStoryboardOptionsError("分镜配置必须为对象");
    const input = value as Record<string, unknown>;
    const result: DramaLabStoryboardOptions = {};
    for (const key of ["shotCount", "totalDuration"] as const) {
        const raw = input[key];
        if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) continue;
        const n = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
        if (!Number.isFinite(n) || n <= 0 || (key === "shotCount" && !Number.isSafeInteger(n))) throw new DramaLabStoryboardOptionsError(key === "shotCount" ? "分镜数量必须为正整数或留空" : "视频总时长必须为正数或留空");
        result[key] = n;
    }
    if (input.creationMode !== undefined) {
        if (input.creationMode !== "classic" && input.creationMode !== "universal") throw new DramaLabStoryboardOptionsError("分镜模式必须为 classic 或 universal");
        result.creationMode = input.creationMode;
    }
    if (input.generateNarration !== undefined) {
        if (typeof input.generateNarration !== "boolean") throw new DramaLabStoryboardOptionsError("解说旁白开关必须为布尔值");
        result.generateNarration = input.generateNarration;
    }
    return result;
}

/** Tolerances copied from production L formatUserPrompt, not invented hard limits. */
export function dramaLabStoryboardConstraintText(options: DramaLabStoryboardOptions) {
    return [
        options.creationMode === "universal" ? productionModes.universal : options.creationMode === "classic" ? "本次使用经典分镜模式：creationMode 固定为 classic，universalSegmentText 为空字符串。" : "",
        options.generateNarration === true ? productionModes.narration : options.generateNarration === false ? "本次未开启额外解说旁白，不扩写解说；仅保留剧本原有的旁白，角色对白仍写在 dialogue。" : "",
        options.shotCount === undefined ? "" : `**约束**：总镜头数应在 ${options.shotCount} 个左右（允许±20%）。请合并或拆分动作以满足此要求。`,
        options.totalDuration === undefined ? "" : `**约束**：视频总时长应在 ${options.totalDuration} 秒左右（允许±10%）。请调整镜头数量与单镜时长以满足此要求。`,
    ]
        .filter(Boolean)
        .join("\n");
}
