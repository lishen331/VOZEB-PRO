// 复用既有视频时长策略，确保后续每个镜头均可作为视频任务生成。
const MIN_VIDEO_SHOT_DURATION_SECONDS = 4;
const MAX_VIDEO_SHOT_DURATION_SECONDS = 15;
const MAX_SHORT_FILM_DURATION_SECONDS = 180;

export type ScriptPracticeAdaptationParameters = {
    targetDurationSeconds: number;
    shotCount: number;
    shotStyle?: string;
    viewpoint?: string;
};

export type AdaptationParameterValidation = {
    valid: boolean;
    message?: string;
    minShotCount?: number;
    maxShotCount?: number;
    secondsPerShot?: number;
};

export class ScriptPracticeAdaptationParameterError extends Error {
    readonly status = 400;
}

export function adaptationParameterValidation(value: Pick<ScriptPracticeAdaptationParameters, "targetDurationSeconds" | "shotCount">): AdaptationParameterValidation {
    const targetDurationSeconds = Number(value.targetDurationSeconds);
    const shotCount = Number(value.shotCount);
    if (!Number.isSafeInteger(targetDurationSeconds) || targetDurationSeconds <= 0) return { valid: false, message: "成片时长必须为正整数秒" };
    if (targetDurationSeconds > MAX_SHORT_FILM_DURATION_SECONDS) return { valid: false, message: `成片时长不能超过 ${MAX_SHORT_FILM_DURATION_SECONDS} 秒` };
    if (!Number.isSafeInteger(shotCount) || shotCount <= 0) return { valid: false, message: "镜头数量必须为正整数" };
    const minShotCount = Math.ceil(targetDurationSeconds / MAX_VIDEO_SHOT_DURATION_SECONDS);
    const maxShotCount = Math.floor(targetDurationSeconds / MIN_VIDEO_SHOT_DURATION_SECONDS);
    if (shotCount < minShotCount || shotCount > maxShotCount)
        return {
            valid: false,
            message: `${targetDurationSeconds} 秒成片最多可拆 ${maxShotCount} 镜，最少需要 ${minShotCount} 镜`,
            minShotCount,
            maxShotCount,
        };
    return { valid: true, minShotCount, maxShotCount, secondsPerShot: targetDurationSeconds / shotCount };
}

export function normalizeAdaptationParameters(value: unknown): ScriptPracticeAdaptationParameters {
    const input = record(value);
    const targetDurationSeconds = number(input.targetDurationSeconds);
    const shotCount = number(input.shotCount);
    const validation = adaptationParameterValidation({ targetDurationSeconds, shotCount });
    if (!validation.valid) throw new ScriptPracticeAdaptationParameterError(validation.message || "改编参数无效");
    return {
        targetDurationSeconds,
        shotCount,
        ...(text(input.shotStyle) ? { shotStyle: text(input.shotStyle) } : {}),
        ...(text(input.viewpoint) ? { viewpoint: text(input.viewpoint) } : {}),
    };
}

export function normalizeProjectAdaptationParameters(value: Record<string, unknown>) {
    if (!("targetDurationSeconds" in value) && !("shotCount" in value)) return value;
    return { ...value, ...normalizeAdaptationParameters(value) };
}

function record(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function number(value: unknown) {
    return typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
}

function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}
