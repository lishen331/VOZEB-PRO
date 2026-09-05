import { NextResponse } from "next/server";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabShotGenerationError, persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";

const FRAME_TYPES = new Set(["first", "key", "last"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
type FrameType = "first" | "key" | "last";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId } = await params;
        const search = new URL(request.url).searchParams;
        const episodeId = search.get("episodeId")?.trim() || "";
        const frameType = search.get("frameType")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });
        if (!FRAME_TYPES.has(frameType)) return NextResponse.json({ code: 400, data: null, msg: "帧类型无效" }, { status: 400 });
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        await assertDramaLabStageAllowed(user.id, id, "storyboard_image", { episodeId, resourceType: "shot", resourceId: shotId });
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        const shot = findShot(project, episodeId, shotId);
        if (shot) assertFrameMutable(shot, frameType as FrameType);
        if (!shot) return NextResponse.json({ code: 404, data: null, msg: "当前分镜不存在" }, { status: 404 });

        const contentType = request.headers.get("content-type") || "";
        let form: FormData | null = null;
        try {
            const bytes = await readRequestBodyBytes(request, MAX_UPLOAD_REQUEST_BYTES);
            form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ code: error.status, data: null, msg: "帧图片请求超过大小限制" }, { status: error.status });
        }
        const file = form?.get("file");
        if (!(file instanceof File)) return NextResponse.json({ code: 400, data: null, msg: "请上传帧图片" }, { status: 400 });
        const mimeType = normalizeImageMimeType(file.type);
        if (!mimeType) return NextResponse.json({ code: 400, data: null, msg: "只支持 PNG、JPEG、WEBP 或 GIF 图片" }, { status: 400 });
        if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ code: 400, data: null, msg: "帧图片为空或超过 20MB 限制" }, { status: 400 });

        const bytes = Buffer.from(await file.arrayBuffer());
        const asset = await writePersistentMediaDataUrl(`data:${mimeType};base64,${bytes.toString("base64")}`, "image", {
            // Frame media follows the project's stable storage owner so
            // collaborator uploads are included by project export and later
            // reference authorization checks.
            ownerUserId,
            source: "drama-lab-frame-upload",
            originalName: file.name,
            projectId: project.id,
            maxBytes: MAX_IMAGE_BYTES,
        });
        const url = asset.url || `/api/reference-assets/${asset.token}`;
        const current = shot.frames?.[frameType as FrameType];
        const history = current?.url
            ? appendHistory(current.history, {
                  id: `frame:${frameType}:${current.taskId || current.url}`,
                  taskId: current.taskId || `frame:${frameType}:${current.url}`,
                  url: current.url,
                  prompt: current.prompt || "",
                  createdAt: new Date().toISOString(),
                  width: current.width,
                  height: current.height,
              })
            : current?.history;
        const prompt = text(form?.get("prompt") || null) || current?.prompt || "";
        const description = text(form?.get("description") || null) || current?.description || "用户上传的帧图片";
        const frame = {
            ...(current || { prompt: "" }),
            prompt,
            description,
            status: "success" as const,
            taskId: undefined,
            attempt: undefined,
            url,
            storageKey: asset.token,
            width: undefined,
            height: undefined,
            error: undefined,
            history,
            source: "uploaded" as const,
            sourceVideoTaskId: undefined,
            sourceShotId: undefined,
            sourceVideoHistoryId: undefined,
            locked: false,
        };
        const saved = await persistDramaLabShotUpdate({ userId: user.id, projectOwnerUserId: ownerUserId, project, episodeId, shotId, patch: { frames: { ...shot.frames, [frameType]: frame } }, retryOnConflict: false });
        const savedShot = findShot(saved, episodeId, shotId);
        return NextResponse.json({ code: 0, data: { frame: savedShot?.frames?.[frameType as FrameType] || frame, asset: { url, storageKey: asset.token, mimeType: asset.mimeType, bytes: asset.bytes } }, msg: "帧图片已上传" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "帧图片上传失败" }, { status });
    }
}

function assertFrameMutable(shot: DramaShot, frameType: FrameType) {
    if (!shot.frames?.[frameType]?.locked) return;
    const label = frameType === "first" ? "首帧" : frameType === "key" ? "关键帧" : "尾帧";
    throw new DramaLabShotGenerationError(`当前${label}已锁定，请先解锁后再修改`, 409);
}

function findShot(project: DramaProject, episodeId: string, shotId: string): DramaShot | undefined {
    return project.episodes?.find((episode) => episode.id === episodeId)?.shots?.find((shot) => shot.id === shotId);
}

function normalizeImageMimeType(value: string) {
    const mime = value.toLowerCase();
    return mime === "image/jpg" ? "image/jpeg" : ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) ? mime : "";
}

function appendHistory(
    history: Array<{ id: string; taskId: string; url: string; prompt: string; createdAt: string; width?: number; height?: number }> | undefined,
    entry: { id: string; taskId: string; url: string; prompt: string; createdAt: string; width?: number; height?: number },
) {
    return [...(history || []).filter((item) => item.taskId !== entry.taskId), entry].slice(-20);
}

function text(value: FormDataEntryValue | null) {
    return typeof value === "string" ? value.trim().slice(0, 8000) : "";
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
