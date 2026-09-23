import sharp from "sharp";
import type { DramaProject, DramaShot, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
import { creativeUploadMaxBytes, creativeUploadLimitMessage } from "@/lib/creative-upload";
import { DramaLabShotGenerationError, findShot, persistDramaLabShotUpdate, appendDramaLabGenerationHistory } from "@/lib/server/drama-lab-shot-generation-service";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";
export type OneClickShotUploadTarget = "image" | "video" | "first" | "key" | "last";
export const isOneClickShotUploadTarget = (value: string): value is OneClickShotUploadTarget => ["image", "video", "first", "key", "last"].includes(value);
const active = (status?: string) => ["running", "queued", "pending"].includes(status || "");
export async function uploadOneClickShotMedia(input: { userId: string; project: DramaProject; episodeId: string; shotId: string; target: OneClickShotUploadTarget; file: File }) {
    const { userId, project, episodeId, shotId, target, file } = input;
    if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new DramaLabShotGenerationError("一键成片项目不存在", 404);
    const { shot } = findShot(project, episodeId, shotId);
    const frame = target !== "image" && target !== "video" ? shot.frames?.[target] : undefined;
    if (frame?.locked) throw new DramaLabShotGenerationError("当前帧已锁定，请先解锁后再修改", 409);
    if (active(target === "video" ? shot.generationStatus : target === "image" ? shot.storyboardStatus : frame?.status)) throw new DramaLabShotGenerationError("当前任务正在执行，请等待完成或取消后再上传", 409);
    const kind = target === "video" ? "video" : "image";
    const mime = file.type.toLowerCase().trim().replace("image/jpg", "image/jpeg");
    if (!(kind === "video" ? ["video/mp4", "video/webm", "video/quicktime"] : ["image/png", "image/jpeg", "image/webp", "image/gif"]).includes(mime)) throw new DramaLabShotGenerationError("文件类型不符合当前上传入口", 400);
    const maxBytes = creativeUploadMaxBytes(kind);
    if (!file.size || file.size > maxBytes) throw new DramaLabShotGenerationError(`${creativeUploadLimitMessage(kind)}，且文件不能为空`, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    let width: number | undefined;
    let height: number | undefined;
    if (kind === "image") {
        try {
            const metadata = await sharp(bytes).metadata();
            width = metadata.width;
            height = metadata.height;
            if (!width || !height) throw new Error("empty image");
        } catch {
            throw new DramaLabShotGenerationError("图片无法解码，请上传有效图片", 400);
        }
    }
    const media = await writePersistentMediaDataUrl(`data:${mime};base64,${bytes.toString("base64")}`, kind, { ownerUserId: userId, projectId: project.id, source: "one-click-film-shot-upload", originalName: file.name, maxBytes });
    const url = media.url || `/api/reference-assets/${media.token}`;
    const uploadedId = `upload:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    function history(previous: DramaShotGenerationHistory[] | undefined, oldUrl: string | undefined, oldTaskId: string | undefined, prompt: string) {
        let entries = previous;
        if (oldUrl) entries = appendDramaLabGenerationHistory(entries, { id: oldTaskId || oldUrl, taskId: oldTaskId || oldUrl, url: oldUrl, prompt, createdAt: now });
        return appendDramaLabGenerationHistory(entries, { id: uploadedId, taskId: uploadedId, url, prompt, createdAt: now, width, height });
    }
    let patch: Partial<DramaShot>;
    if (target === "video")
        patch = {
            videoUrl: url,
            videoHistory: history(shot.videoHistory, shot.videoUrl, shot.generationTaskId, shot.videoPrompt || ""),
            generationStatus: "success",
            generationTaskId: undefined,
            generationAttempt: undefined,
            generationNeedsReview: undefined,
            generationError: undefined,
        };
    else if (target === "image")
        patch = {
            storyboardImageUrl: url,
            storyboardImageWidth: width,
            storyboardImageHeight: height,
            storyboardHistory: history(shot.storyboardHistory, shot.storyboardImageUrl, shot.storyboardTaskId, shot.imagePrompt || ""),
            storyboardStatus: "success",
            storyboardTaskId: undefined,
            storyboardError: undefined,
        };
    else
        patch = {
            frames: {
                ...shot.frames,
                [target]: {
                    ...(frame || { prompt: "" }),
                    url,
                    storageKey: media.token,
                    width,
                    height,
                    status: "success",
                    source: "uploaded",
                    history: history(frame?.history, frame?.url, frame?.taskId, frame?.prompt || ""),
                    taskId: undefined,
                    attempt: undefined,
                    error: undefined,
                    sourceVideoTaskId: undefined,
                    sourceShotId: undefined,
                    sourceVideoHistoryId: undefined,
                },
            },
        };
    const saved = await persistDramaLabShotUpdate({ userId, project, episodeId, shotId, patch, retryOnConflict: false });
    return { project: saved, shot: findShot(saved, episodeId, shotId).shot, asset: { url, storageKey: media.token, width, height } };
}
