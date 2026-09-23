export type BindingVerificationInput = { prompt: string; references: Array<{ type: "image" | "video"; url: string }> };
export function parseBindingVerificationInput(value: unknown, capability: "text" | "image" | "video"): BindingVerificationInput {
    if (!value || typeof value !== "object") throw new Error("缺少生成输入");
    const input = value as Partial<BindingVerificationInput>;
    if (typeof input.prompt !== "string" || !input.prompt.trim() || !Array.isArray(input.references)) throw new Error("请输入提示词并确认参考素材");
    const references = input.references.map((item) => {
        if (!item || !["image", "video"].includes(item.type) || typeof item.url !== "string") throw new Error("参考素材格式无效");
        if (item.type === "video" && capability !== "video") throw new Error("当前能力不接受参考视频");
        const url = new URL(item.url);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("参考素材必须使用不含凭据的 HTTP 地址");
        return { type: item.type, url: url.href };
    });
    if (new Set(references.map((item) => item.url)).size !== references.length) throw new Error("请勿重复添加同一参考素材");
    return { prompt: input.prompt.trim(), references };
}
