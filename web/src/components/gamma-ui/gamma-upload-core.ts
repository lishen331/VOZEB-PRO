/*
 * 上传校验（纯函数）：格式、单个大小、数量上限，返回可直接展示的中文原因。
 */

export interface UploadLimits {
    /** 例如 ["image/*", ".pdf", ".pptx"] */
    accept?: readonly string[];
    /** 单个文件上限（字节） */
    maxSize?: number;
    maxFiles?: number;
}

export interface FileLike {
    name: string;
    size: number;
    type: string;
}

export function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function acceptsFile(file: FileLike, accept: readonly string[] | undefined) {
    if (!accept || accept.length === 0) return true;
    const name = file.name.toLowerCase();
    return accept.some((rule) => {
        const value = rule.trim().toLowerCase();
        if (value.startsWith(".")) return name.endsWith(value);
        if (value.endsWith("/*")) return file.type.toLowerCase().startsWith(value.slice(0, -1));
        return file.type.toLowerCase() === value;
    });
}

/** 把 accept 规则翻成人话：「图片 / PDF / PPTX」 */
export function describeAccept(accept: readonly string[] | undefined) {
    if (!accept?.length) return "任意格式";
    const names: Record<string, string> = { "image/*": "图片", "video/*": "视频", "audio/*": "音频" };
    return accept.map((rule) => names[rule] ?? rule.replace(/^\./, "").toUpperCase()).join(" / ");
}

export interface UploadCheck<F extends FileLike> {
    accepted: F[];
    rejected: { file: F; reason: string }[];
}

export function checkFiles<F extends FileLike>(files: readonly F[], limits: UploadLimits, existing = 0): UploadCheck<F> {
    const accepted: F[] = [];
    const rejected: { file: F; reason: string }[] = [];
    for (const file of files) {
        if (!acceptsFile(file, limits.accept)) rejected.push({ file, reason: `格式不支持，仅支持 ${describeAccept(limits.accept)}` });
        else if (limits.maxSize !== undefined && file.size > limits.maxSize) rejected.push({ file, reason: `超过 ${formatBytes(limits.maxSize)}（当前 ${formatBytes(file.size)}）` });
        else if (limits.maxFiles !== undefined && existing + accepted.length >= limits.maxFiles) rejected.push({ file, reason: `最多上传 ${limits.maxFiles} 个` });
        else accepted.push(file);
    }
    return { accepted, rejected };
}
