export type UploadedBindingReference = { type: "image" | "video"; url: string; previewUrl: string };
export async function uploadBindingVerificationReference(file: File, type: UploadedBindingReference["type"]): Promise<UploadedBindingReference> {
    const form = new FormData();
    form.append("type", type);
    form.append("persistent", "true");
    form.append("file", file, file.name);
    const response = await fetch("/api/reference-assets", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string; upstreamUrl?: string; storage?: string };
    if (!response.ok) throw new Error(payload.error || "素材上传失败");
    if (payload.storage !== "object" || !payload.upstreamUrl?.startsWith("https://")) throw new Error("素材未保存到 OSS 或缺少公网 HTTPS 直链");
    return { type, url: payload.upstreamUrl, previewUrl: payload.url || payload.upstreamUrl };
}
