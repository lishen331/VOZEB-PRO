import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { creativeUploadMaxBytes } from "@/lib/creative-upload";

import { resolveServerDataPath } from "@/lib/server/data-dir";

export type LoginPageMediaKind = "heroVideoUrl" | "heroPosterUrl" | "jointBrandUrl";

const RULES: Record<LoginPageMediaKind, { maxBytes: number; mimeTypes: Record<string, string> }> = {
    heroVideoUrl: { maxBytes: creativeUploadMaxBytes("video"), mimeTypes: { "video/mp4": ".mp4", "video/webm": ".webm" } },
    heroPosterUrl: { maxBytes: creativeUploadMaxBytes("image"), mimeTypes: { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" } },
    jointBrandUrl: { maxBytes: creativeUploadMaxBytes("image"), mimeTypes: { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" } },
};

export class LoginPageMediaError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

export async function writeLoginPageMedia(kind: string, file: File) {
    if (!(kind in RULES)) throw new LoginPageMediaError("登录页物料类型无效");
    const typedKind = kind as LoginPageMediaKind;
    const rule = RULES[typedKind];
    const declaredMimeType = file.type.toLowerCase();
    if (!rule.mimeTypes[declaredMimeType]) throw new LoginPageMediaError("登录页物料格式不支持");
    if (!file.size || file.size > rule.maxBytes) throw new LoginPageMediaError("登录页物料文件大小不符合要求", 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedMimeType = (await fileTypeFromBuffer(bytes))?.mime?.toLowerCase();
    const extension = detectedMimeType ? rule.mimeTypes[detectedMimeType] : undefined;
    if (!extension || detectedMimeType !== declaredMimeType) throw new LoginPageMediaError("登录页物料内容与文件格式不一致");
    const stem = typedKind === "heroVideoUrl" ? "hero" : typedKind === "heroPosterUrl" ? "hero-poster" : "joint-brand";
    const fileName = `${stem}${extension}`;
    const directory = resolveServerDataPath("login-page-media");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, fileName), bytes);
    const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    return { fileName, url: `/api/login-page-media/${fileName}?v=${version}` };
}

export function loginPageMediaFile(fileName: string) {
    const extension = extname(fileName).toLowerCase();
    const allowed = /^(?:hero|hero-poster|joint-brand)\.(?:mp4|webm|png|jpe?g|webp)$/.test(fileName);
    if (!allowed) return null;
    const mimeType = extension === ".mp4" ? "video/mp4" : extension === ".webm" ? "video/webm" : extension === ".png" ? "image/png" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/webp";
    return { filePath: resolve(resolveServerDataPath("login-page-media"), fileName), mimeType };
}
