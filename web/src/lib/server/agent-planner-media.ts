import { signReferenceAssetInputUrl, signGenerationAssetInputUrl } from "./reference-asset-access";
import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { creativeUploadLimitMessage, creativeUploadMaxBytes } from "@/lib/creative-upload";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import { maintenanceWorkerContextHeaders } from "@/lib/server/maintenance-auth";
import { limitMediaResponseBody } from "@/lib/server/media-response-limit";
import { SYSTEM_PROXY_JSON_BODY_MAX_BYTES } from "@/lib/server/system-proxy-request-limits";
import { TEXT_MODEL_REQUEST_TIMEOUT_MS } from "@/lib/server/model-request-policy";
import type { TextPlanningMediaInput } from "./text-planning-runtime";

/** Assets have already been resolved under the run user's ownership boundary. */
export async function prepareAgentPlannerMedia(
    assets: Array<Pick<CreativeAsset, "id" | "type"> & Partial<Pick<CreativeAsset, "serverUrl" | "remoteUrl" | "userId">>>,
    origin: string,
    cookie: string,
    signal: AbortSignal,
): Promise<TextPlanningMediaInput[]> {
    const media: TextPlanningMediaInput[] = [];
    let total = 0;
    for (const asset of assets) {
        if (asset.type !== "image" && asset.type !== "video") continue;
        const source = asset.serverUrl || asset.remoteUrl || "";
        if (!source || source.startsWith("//") || source.includes("\\")) throw new Error(`无法读取引用素材 ${asset.id}：媒体地址无效`);
        const timeout = AbortSignal.any([signal, AbortSignal.timeout(TEXT_MODEL_REQUEST_TIMEOUT_MS)]);
        const privateSource = source.startsWith("/api/reference-assets/") || source.startsWith("/api/generation-log-assets/");
        const signedSource = privateSource && asset.userId ? signGenerationAssetInputUrl(signReferenceAssetInputUrl(source, origin, asset.userId), origin, asset.userId) : source;
        if (source.startsWith("/") && !privateSource) throw new Error("引用素材路径不是授权媒体接口");
        let response = privateSource
            ? await fetchInternalApi(new URL(signedSource, origin), { headers: { cookie, ...(maintenanceWorkerContextHeaders(cookie) || {}) }, redirect: "manual", signal: timeout })
            : await fetchSafeOutbound(source, { signal: timeout });
        // Private media routes redirect to a signed object-storage URL. Never
        // forward browser cookies or worker credentials to that destination.
        if (privateSource && [301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location) throw new Error("引用素材重定向缺少地址");
            const target = new URL(location, new URL(source, origin));
            response = await fetchSafeOutbound(target.toString(), { signal: timeout });
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`读取引用素材失败（HTTP ${response.status}）`);
        }
        const mime = response.headers.get("content-type")?.split(";", 1)[0] || "";
        if (!mime.startsWith(`${asset.type}/`)) {
            await response.body?.cancel();
            throw new Error("引用素材未返回匹配的媒体内容，不能按已读取继续执行");
        }
        const maxBytes = creativeUploadMaxBytes(asset.type);
        if (Number(response.headers.get("content-length")) > maxBytes) {
            await response.body?.cancel();
            throw new Error(creativeUploadLimitMessage(asset.type));
        }
        const bytes = Buffer.from(await new Response(limitMediaResponseBody(response.body, maxBytes)).arrayBuffer());
        if (!bytes.length) throw new Error("引用媒体为空");
        const url = `data:${mime};base64,${bytes.toString("base64")}`;
        total += Buffer.byteLength(url);
        if (total >= SYSTEM_PROXY_JSON_BODY_MAX_BYTES) throw new Error("引用媒体总量超过系统模型请求限制，请减少素材后重试");
        media.push({ type: asset.type, url });
    }
    return media;
}
