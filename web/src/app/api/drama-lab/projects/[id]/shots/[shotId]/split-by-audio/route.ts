import { isDramaLabCollaborationError } from "@/lib/server/drama-lab-collaboration-error";
import { NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { assertDramaLabStageAllowed, resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { DramaLabAudioSplitError, applyDramaAudioSplitDetailed, findDramaAudioSplitShot, normalizeDramaAudioSplitOptions, planDramaAudioSplit } from "@/lib/server/drama-lab-audio-split-service";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SplitBody = {
    action?: unknown;
    apply?: unknown;
    plan?: unknown;
    expectedUpdatedAt?: unknown;
    options?: unknown;
    totalDurationMs?: unknown;
    dialogueDurationMs?: unknown;
    narrationDurationMs?: unknown;
    cues?: unknown;
    minSegmentDurationMs?: unknown;
    maxSegmentDurationMs?: unknown;
};

/**
 * Preview or apply an append-only split for one short-drama shot.
 *
 * POST .../shots/:shotId/split-by-audio?episodeId=:episodeId
 * { action: "preview", options?: { ... } }
 * { action: "apply", plan: <preview.plan>, expectedUpdatedAt?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    const parsed = await readJsonBodyResult<SplitBody>(request, 512 * 1024);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new DramaLabAudioSplitError("当前剧集不能为空", 400);
        const { project, ownerUserId } = await resolveDramaLabProjectForRequest(user.id, id);
        if (!project) throw new DramaLabAudioSplitError("短剧项目不存在", 404);
        const { shot } = findDramaAudioSplitShot(project, episodeId, shotId);
        const body = parsed.data || {};
        const options = normalizeDramaAudioSplitOptions({
            ...(isRecord(body.options) ? body.options : {}),
            totalDurationMs: body.totalDurationMs ?? (isRecord(body.options) ? body.options.totalDurationMs : undefined),
            dialogueDurationMs: body.dialogueDurationMs ?? (isRecord(body.options) ? body.options.dialogueDurationMs : undefined),
            narrationDurationMs: body.narrationDurationMs ?? (isRecord(body.options) ? body.options.narrationDurationMs : undefined),
            cues: body.cues ?? (isRecord(body.options) ? body.options.cues : undefined),
            minSegmentDurationMs: body.minSegmentDurationMs ?? (isRecord(body.options) ? body.options.minSegmentDurationMs : undefined),
            maxSegmentDurationMs: body.maxSegmentDurationMs ?? (isRecord(body.options) ? body.options.maxSegmentDurationMs : undefined),
        });
        const shouldApply = body.action === "apply" || body.apply === true;
        if (!shouldApply) {
            const plan = planDramaAudioSplit(shot, options);
            return NextResponse.json({ code: 0, data: { plan, sourceUpdatedAt: project.updatedAt }, msg: "拆镜预览已生成" });
        }

        await assertDramaLabStageAllowed(user.id, id, "storyboard", { episodeId, resourceType: "shot", resourceId: shotId });
        const plan = body.plan || planDramaAudioSplit(shot, options);
        const result = await applyDramaAudioSplitDetailed({
            userId: user.id,
            projectOwnerUserId: ownerUserId,
            project,
            episodeId,
            shotId,
            plan: plan as Parameters<typeof applyDramaAudioSplitDetailed>[0]["plan"],
            expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : project.updatedAt,
        });
        return NextResponse.json({
            code: 0,
            data: {
                project: result.project,
                sourceShotId: result.sourceShotId,
                createdShots: result.createdShots,
                skippedSegmentIndexes: result.skippedSegmentIndexes,
                preservedShotIds: result.preservedShotIds,
            },
            msg: result.createdShots.length ? `已追加 ${result.createdShots.length} 条音频拆镜候选` : "音频拆镜候选已存在，未重复创建",
        });
    } catch (error) {
        const status = error instanceof DramaLabAudioSplitError || error instanceof DramaProjectStoreError || error isDramaLabCollaborationError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "按音频拆镜失败" }, { status });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
