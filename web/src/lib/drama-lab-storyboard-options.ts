export type DramaLabStoryboardOptions = { shotCount?: number; totalDuration?: number };
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
    return result;
}

/** Tolerances copied from production L formatUserPrompt, not invented hard limits. */
export function dramaLabStoryboardConstraintText(options: DramaLabStoryboardOptions) {
    return [
        options.shotCount === undefined ? "" : `**约束**：总镜头数应在 ${options.shotCount} 个左右（允许±20%）。请合并或拆分动作以满足此要求。`,
        options.totalDuration === undefined ? "" : `**约束**：视频总时长应在 ${options.totalDuration} 秒左右（允许±10%）。请调整镜头数量与单镜时长以满足此要求。`,
    ]
        .filter(Boolean)
        .join("\n");
}
