import { NextResponse } from "next/server";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { persistDramaLabShotUpdate } from "@/lib/server/drama-lab-shot-generation-service";

const FRAME_TYPES = new Set(["first", "key", "last"]);
type FrameType = "first" | "key" | "last";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string; frameType: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId, frameType } = await params;
        if (!FRAME_TYPES.has(frameType)) return NextResponse.json({ code: 400, data: null, msg: "帧类型无效" }, { status: 400 });
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });
        const project = await getDramaProject(id, user.id);
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });
        const shot = findShot(project, episodeId, shotId);
        const current = shot?.frames?.[frameType as FrameType];
        if (!shot || !current) return NextResponse.json({ code: 404, data: null, msg: "当前帧不存在" }, { status: 404 });
        const body = await request.json().catch(() => null);
        if (!body || typeof body.locked !== "boolean") return NextResponse.json({ code: 400, data: null, msg: "locked 必须是布尔值" }, { status: 400 });
        if (body.locked) assertFrameLockable(current, frameType as FrameType);
        const frame = { ...current, locked: body.locked };
        const saved = await persistDramaLabShotUpdate({ userId: user.id, project, episodeId, shotId, patch: { frames: { ...shot.frames, [frameType]: frame } }, retryOnConflict: false });
        const savedFrame = findShot(saved, episodeId, shotId)?.frames?.[frameType as FrameType] || frame;
        return NextResponse.json({ code: 0, data: { frame: savedFrame }, msg: body.locked ? "帧已锁定" : "帧已解锁" });
    } catch (error) {
        const status = errorStatus(error);
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "帧锁定状态保存失败" }, { status });
    }
}

function assertFrameLockable(frame: NonNullable<DramaShot["frames"]>[FrameType], frameType: FrameType) {
    const label = frameType === "first" ? "首帧" : frameType === "key" ? "关键帧" : "尾帧";
    // Locking is a user decision about a concrete generated/uploaded image.
    // Do not allow a pending/failed slot (or a transient browser URL) to be
    // marked immutable, otherwise the slot can become permanently unusable.
    if (!frame || frame.status !== "success" || !stableUrl(frame.url)) throw Object.assign(new Error(`当前${label}尚未生成可锁定的图片`), { status: 409 });
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim() : "";
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

function findShot(project: DramaProject, episodeId: string, shotId: string): DramaShot | undefined {
    return project.episodes?.find((episode) => episode.id === episodeId)?.shots?.find((shot) => shot.id === shotId);
}

function errorStatus(error: unknown) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
