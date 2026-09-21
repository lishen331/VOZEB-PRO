import type { SystemChannelModelConfig } from "@/lib/auth/store-types";
/** Offline preflight only. A placeholder proves a mapping exists, never upstream capability or acceptance. */
export function assertCustomProtocolReferenceMapping(config: Pick<SystemChannelModelConfig, "protocol" | "requestTemplate" | "capability">, references: Array<{ type: "image" | "video" | "audio" }>) {
    if (config.protocol !== "custom" || !references.length) return;
    if (!config.requestTemplate) throw new Error("当前自定义模型缺少请求模板，尚未发起生成。");
    const variables = customProtocolTemplateVariables(config.requestTemplate);
    const shared = variables.has("references") || variables.has("content") || variables.has("ref_assets") || (config.capability === "text" && variables.has("messages"));
    for (const type of new Set(references.map((reference) => reference.type))) {
        const count = references.filter((reference) => reference.type === type).length;
        const label = type === "image" ? "图片" : type === "video" ? "视频" : "音频";
        const plural = type === "image" ? "images" : type === "video" ? "videos" : "audios";
        if (shared || variables.has(plural) || variables.has(`reference_${plural}`) || variables.has(`${type}_urls`)) continue;
        let capacity = variables.has(type) ? 1 : 0;
        if (type === "image") {
            const first = variables.has("first_frame") || variables.has("first_frame_url") || variables.has("image");
            const last = variables.has("last_frame") || variables.has("last_frame_url");
            capacity = Number(first) + Number(last);
        }
        if (capacity < count) throw new Error(`当前模板未完整映射 ${count} 个参考${label}；请补充官方字段路径、格式或数量限制。该错误不代表模型不支持，尚未发起生成。`);
    }
}

export function customProtocolTemplateVariables(template: string): Set<string> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(template);
    } catch {
        throw new Error("当前自定义请求模板不是有效 JSON，尚未发起生成。");
    }
    const variables = new Set<string>();
    const visit = (value: unknown) => {
        if (typeof value === "string") {
            // Only an entire template value represents a material mapping. URLs mentioned in prose do not.
            const match = value.match(/^\s*\{\{\s*(\w+)\s*\}\}\s*$/);
            if (match) variables.add(match[1]);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(parsed);
    return variables;
}
