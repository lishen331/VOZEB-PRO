import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { creativeUploadLimitMessage, creativeUploadMaxBytes } from "@/lib/creative-upload";
import { validateUploadBytes } from "@/lib/server/upload-media-validation";
import { writePersistentMediaDataUrl, writeReferenceMediaDataUrl } from "@/lib/server/reference-asset-store";
import { readJsonBodyResult } from "@/lib/auth/request";
import { createSignedReferenceAssetUrl } from "@/lib/server/reference-asset-access";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_MULTIPART_BYTES = 800 * 1024 * 1024 + 64 * 1024;

type UploadInput = { dataUrl: string; type: "image" | "video" | "audio"; persistent: boolean; originalName?: string };

export async function POST(request: Request) {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const input = await readUploadInput(request);
        const context = {
            ownerUserId: currentUser.id,
            source: "user-upload",
            originalName: input.originalName,
            maxBytes: creativeUploadMaxBytes(input.type),
        };
        const asset = input.persistent ? await writePersistentMediaDataUrl(input.dataUrl, input.type, context) : await writeReferenceMediaDataUrl(input.dataUrl, input.type, context);
        const origin = resolvePublicRequestOrigin(request);
        const browserUrl = `/api/reference-assets/${asset.token
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
        return NextResponse.json({
            url: browserUrl,
            upstreamUrl: asset.url || createSignedReferenceAssetUrl(asset.token, origin, currentUser.id) || undefined,
            token: asset.token,
            key: asset.token,
            storage: asset.storage,
            bytes: asset.bytes,
            mimeType: asset.mimeType,
        });
    } catch (error) {
        const status = error instanceof RequestBodyTooLargeError ? error.status : error instanceof UploadInputError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : "参考图临时保存失败" }, { status });
    }
}

async function readUploadInput(request: Request): Promise<UploadInput> {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
        let form: FormData;
        try {
            const bytes = await readRequestBodyBytes(request, MAX_MULTIPART_BYTES);
            form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) throw new RequestBodyTooLargeError("上传文件超过 800MB");
            throw new UploadInputError("上传内容格式不正确");
        }
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) throw new UploadInputError("缺少参考素材");
        const fileType = mediaType(form.get("type"));
        if (file.size > creativeUploadMaxBytes(fileType)) throw new RequestBodyTooLargeError(creativeUploadLimitMessage(fileType));
        const type = mediaType(form.get("type"));
        const bytes = Buffer.from(await file.arrayBuffer());
        // A2: 字节嗅探为准，不再回退信任声明的 file.type。用嗅探得到的规范
        // mime 重建 dataUrl，使落盘扩展名与出站 Content-Type 与真实字节一致。
        const { mimeType } = await validateUploadBytesOrReject(bytes, type);
        const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
        return { dataUrl, type, persistent: String(form.get("persistent") || "") === "true", originalName: file.name || undefined };
    }

    const result = await readJsonBodyResult<{ dataUrl?: unknown; type?: unknown; persistent?: unknown; originalName?: unknown }>(request, 28 * 1024 * 1024);
    if (!result.ok) throw result.status === 413 ? new RequestBodyTooLargeError(result.message) : new UploadInputError(result.message, result.status);
    const rawDataUrl = typeof result.data.dataUrl === "string" ? result.data.dataUrl : "";
    if (!rawDataUrl) throw new UploadInputError("缺少参考素材");
    const type = mediaType(result.data.type);
    // A2: dataUrl 分支同样以字节嗅探为准，而非仅信任 data: 头里的声明类型。
    const separator = rawDataUrl.indexOf(",");
    const encoded = separator >= 0 ? rawDataUrl.slice(separator + 1).replace(/\s/g, "") : "";
    const bytes = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
    const { mimeType } = await validateUploadBytesOrReject(bytes, type);
    return {
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
        type,
        persistent: result.data.persistent === true,
        originalName: typeof result.data.originalName === "string" ? result.data.originalName : undefined,
    };
}

async function validateUploadBytesOrReject(bytes: Buffer, type: UploadInput["type"]) {
    try {
        return await validateUploadBytes(bytes, type);
    } catch {
        throw new UploadInputError("参考素材格式不正确");
    }
}

function mediaType(value: FormDataEntryValue | unknown): UploadInput["type"] {
    return value === "video" || value === "audio" ? value : "image";
}

class UploadInputError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}
