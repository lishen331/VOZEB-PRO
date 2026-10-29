export type AudioParamValue = string | number | boolean;
export type AudioParams = Record<string, AudioParamValue>;
export type AudioModelFamily = "minimax" | "suno" | "openai";

type Option = { value: string; label: string };
type FieldBase = { key: string; label: string; group: string; hint?: string };
export type AudioParamField =
    | (FieldBase & { type: "slider"; min: number; max: number; step: number; defaultValue: number })
    | (FieldBase & { type: "segmented" | "select"; options: Option[]; defaultValue: string })
    | (FieldBase & { type: "switch"; defaultValue: boolean })
    | (FieldBase & { type: "text"; placeholder: string; defaultValue: string });

export function audioModelFamily(model: string | undefined): AudioModelFamily {
    const name = (model || "").toLowerCase();
    if (name.includes("suno")) return "suno";
    if (/(^|[/_-])speech-(0\d|\d+\.\d)|minimax.*speech/.test(name)) return "minimax";
    return "openai";
}

export const minimaxVoiceOptions: Option[] = [
    { value: "female-shaonv", label: "少女音色" },
    { value: "female-yujie", label: "御姐音色" },
    { value: "female-chengshu", label: "成熟女性音色" },
    { value: "female-tianmei", label: "甜美女性音色" },
    { value: "male-qn-qingse", label: "青涩青年音色" },
    { value: "male-qn-jingying", label: "精英青年音色" },
    { value: "male-qn-badao", label: "霸道青年音色" },
    { value: "male-qn-daxuesheng", label: "青年大学生音色" },
    { value: "presenter_male", label: "男性主持人" },
    { value: "presenter_female", label: "女性主持人" },
    { value: "audiobook_male_1", label: "男性有声书" },
    { value: "audiobook_female_1", label: "女性有声书" },
    { value: "clever_boy", label: "聪明男童" },
    { value: "cute_boy", label: "可爱男童" },
    { value: "lovely_girl", label: "萌萌女童" },
    { value: "cartoon_pig", label: "卡通猪小琪" },
];

export const minimaxInterjections = ["(laughs)", "(chuckle)", "(sighs)", "(breath)", "(gasps)", "(coughs)", "(clear-throat)", "(sniffs)", "(humming)", "(emm)"];
export const minimaxPauseToken = "<#0.5#>";

const MINIMAX_FIELDS: AudioParamField[] = [
    { key: "voiceId", label: "音色", group: "音色", type: "select", options: minimaxVoiceOptions, defaultValue: "female-shaonv" },
    { key: "speed", label: "语速", group: "基础调节", type: "slider", min: 0.5, max: 2, step: 0.01, defaultValue: 1 },
    { key: "pitch", label: "声调", group: "基础调节", type: "slider", min: -12, max: 12, step: 1, defaultValue: 0 },
    { key: "volume", label: "音量", group: "基础调节", type: "slider", min: 0.1, max: 10, step: 0.1, defaultValue: 1 },
    {
        key: "emotion",
        label: "情绪",
        group: "基础调节",
        type: "select",
        defaultValue: "auto",
        options: [
            { value: "auto", label: "自动" },
            { value: "happy", label: "高兴" },
            { value: "sad", label: "悲伤" },
            { value: "angry", label: "愤怒" },
            { value: "fearful", label: "害怕" },
            { value: "disgusted", label: "厌恶" },
            { value: "surprised", label: "惊讶" },
            { value: "calm", label: "平静" },
        ],
    },
    { key: "modifyPitch", label: "音高", group: "音色效果调节", type: "slider", min: -100, max: 100, step: 1, defaultValue: 0, hint: "负值更低沉，正值更明亮" },
    { key: "intensity", label: "强度", group: "音色效果调节", type: "slider", min: -100, max: 100, step: 1, defaultValue: 0, hint: "负值更有力，正值更柔和" },
    { key: "timbre", label: "音色调节", group: "音色效果调节", type: "slider", min: -100, max: 100, step: 1, defaultValue: 0, hint: "负值更浑厚，正值更清脆" },
    {
        key: "soundEffect",
        label: "音效",
        group: "音色效果调节",
        type: "segmented",
        defaultValue: "none",
        options: [
            { value: "none", label: "无" },
            { value: "spacious_echo", label: "空旷回音" },
            { value: "auditorium_echo", label: "礼堂广播" },
            { value: "lofi_telephone", label: "电话失真" },
            { value: "robotic", label: "电音" },
        ],
    },
    {
        key: "format",
        label: "输出格式",
        group: "输出",
        type: "segmented",
        defaultValue: "mp3",
        options: ["mp3", "wav", "flac"].map((value) => ({ value, label: value })),
    },
];

const SUNO_FIELDS: AudioParamField[] = [
    {
        key: "mode",
        label: "生成模式",
        group: "生成模式",
        type: "segmented",
        defaultValue: "describe",
        options: [
            { value: "describe", label: "描述生音乐" },
            { value: "lyrics", label: "歌词生音乐" },
        ],
    },
    { key: "instrumental", label: "纯音乐", group: "高级设置", type: "switch", defaultValue: false },
    { key: "title", label: "歌曲标题", group: "高级设置", type: "text", placeholder: "可选", defaultValue: "" },
    { key: "tags", label: "音乐风格", group: "高级设置", type: "text", placeholder: "如：流行, 电子, 女声", defaultValue: "" },
];

export function audioModelFields(model: string | undefined) {
    const family = audioModelFamily(model);
    return family === "minimax" ? MINIMAX_FIELDS : family === "suno" ? SUNO_FIELDS : [];
}

/** Fill in defaults and clamp every value to its field contract; unknown keys are dropped. */
export function normalizeAudioParams(model: string | undefined, input: unknown): AudioParams {
    const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const result: AudioParams = {};
    for (const field of audioModelFields(model)) {
        const raw = source[field.key];
        if (field.type === "slider") {
            const value = Number(raw);
            result[field.key] = Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.defaultValue;
        } else if (field.type === "switch") {
            result[field.key] = typeof raw === "boolean" ? raw : field.defaultValue;
        } else if (field.type === "text") {
            result[field.key] = typeof raw === "string" ? raw.trim().slice(0, 200) : field.defaultValue;
        } else {
            result[field.key] = field.options.some((option) => option.value === raw) ? (raw as string) : field.defaultValue;
        }
    }
    return result;
}

export function audioModelPlaceholder(model: string | undefined) {
    const family = audioModelFamily(model);
    if (family === "minimax") return "输入要合成的文本";
    if (family === "suno") return "描述您想要的音乐，或在歌词模式下输入歌词";
    return "描述要生成的音频内容";
}

export function audioParamsSummary(model: string | undefined, input: unknown) {
    const family = audioModelFamily(model);
    const params = normalizeAudioParams(model, input);
    if (family === "minimax") return `${minimaxVoiceOptions.find((option) => option.value === params.voiceId)?.label || params.voiceId} · ${Number(params.speed).toFixed(2)}x`;
    if (family === "suno") return `${params.mode === "lyrics" ? "歌词生音乐" : "描述生音乐"}${params.instrumental ? " · 纯音乐" : ""}`;
    return "";
}

/** Upstream fields merged over the channel's rendered request body. */
export function audioUpstreamFields(model: string | undefined, prompt: string, input: unknown): Record<string, unknown> {
    const family = audioModelFamily(model);
    if (family === "openai") return {};
    const params = normalizeAudioParams(model, input);
    if (family === "suno") {
        const instrumental = Boolean(params.instrumental);
        if (params.mode === "lyrics") return { prompt, title: params.title || undefined, tags: params.tags || undefined, make_instrumental: instrumental };
        return { prompt: "", gpt_description_prompt: prompt, tags: params.tags || undefined, make_instrumental: instrumental };
    }
    const speed = Number(params.speed);
    const format = String(params.format);
    return {
        voice: params.voiceId,
        speed,
        response_format: format,
        voice_setting: { voice_id: params.voiceId, speed, vol: Number(params.volume), pitch: Math.round(Number(params.pitch)), ...(params.emotion !== "auto" ? { emotion: params.emotion } : {}) },
        voice_modify: { pitch: Number(params.modifyPitch), intensity: Number(params.intensity), timbre: Number(params.timbre), ...(params.soundEffect !== "none" ? { sound_effects: params.soundEffect } : {}) },
        audio_setting: { format },
    };
}
