import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { CREATIVE_UPLOAD_LIMITS } from "@/lib/creative-upload";
import type { VideoGenerationReference } from "@/lib/video-reference-contract";
import { runFfmpeg, runFfprobe } from "./ffmpeg";
import { fetchInternalApi } from "./internal-origin";
import { fetchSafeOutbound } from "./safe-outbound-fetch";
import { createSignedReferenceAssetUrl } from "./reference-asset-access";
import { writeReferenceMediaFile } from "./reference-asset-store";

const MAX_BYTES = 200_000_000;
const INPUT_OPTIONS = ["-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm,avi,mpeg,mpegts,flv,ogg"];
type Channel = { channelId?: string; model: string; advancedConfig?: { protocol?: string } };
type VideoMetadata = { container: string; brand: string; bytes: number; duration: number; width: number; height: number; fps: number };
type Context = { userId: string; internalOrigin: string; publicOrigin: string; signal: AbortSignal };

export function tokenHubReferenceApplies(channel: Channel) {
    return channel.channelId === "wD0cO6S6cyhbyvYIRDE28" && channel.advancedConfig?.protocol === "seedance" && /^cdance2\.0(?:-(?:mini|fast))?-0807$/i.test(channel.model);
}

// Same validity window as the managed reference URLs. No source URL is returned in the proof.
const CONFIRMATION_TTL_MS = 15 * 60_000;
const localSecret = randomBytes(32);

export function createVideoReferenceConversionProof(scope: string, now = Date.now()) {
    const expires = now + CONFIRMATION_TTL_MS;
    return `${expires}.${conversionSignature(scope, expires)}`;
}

export function verifyVideoReferenceConversionProof(scope: string, proof: unknown, now = Date.now()) {
    if (typeof proof !== "string" || !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(proof)) return false;
    const [time, signature] = proof.split(".");
    const expires = Number(time);
    return expires > now && expires <= now + CONFIRMATION_TTL_MS && timingSafeEqual(Buffer.from(signature), Buffer.from(conversionSignature(scope, expires)));
}

function conversionSignature(scope: string, expires: number) {
    return createHmac("sha256", process.env.VOZEB_PRO_ENCRYPTION_KEY?.trim() || localSecret)
        .update(JSON.stringify(["tokenhub-video-reference-conversion-v1", expires, scope]))
        .digest("base64url");
}

export function inspectTokenHubReference({ container, brand, bytes, duration, width, height, fps }: VideoMetadata) {
    const issues: string[] = [];
    let convertible = true;
    if (!container.split(",").includes("mp4") || /^(?:3g[2p]|m4a)/i.test(brand)) issues.push("格式需为 MP4 或 MOV，将转换为 MP4");
    if (bytes > MAX_BYTES) issues.push(`大小 ${(bytes / 1_000_000).toFixed(2)} MB，要求不超过 200 MB`);
    if (!Number.isFinite(duration) || duration < 2 || duration > 30) {
        issues.push(`时长 ${Number.isFinite(duration) ? `${duration.toFixed(2)} 秒` : "无法识别"}，要求 2–30 秒，请剪辑或更换素材`);
        convertible = false;
    }
    if (!(width > 0 && height > 0)) {
        issues.push("无法识别视频画面尺寸，请更换素材");
        convertible = false;
    } else {
        issues.push(...sizeIssues(width, height));
    }
    if (!(fps > 0) || !Number.isFinite(fps)) {
        issues.push("无法识别平均帧率，请更换素材");
        convertible = false;
    } else if (fps < 24 || fps > 60) issues.push(`平均帧率 ${Number(fps.toFixed(2))} FPS，要求 24–60 FPS`);
    return { issues, convertible };
}

function sizeIssues(width: number, height: number) {
    const issues: string[] = [];
    if (width < 300 || width > 6000 || height < 300 || height > 6000) issues.push(`尺寸 ${width}×${height}，要求每边 300–6000 px`);
    if (width / height < 0.4 || width / height > 2.5) issues.push(`宽高比 ${(width / height).toFixed(3)}，要求 0.4–2.5`);
    if (width * height < 407696 || width * height > 8295044) issues.push(`总像素 ${width * height}，要求 407,696–8,295,044`);
    return issues;
}

export async function prepareTokenHubVideoReferences(channel: Channel, references: VideoGenerationReference[], confirmed: boolean, context: Context) {
    if (!tokenHubReferenceApplies(channel) || !references.some((ref) => ref.type === "video")) return { references };
    const directory = await mkdtemp(join(tmpdir(), "vozeb-tokenhub-reference-"));
    try {
        const inspected: Array<{ position: number; label: string; path: string; metadata: VideoMetadata; issues: string[]; convertible: boolean }> = [];
        for (const [position, ref] of references.entries()) {
            if (ref.type !== "video") continue;
            const label = `参考视频 ${inspected.length + 1}`;
            const path = join(directory, `source-${position}`);
            try {
                await downloadVideo(ref.url, path, context);
                const metadata = await probeVideo(path, context);
                inspected.push({ position, label, path, metadata, ...inspectTokenHubReference(metadata) });
            } catch {
                return { error: `${label}无法读取或识别，请重新上传 MP4/MOV 素材。` };
            }
        }
        const invalid = inspected.filter((video) => video.issues.length);
        const issues = invalid.map(({ label, issues }) => `${label}：${issues.join("；")}`);
        if (invalid.some((video) => !video.convertible)) return { error: issues.join("\n") };
        if (!invalid.length) return { references };
        if (!confirmed) return { issues };
        const output = [...references];
        for (const video of invalid) {
            try {
                const path = join(directory, `converted-${video.position}.mp4`);
                const { width, height } = video.metadata;
                const square = width === height;
                const keepSize = !sizeIssues(width, height).length && width % 2 === 0 && height % 2 === 0;
                const [w, h] = keepSize ? [width, height] : square ? [720, 720] : width > height ? [1280, 720] : [720, 1280];
                const fit = `scale=w='max(2,trunc(min(${w},${h}*dar)/2)*2)':h='max(2,trunc(min(${h},${w}/dar)/2)*2)',setsar=1,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=30`;
                await runFfmpeg(
                    [
                        "-nostdin",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        ...INPUT_OPTIONS,
                        "-i",
                        video.path,
                        "-map",
                        "0:V:0",
                        "-map",
                        "0:a:0?",
                        "-vf",
                        fit,
                        "-c:v",
                        "libx264",
                        "-preset",
                        "fast",
                        "-crf",
                        "23",
                        "-pix_fmt",
                        "yuv420p",
                        "-c:a",
                        "aac",
                        "-movflags",
                        "+faststart",
                        path,
                    ],
                    { signal: context.signal },
                );
                const result = inspectTokenHubReference(await probeVideo(path, context));
                if (result.issues.length) return { error: `${video.label}转换后仍不符合要求：${result.issues.join("；")}` };
                const asset = await writeReferenceMediaFile(path, "video", "video/mp4", false, { ownerUserId: context.userId, source: "tokenhub-reference-video-normalization", originalName: "video-reference.mp4", maxBytes: MAX_BYTES });
                const url = createSignedReferenceAssetUrl(asset.token, context.publicOrigin, context.userId);
                if (!url) return { error: "无法签发转换后的视频地址，请联系管理员。" };
                output[video.position] = { ...output[video.position], url };
            } catch {
                return { error: `${video.label}转换失败，请更换素材。` };
            }
        }
        return { references: output };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

async function downloadVideo(value: string, path: string, { publicOrigin, internalOrigin, signal }: Context) {
    const url = new URL(value, publicOrigin);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Invalid protocol");
    const managed = url.origin === new URL(publicOrigin).origin && /^\/api\/(?:reference-assets|generation-log-assets)\//.test(url.pathname);
    let response = managed ? await fetchInternalApi(new URL(`${url.pathname}${url.search}`, internalOrigin), { cache: "no-store", redirect: "manual", signal }) : await fetchSafeOutbound(url.toString(), { cache: "no-store", signal });
    const location = response.headers.get("location");
    if (managed && response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        response = await fetchSafeOutbound(new URL(location, url).toString(), { cache: "no-store", signal });
    }
    const limit = CREATIVE_UPLOAD_LIMITS.video;
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw new Error("Unreadable or oversized video source");
    }
    const reader = response.body.getReader();
    async function* bounded() {
        let bytes = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > limit) throw new Error("Oversized video source");
                yield value;
            }
        } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
    }
    await pipeline(bounded(), createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal });
}

async function probeVideo(path: string, context: Context): Promise<VideoMetadata> {
    const { stdout } = await runFfprobe(
        ["-v", "error", ...INPUT_OPTIONS, "-select_streams", "V:0", "-show_entries", "stream=width,height,avg_frame_rate,duration:format=format_name,duration:format_tags=major_brand:stream_side_data=rotation", "-of", "json", path],
        { signal: context.signal },
    );
    const data = JSON.parse(stdout) as {
        streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; duration?: string; side_data_list?: Array<{ rotation?: number }> }>;
        format?: { format_name?: string; duration?: string; tags?: { major_brand?: string } };
    };
    const stream = data.streams?.[0];
    const [n, d] = (stream?.avg_frame_rate || "0/1").split("/").map(Number);
    const rotation = stream?.side_data_list?.find((item) => Number.isFinite(item.rotation))?.rotation || 0;
    const swapped = Math.abs(rotation) % 180 === 90;
    return {
        container: data.format?.format_name || "",
        brand: (data.format?.tags?.major_brand || "").trim(),
        bytes: (await stat(path)).size,
        duration: Number(data.format?.duration || stream?.duration),
        width: (swapped ? stream?.height : stream?.width) || 0,
        height: (swapped ? stream?.width : stream?.height) || 0,
        fps: n / d,
    };
}
