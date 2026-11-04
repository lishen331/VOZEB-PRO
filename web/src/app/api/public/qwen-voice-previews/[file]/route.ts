import { isQwenBasicPreviewFile } from "@/lib/qwen-voice-catalog";
import { objectStorageErrorMessage, signObjectRead } from "@/lib/server/object-storage-client";
import { getObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 3600;

type Context = { params: Promise<{ file: string }> };

// Must match scripts/backfill-qwen-voice-previews-to-oss.mjs.
function qwenVoicePreviewObjectKey(prefix: string, file: string) {
    return `${prefix ? `${prefix}/` : ""}qwen-voice-previews/${file}`;
}

export async function GET(_request: Request, context: Context) {
    const file = (await context.params).file;
    if (!isQwenBasicPreviewFile(file)) return notFound();
    const config = await getObjectStorageRuntimeConfig();
    if (!config.enabled) return notFound();
    try {
        const url = await signObjectRead(config, { key: qwenVoicePreviewObjectKey(config.prefix, file), expiresIn: SIGNED_URL_SECONDS });
        // Cache the redirect for less time than the signature lives so a cached Location never expires mid-use.
        return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "public, max-age=1800", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
    } catch (error) {
        console.warn("Qwen voice preview sign failed", file, objectStorageErrorMessage(error));
        return Response.json({ code: 502, data: null, msg: "试听暂不可用" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
}

function notFound() {
    return Response.json({ code: 404, data: null, msg: "试听不存在" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
