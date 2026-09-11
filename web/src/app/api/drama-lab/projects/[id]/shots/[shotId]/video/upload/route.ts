import { NextResponse } from "next/server";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getCurrentUser } from "@/lib/auth/session";
import { creativeUploadLimitMessage, creativeUploadMaxBytes } from "@/lib/creative-upload";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

const MAX_VIDEO_BYTES = creativeUploadMaxBytes("video");
const MAX_UPLOAD_REQUEST_BYTES = MAX_VIDEO_BYTES + 64 * 1024;
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persist a user-supplied finished video as the current result for one storyboard shot. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabShotGenerationError("当前剧集不能为空");

        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "storyboard_video", { episodeId, resourceType: "shot", resourceId: shotId });
        if (!project) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        const shot = findShot(project, episodeId, shotId);
        if (!shot) throw new DramaLabShotGenerationError("当前分镜不存在", 404);
        if (shot.generationStatus === "queued" || shot.generationStatus === "pending" || shot.generationStatus === "running") {
            throw new DramaLabShotGenerationError("当前分镜视频任务正在执行，请先等待完成或取消任务后再上传替换", 409);
        }

        const form = await readForm(request);
        const file = form.get("file");
        if (!(file instanceof File)) throw new DramaLabShotGenerationError("请上传分镜视频", 400);
        const mimeType = normalizeVideoMimeType(file.type);
        if (!mimeType) throw new DramaLabShotGenerationError("只支持 MP4、WEBM 或 MOV 视频", 400);
        if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) throw new DramaLabShotGenerationError(`${creativeUploadLimitMessage("video")}或文件为空`, 400);

        const bytes = Buffer.from(await file.arrayBuffer());
        const asset = await writePersistentMediaDataUrl(`data:${mimeType};base64,${bytes.toString("base64")}`, "video", {
            ownerUserId,
            source: "drama-lab-video-upload",
            originalName: file.name,
            projectId: project.id,
            maxBytes: MAX_VIDEO_BYTES,
        });
        const url = asset.url || `/api/reference-assets/${asset.token}`;
        const previousUrl = shot.videoUrl?.trim();
        const videoHistory = previousUrl
            ? appendHistory(shot.videoHistory, {
                  id: `video:${shot.generationTaskId || previousUrl}`,
                  taskId: shot.generationTaskId || `video:${previousUrl}`,
                  url: previousUrl,
                  prompt: shot.videoPrompt || "",
                  createdAt: new Date().toISOString(),
              })
            : shot.videoHistory;
        const saved = await persistDramaLabShotUpdate({
            userId: user.id,
            projectOwnerUserId: ownerUserId,
            project,
            episodeId,
            shotId,
            patch: {
                videoUrl: url,
                videoHistory,
                generationStatus: "success",
                generationTaskId: undefined,
                generationAttempt: undefined,
                generationNeedsReview: undefined,
                generationError: undefined,
            },
            retryOnConflict: false,
        });
        const savedShot = findShot(saved, episodeId, shotId);
        return NextResponse.json({
            code: 0,
            data: { shot: savedShot || { ...shot, videoUrl: url, videoHistory, generationStatus: "success" }, asset: { url, storageKey: asset.token, mimeType: asset.mimeType, bytes: asset.bytes } },
            msg: "分镜视频已上传",
        });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜视频上传失败" }, { status });
    }
}

async function readForm(request: Request) {
    const contentType = request.headers.get("content-type") || "";
    try {
        const bytes = await readRequestBodyBytes(request, MAX_UPLOAD_REQUEST_BYTES);
        return await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) throw new DramaLabShotGenerationError("分镜视频请求超过大小限制", error.status);
        throw error;
    }
}

function findShot(project: DramaProject, episodeId: string, shotId: string): DramaShot | undefined {
    return project.episodes?.find((episode) => episode.id === episodeId)?.shots?.find((shot) => shot.id === shotId);
}

function normalizeVideoMimeType(value: string) {
    const mime = value.toLowerCase().trim();
    return VIDEO_MIME_TYPES.has(mime) ? mime : "";
}

function appendHistory(history: Array<{ id: string; taskId: string; url: string; prompt: string; createdAt: string; width?: number; height?: number }> | undefined, entry: { id: string; taskId: string; url: string; prompt: string; createdAt: string }) {
    return [...(history || []).filter((item) => item.taskId !== entry.taskId), entry].slice(-20);
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
