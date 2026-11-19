"use client";

import { useEffect, useState } from "react";
import type { CreativeModelCapabilityProfile } from "@/lib/creative-model-capabilities";

export type PracticeCanvasModelOptions = Partial<Record<"image" | "video" | "text", { models: string[]; locked: boolean; capabilityProfile?: CreativeModelCapabilityProfile; modelProfiles?: Record<string, CreativeModelCapabilityProfile> }>>;

const CAPABILITIES = ["image", "video", "text"] as const;

/**
 * 只在练习画布请求模型列表。正式画布不传 executionProfile，这里直接返回空对象，
 * 模型下拉继续用用户自己配置的模型。
 */
export function usePracticeCanvasModels(executionProfile?: "open-source-practice"): PracticeCanvasModelOptions {
    const [options, setOptions] = useState<PracticeCanvasModelOptions>({});
    useEffect(() => {
        if (executionProfile !== "open-source-practice") return;
        const controller = new AbortController();
        void Promise.all(
            CAPABILITIES.map(async (type) => {
                const response = await fetch(`/api/practice/available-models?type=${type}`, { signal: controller.signal });
                if (!response.ok) return null;
                const body = (await response.json()) as { mode?: string; models?: Array<{ id?: string; capabilityProfile?: CreativeModelCapabilityProfile }>; capabilityProfile?: CreativeModelCapabilityProfile };
                const models = Array.isArray(body.models) ? body.models.flatMap((model) => (typeof model.id === "string" && model.id ? [model.id] : [])) : [];
                const modelProfiles = Object.fromEntries((body.models || []).flatMap((model) => (model.id && model.capabilityProfile ? [[model.id, model.capabilityProfile] as const] : [])));
                return [type, { models, locked: body.mode !== "selectable", ...(body.capabilityProfile ? { capabilityProfile: body.capabilityProfile } : {}), ...(Object.keys(modelProfiles).length ? { modelProfiles } : {}) }] as const;
            }),
        )
            .then((entries) => {
                if (controller.signal.aborted) return;
                setOptions(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
            });
        return () => controller.abort();
    }, [executionProfile]);
    return executionProfile === "open-source-practice" ? options : {};
}

/** 练习模式下，节点当前模型不在练习列表里时回落到列表第一项，避免提交一个练习池不认的模型。 */
export function practiceCanvasModelValue(options: PracticeCanvasModelOptions | undefined, capability: "image" | "video" | "text", model: string) {
    const entry = options?.[capability];
    if (!entry) return model;
    return entry.models.includes(model) ? model : entry.models[0] || "";
}

/** Resolve the selected practice model profile, or the shared safe profile for a locked random pool. */
export function practiceCanvasModelCapabilityProfile(options: PracticeCanvasModelOptions | undefined, capability: "image" | "video" | "text", model: string) {
    const entry = options?.[capability];
    return entry?.modelProfiles?.[model] || entry?.capabilityProfile;
}
