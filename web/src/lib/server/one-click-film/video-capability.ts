import { resolveGlobalAiOpcPreset } from "@/lib/globalaiopc-catalog";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { templateVideoReferenceRoles } from "@/lib/server/provider-task-config";
import type { VideoReferenceRole } from "@/lib/video-reference-contract";

type VideoCandidate = ReturnType<typeof resolveLogicalModelCandidates>[number];

/**
 * 视频渠道能力判定。逻辑与创作工坊路由内的同名判定保持一致，
 * 抽成独立模块是为了让一键成片不必再经由 /api/drama-lab/... 转发
 * （那条链路会把 featureModule 写成 drama-lab，导致商单用量记到教学版账上）。
 *
 * 一个逻辑模型可能跨渠道failover，因此首/尾帧只在**所有**候选渠道都支持时才保留；
 * 否则 failover 之后上游会整单拒绝。
 */
export function resolveOneClickVideoCapability(settings: Parameters<typeof resolveLogicalModelCandidates>[0], model: string) {
    const candidates = Array.isArray(settings.logicalModels) && Array.isArray(settings.systemChannels) ? resolveLogicalModelCandidates(settings, "video", model) : [];
    return {
        candidates,
        supportsFirstFrame: candidates.length ? candidates.every(supportsFirstFrame) : undefined,
        supportsLastFrame: candidates.length ? candidates.every(supportsLastFrame) : false,
        supportsReferenceImages: candidates.length > 0 && candidates.every(supportsReferenceImages),
        maxReferenceImages: minimumReferenceLimit(candidates),
    };
}

function referenceRoles(candidate: VideoCandidate): VideoReferenceRole[] {
    const advanced = candidate.channel.advancedConfig;
    const preset = resolveGlobalAiOpcPreset(advanced, candidate.upstreamModel);
    if (preset?.videoReferenceRoles) return preset.videoReferenceRoles;
    if (candidate.channel.apiFormat === "gemini" || advanced?.protocol === "gemini") return ["reference", "first_frame", "last_frame"];
    if (advanced?.protocol === "seedance" || advanced?.protocol === "volcengine-video" || advanced?.protocol === "seedance-special") return ["reference", "first_frame", "last_frame"];
    if (advanced?.protocol === "openai" || advanced?.protocol === "newapi" || advanced?.protocol === "sub2api") return ["reference", "first_frame"];
    return templateVideoReferenceRoles(advanced?.requestTemplate);
}

function supportsFirstFrame(candidate: VideoCandidate) {
    return referenceRoles(candidate).includes("first_frame");
}

function supportsLastFrame(candidate: VideoCandidate) {
    return referenceRoles(candidate).includes("last_frame");
}

function supportsReferenceImages(candidate: VideoCandidate) {
    const advanced = candidate.channel.advancedConfig;
    const preset = resolveGlobalAiOpcPreset(advanced, candidate.upstreamModel);
    if (preset?.videoReferenceRoles) return preset.videoReferenceRoles.includes("reference");
    // 只有首/尾帧模板的自定义渠道无法承载编号多图槽位。
    // templateVideoReferenceRoles 对经典任务会默认返回 reference，那个默认值
    // 不能当作"支持多图输入"的证据。
    if (advanced?.protocol === "custom") return /\{\{\s*(?:references|images|image_urls)\s*\}\}/i.test(advanced.requestTemplate || "");
    return referenceRoles(candidate).includes("reference");
}

function minimumReferenceLimit(candidates: VideoCandidate[]) {
    const limits = candidates.flatMap((candidate) => {
        const value = candidate.capabilityProfile?.maxReferenceImages;
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? [Math.floor(value)] : [];
    });
    return limits.length ? Math.min(...limits) : undefined;
}
