export type CustomVoiceProvider = "minimax" | "qwen";
export type CustomVoiceKind = "clone" | "design";
export type CustomVoiceStatus = "creating" | "ready" | "failed" | "deleted";

export type VoiceCustomizationConfig = {
    provider: CustomVoiceProvider;
    region: "cn" | "intl";
    paths: { upload?: string; clone?: string; design?: string; delete?: string; customization?: string };
    ttsModels: string[];
    audioLimits: { formats: string[]; minSec: number; maxSec: number; maxMB: number };
    designLimits: { promptMax: number; previewTextMin: number; previewTextMax: number };
    inactiveExpireDays?: number;
    pricing: { clone: number; design: number; currency: "CNY" | "USD" };
};

export const DEFAULT_VOICE_USD_TO_CNY = 7.1;

export const VOICE_CUSTOMIZATION_TEMPLATES: Record<CustomVoiceProvider, VoiceCustomizationConfig> = {
    minimax: {
        provider: "minimax",
        region: "cn",
        paths: { upload: "/v1/files/upload", clone: "/v1/voice_clone", design: "/v1/voice_design", delete: "/v1/delete_voice" },
        ttsModels: ["speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo"],
        audioLimits: { formats: ["mp3", "m4a", "wav"], minSec: 10, maxSec: 300, maxMB: 20 },
        designLimits: { promptMax: 500, previewTextMin: 1, previewTextMax: 500 },
        inactiveExpireDays: 7,
        pricing: { clone: 9.9, design: 9.9, currency: "CNY" },
    },
    qwen: {
        provider: "qwen",
        region: "cn",
        paths: { customization: "/api/v1/services/audio/tts/customization" },
        ttsModels: ["qwen-audio-3.1-tts-plus", "qwen-audio-3.1-tts-flash"],
        audioLimits: { formats: ["mp3", "m4a", "wav"], minSec: 10, maxSec: 60, maxMB: 10 },
        designLimits: { promptMax: 500, previewTextMin: 15, previewTextMax: 200 },
        pricing: { clone: 0, design: 0, currency: "CNY" },
    },
};

export function normalizeVoiceCustomization(value: unknown): VoiceCustomizationConfig | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    if (raw.provider !== "minimax" && raw.provider !== "qwen") return undefined;
    const template = VOICE_CUSTOMIZATION_TEMPLATES[raw.provider];
    const paths = record(raw.paths);
    const audio = record(raw.audioLimits);
    const design = record(raw.designLimits);
    const pricing = record(raw.pricing);
    const ttsModels = Array.from(new Set((Array.isArray(raw.ttsModels) ? raw.ttsModels : []).map((item) => text(item, 120)).filter(Boolean))).slice(0, 32);
    const formats = Array.from(new Set((Array.isArray(audio.formats) ? audio.formats : template.audioLimits.formats).map((item) => text(item, 12).toLowerCase()).filter(Boolean)));
    const expireDays = positive(raw.inactiveExpireDays, 0);
    return {
        provider: raw.provider,
        region: raw.region === "intl" ? "intl" : "cn",
        paths: Object.fromEntries((["upload", "clone", "design", "delete", "customization"] as const).flatMap((key) => (apiPath(paths[key]) ? [[key, apiPath(paths[key])]] : []))),
        ttsModels: ttsModels.length ? ttsModels : template.ttsModels,
        audioLimits: { formats: formats.length ? formats : template.audioLimits.formats, minSec: positive(audio.minSec, template.audioLimits.minSec), maxSec: positive(audio.maxSec, template.audioLimits.maxSec), maxMB: Math.min(20, positive(audio.maxMB, template.audioLimits.maxMB)) },
        designLimits: { promptMax: positive(design.promptMax, template.designLimits.promptMax), previewTextMin: positive(design.previewTextMin, template.designLimits.previewTextMin), previewTextMax: positive(design.previewTextMax, template.designLimits.previewTextMax) },
        ...(expireDays ? { inactiveExpireDays: expireDays } : {}),
        pricing: { clone: nonNegative(pricing.clone, template.pricing.clone), design: nonNegative(pricing.design, template.pricing.design), currency: pricing.currency === "USD" ? "USD" : "CNY" },
    };
}

export function priceInCny(amount: number, currency: string | undefined, usdToCny: number) {
    return String(currency || "").toUpperCase() === "USD" ? amount * usdToCny : amount;
}

export function customVoiceCreatePoints(config: VoiceCustomizationConfig, kind: CustomVoiceKind, usdToCny: number, pointsPerYuan: number) {
    return Math.round(priceInCny(config.pricing[kind], config.pricing.currency, usdToCny) * pointsPerYuan * 100) / 100;
}

function record(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function apiPath(value: unknown) {
    const path = text(value, 300);
    return path ? (path.startsWith("/") ? path : `/${path}`) : "";
}

function positive(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegative(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}
