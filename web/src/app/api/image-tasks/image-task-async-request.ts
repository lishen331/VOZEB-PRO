import type { SystemChannelProtocol } from "@/lib/auth/store-types";

import { QUALITY_ALIASES } from "./image-task-types";

export type AsyncImageTaskProtocol = Extract<SystemChannelProtocol, "modelbay-image-task" | "tuzi-image-task">;

export function isAsyncImageTaskProtocol(protocol: string | undefined): protocol is AsyncImageTaskProtocol {
    return protocol === "modelbay-image-task" || protocol === "tuzi-image-task";
}

type AsyncImageRequestInput = {
    model: string;
    prompt: string;
    quality?: string;
    size?: string;
    aspectRatio?: string;
    outputBackground?: "opaque" | "transparent";
};

const MODELBAY_QUALITIES = new Set(["low", "medium", "high", "auto"]);
const TUZI_QUALITIES = new Set(["low", "medium", "high", "xhigh", "max"]);
// 画布未指定质量（auto）时兔子默认走 low，出图更快；用户显式选择的质量始终优先。
const TUZI_DEFAULT_QUALITY = "low";

function normalizedQuality(value: string | undefined, allowed: Set<string>) {
    const raw = (value || "").trim().toLowerCase();
    const mapped = QUALITY_ALIASES[raw] || (raw === "hd" ? "high" : raw === "standard" ? "medium" : raw);
    return allowed.has(mapped) ? mapped : undefined;
}

export function buildModelBayImageTaskRequest(input: AsyncImageRequestInput & { imageUrls: string[] }) {
    const quality = normalizedQuality(input.quality, MODELBAY_QUALITIES);
    return {
        model: input.model,
        input: {
            prompt: input.prompt,
            number_of_images: 1,
            ...(quality ? { quality } : {}),
            ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
            ...(input.imageUrls.length ? { input_images: input.imageUrls } : {}),
            ...(input.outputBackground === "opaque" ? { background: "opaque" } : {}),
        },
    };
}

function tuziQuality(value: string | undefined) {
    return normalizedQuality(value, TUZI_QUALITIES) || TUZI_DEFAULT_QUALITY;
}

export function buildTuziImageTaskJsonRequest(input: AsyncImageRequestInput) {
    return {
        model: input.model,
        prompt: input.prompt,
        n: 1,
        ...(input.size ? { size: input.size } : {}),
        quality: tuziQuality(input.quality),
    };
}

// 兔子按 JSON 类型解析 multipart 字段：数字字段传字符串会 400，因此不传 n（上游默认 1 张）。
export function buildTuziImageTaskFormData(input: AsyncImageRequestInput & { files: File[] }) {
    const form = new FormData();
    form.set("model", input.model);
    form.set("prompt", input.prompt);
    if (input.size) form.set("size", input.size);
    form.set("quality", tuziQuality(input.quality));
    for (const file of input.files) form.append("input_reference", file, file.name);
    return form;
}
