"use client";

import { useEffect, useState } from "react";

export type PracticeCanvasModelOptions = Partial<Record<"image" | "video" | "text", { models: string[]; locked: boolean }>>;

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
                const body = (await response.json()) as { mode?: string; models?: Array<{ id?: string }> };
                const models = Array.isArray(body.models) ? body.models.flatMap((model) => (typeof model.id === "string" && model.id ? [model.id] : [])) : [];
                return [type, { models, locked: body.mode !== "selectable" }] as const;
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
