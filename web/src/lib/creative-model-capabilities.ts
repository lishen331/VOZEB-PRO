import type { LogicalModelCapabilityProfile } from "@/lib/auth/store-types";
import { isCreativeAutoValue, type CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";

export type CreativeMediaCapability = "image" | "video" | "audio";
export type CreativeModelCapabilityProfile = Pick<
    LogicalModelCapabilityProfile,
    "aspectRatios" | "resolutions" | "durationSeconds" | "minDurationSeconds" | "maxDurationSeconds" | "maxBatchSize" | "supportsAudioGeneration" | "supportsReferenceImage" | "supportsReferenceVideo" | "supportsReferenceAudio" | "maxReferenceImages"
>;
export type CreativeModelCapabilityOption = {
    id: string;
    name: string;
    capability: CreativeMediaCapability;
    capabilityProfile?: CreativeModelCapabilityProfile;
};

type LogicalModelLike = {
    id: string;
    bindings: Array<{ enabled: boolean; capabilityProfile?: LogicalModelCapabilityProfile }>;
};

export function creativeModelProfileForLogicalModel(model: LogicalModelLike | undefined): CreativeModelCapabilityProfile | undefined {
    const bindings = (model?.bindings || []).filter((binding) => binding.enabled);
    const profiles = bindings.filter((binding) => binding.capabilityProfile).map((binding) => binding.capabilityProfile!);
    if (!profiles.length) return undefined;
    // 服务端会换下一个绑定，所以只有全部绑定都明确不支持才算不支持；没配置的一律当支持。
    const referenceSupport = (key: "supportsReferenceImage" | "supportsReferenceVideo" | "supportsReferenceAudio") => (bindings.every((binding) => binding.capabilityProfile?.[key] === false) ? false : undefined);
    const referenceLimits = bindings.map((binding) => binding.capabilityProfile?.maxReferenceImages);
    return compactProfile({
        aspectRatios: unionTextLists(profiles.map((profile) => profile.aspectRatios)),
        resolutions: unionTextLists(profiles.map((profile) => profile.resolutions)),
        durationSeconds: unionNumberLists(profiles.map((profile) => profile.durationSeconds)),
        minDurationSeconds: minimum(profiles.map((profile) => profile.minDurationSeconds)),
        maxDurationSeconds: maximum(profiles.map((profile) => profile.maxDurationSeconds)),
        maxBatchSize: maximum(profiles.map((profile) => profile.maxBatchSize)),
        supportsAudioGeneration: profiles.some((profile) => profile.supportsAudioGeneration) || undefined,
        supportsReferenceImage: referenceSupport("supportsReferenceImage"),
        supportsReferenceVideo: referenceSupport("supportsReferenceVideo"),
        supportsReferenceAudio: referenceSupport("supportsReferenceAudio"),
        maxReferenceImages: referenceLimits.every((limit) => limit) ? maximum(referenceLimits) : undefined,
    });
}

export type CreativeReferenceCounts = { images: number; videos: number; audios: number };

/** Reference materials the model's admin config explicitly rejects; empty when the request may be submitted. */
export function unsupportedReferenceIssues(profile: CreativeModelCapabilityProfile | undefined, counts: CreativeReferenceCounts, modelName = "该模型") {
    if (!profile) return [];
    const issues: string[] = [];
    if (counts.images && profile.supportsReferenceImage === false) issues.push(`${modelName} 不支持参考图。请断开参考图，或换一个支持参考图的模型。`);
    else if (counts.images && profile.maxReferenceImages && counts.images > profile.maxReferenceImages) issues.push(`${modelName} 最多支持 ${profile.maxReferenceImages} 张参考图，当前连接了 ${counts.images} 张。`);
    if (counts.videos && profile.supportsReferenceVideo === false) issues.push(`${modelName} 不支持参考视频。请断开参考视频，或换一个支持参考视频的模型。`);
    if (counts.audios && profile.supportsReferenceAudio === false) issues.push(`${modelName} 不支持参考音频。请断开参考音频，或换一个支持参考音频的模型。`);
    return issues;
}

export function creativeSelectedModelProfile(models: readonly CreativeModelCapabilityOption[], capability: CreativeMediaCapability): CreativeModelCapabilityProfile | undefined {
    const selected = models.filter((model) => model.capability === capability);
    const profiles = selected.filter((model) => model.capabilityProfile).map((model) => model.capabilityProfile!);
    if (!profiles.length) return undefined;
    return compactProfile({
        aspectRatios: intersectTextLists(profiles.map((profile) => profile.aspectRatios)),
        resolutions: intersectTextLists(profiles.map((profile) => profile.resolutions)),
        durationSeconds: intersectNumberLists(profiles.map((profile) => profile.durationSeconds)),
        minDurationSeconds: maximum(profiles.map((profile) => profile.minDurationSeconds)),
        maxDurationSeconds: minimum(profiles.map((profile) => profile.maxDurationSeconds)),
        maxBatchSize: selected.every((model) => model.capabilityProfile?.maxBatchSize) ? selected.reduce((total, model) => total + model.capabilityProfile!.maxBatchSize!, 0) : undefined,
        supportsAudioGeneration: profiles.some((profile) => profile.supportsAudioGeneration) || undefined,
    });
}

export function reconcileCreativeGenerationPreferences(preferences: CreativeGenerationPreferences, models: readonly CreativeModelCapabilityOption[]): CreativeGenerationPreferences {
    let next = preferences;
    const imageModels = models.filter((model) => model.capability === "image");
    const imageProfile = creativeSelectedModelProfile(models, "image");
    if (imageModels.length) {
        const image = reconcileMediaPreferences(preferences.image || {}, imageProfile || {}, imageModels.length);
        if (image !== preferences.image) next = { ...next, image };
    }
    const videoModels = models.filter((model) => model.capability === "video");
    const videoProfile = creativeSelectedModelProfile(models, "video");
    if (videoModels.length) {
        const video = reconcileVideoPreferences(preferences.video || {}, videoProfile || {}, videoModels.length);
        if (video !== preferences.video) next = { ...next, video };
    }
    return next;
}

function reconcileMediaPreferences<T extends { size?: string; quality?: string; count?: number }>(value: T, profile: CreativeModelCapabilityProfile, minimumCount: number): T {
    let next = value;
    const size = reconcileSizeValue(value.size, profile.aspectRatios);
    const quality = reconcileTextValue(value.quality, profile.resolutions);
    const count = Math.max(minimumCount, Math.min(value.count || 1, profile.maxBatchSize || Number.POSITIVE_INFINITY));
    if (size !== value.size || quality !== value.quality || count !== value.count) next = { ...value, size, quality, count };
    return next;
}

function reconcileSizeValue(value: string | undefined, supported: string[] | undefined) {
    if (!supported) return value;
    const dimensions = value?.match(/^(\d+)x(\d+)$/i);
    if (dimensions) {
        const divisor = greatestCommonDivisor(Number(dimensions[1]), Number(dimensions[2]));
        const ratio = `${Number(dimensions[1]) / divisor}:${Number(dimensions[2]) / divisor}`;
        if (supported.some((item) => normalizedText(item) === normalizedText(ratio))) return value;
    }
    return reconcileTextValue(value, supported);
}

function reconcileVideoPreferences<T extends { size?: string; quality?: string; count?: number; seconds?: number }>(value: T, profile: CreativeModelCapabilityProfile, minimumCount: number): T {
    let next = reconcileMediaPreferences(value, profile, minimumCount);
    const seconds = reconcileSeconds(value.seconds, profile);
    if (seconds !== value.seconds) next = { ...next, seconds };
    return next;
}

function reconcileTextValue(value: string | undefined, supported: string[] | undefined) {
    if (!supported) return value;
    if (!value || isCreativeAutoValue(value)) return value;
    const matched = value ? supported.find((item) => normalizedText(item) === normalizedText(value)) : undefined;
    if (matched) return matched;
    return supported[0];
}

function reconcileSeconds(value: number | undefined, profile: CreativeModelCapabilityProfile) {
    if (profile.durationSeconds) {
        if (value && profile.durationSeconds.includes(value)) return value;
        return profile.durationSeconds[0] || value;
    }
    if (value === undefined) return profile.minDurationSeconds;
    if (profile.minDurationSeconds && value < profile.minDurationSeconds) return profile.minDurationSeconds;
    if (profile.maxDurationSeconds && value > profile.maxDurationSeconds) return profile.maxDurationSeconds;
    return value;
}

function intersectTextLists(lists: Array<string[] | undefined>) {
    const configured = lists.filter((list): list is string[] => Array.isArray(list) && list.length > 0);
    if (!configured.length) return undefined;
    return configured[0].filter((item) => configured.slice(1).every((list) => list.some((candidate) => normalizedText(candidate) === normalizedText(item))));
}

function intersectNumberLists(lists: Array<number[] | undefined>) {
    const configured = lists.filter((list): list is number[] => Array.isArray(list) && list.length > 0);
    if (!configured.length) return undefined;
    return configured[0].filter((item) => configured.slice(1).every((list) => list.includes(item)));
}

function unionTextLists(lists: Array<string[] | undefined>) {
    const values = new Map<string, string>();
    for (const item of lists.flatMap((list) => list || [])) values.set(normalizedText(item), item);
    return values.size ? Array.from(values.values()) : undefined;
}

function unionNumberLists(lists: Array<number[] | undefined>) {
    const values = Array.from(new Set(lists.flatMap((list) => list || []))).sort((left, right) => left - right);
    return values.length ? values : undefined;
}

function minimum(values: Array<number | undefined>) {
    const configured = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return configured.length ? Math.min(...configured) : undefined;
}

function maximum(values: Array<number | undefined>) {
    const configured = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return configured.length ? Math.max(...configured) : undefined;
}

function compactProfile(profile: CreativeModelCapabilityProfile) {
    return Object.values(profile).some((value) => value !== undefined) ? profile : undefined;
}

function normalizedText(value: string) {
    return value.trim().replace(/p$/i, "").toLowerCase();
}

function greatestCommonDivisor(left: number, right: number): number {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) [a, b] = [b, a % b];
    return a || 1;
}
