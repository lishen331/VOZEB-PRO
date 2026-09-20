import { customProtocolTemplateVariables } from "./custom-protocol-reference-preflight";
/** A confirmed mapping is required: a provider's example omitting a field is not a negative capability claim. */
export type VerificationMappings = { image?: boolean; video?: boolean; mixed?: boolean; maxImages?: number };
export type VerificationMode = "text" | "single-image" | "multi-image" | "video-reference" | "mixed";
export function planBindingVerification(capability: "text" | "image" | "video", mappings: VerificationMappings) {
    const images = mappings.image ? Math.min(2, Math.max(1, Math.floor(mappings.maxImages ?? 1))) : 0;
    const videos = capability === "video" && mappings.video ? 1 : 0;
    const imageCount = videos && !mappings.mixed ? 0 : images;
    const mode: VerificationMode = videos ? (imageCount ? "mixed" : "video-reference") : imageCount > 1 ? "multi-image" : imageCount ? "single-image" : "text";
    return { mode, imageCount, videoCount: videos, outputCount: 1, ...(capability === "video" ? { resolution: "480p", durationSeconds: 5 } : {}) };
}
/** This selects a next action, never submits or silently retries a billable request. */
export function nextVerificationAction(outcome: { status: "success" | "running" | "failed" | "unknown"; taskId?: string; rejection?: "unsupported-reference" | "authentication" | "balance" | "rate-limit"; billable?: boolean }) {
    if (outcome.status === "success") return "stop";
    if (outcome.status === "running") return "poll";
    if (outcome.status === "unknown" || outcome.taskId) return "review";
    if (outcome.rejection && outcome.rejection !== "unsupported-reference") return "stop";
    return outcome.rejection === "unsupported-reference" && outcome.billable === false ? "offer-fallback" : "review";
}

/** Select a candidate from real JSON value placeholders; generic containers need explicit capability evidence. */
export type VerificationTemplateSupport = { supportsReferenceImage?: boolean; supportsReferenceVideo?: boolean; supportsMixedReference?: boolean; maxReferenceImages?: number };
export function planBindingVerificationTemplate(capability: "text" | "image" | "video", template: string, supports: VerificationTemplateSupport = {}) {
    const variables = customProtocolTemplateVariables(template || "{}");
    const arrayImages = variables.has("images") || (capability === "video" && (variables.has("image_urls") || variables.has("reference_images")));
    const first = variables.has("image") || variables.has("first_frame") || variables.has("first_frame_url");
    const last = variables.has("last_frame") || variables.has("last_frame_url");
    const directImage = arrayImages || first || last;
    const directVideo = capability === "video" && (variables.has("video") || variables.has("videos") || variables.has("reference_videos"));
    const shared = variables.has("content") || variables.has("references") || (capability === "video" && variables.has("ref_assets")) || (capability === "text" && variables.has("messages"));
    const image = supports.supportsReferenceImage !== false && (directImage || (shared && supports.supportsReferenceImage === true));
    const video = supports.supportsReferenceVideo !== false && (directVideo || (shared && supports.supportsReferenceVideo === true));
    const knownCapacity = arrayImages ? 2 : directImage ? Number(first) + Number(last) : (supports.maxReferenceImages ?? 1);
    const maxImages = supports.maxReferenceImages === undefined ? knownCapacity : Math.min(knownCapacity, supports.maxReferenceImages);
    // Explicitly combined mappings are a candidate, not proof; shared containers alone do not establish mixed support.
    const mixed = supports.supportsMixedReference ?? (directImage && directVideo);
    return planBindingVerification(capability, { image, video, mixed, maxImages });
}
