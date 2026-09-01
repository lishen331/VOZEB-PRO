import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabStoryboardExtractionError, extractDramaLabStoryboards } from "@/lib/server/drama-lab-storyboard-extraction-service";
import { DramaProjectStoreError, getDramaProject, updateDramaProject } from "@/lib/server/drama-project-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 128 * 1024);
        const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
        const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim().slice(0, 160) : randomUUID();
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });

        const project = await getDramaProject(id, user.id);
        if (!project) return NextResponse.json({ code: 404, data: null, msg: "短剧项目不存在" }, { status: 404 });

        // Checkpoints persist the domain project payload; the store's public
        // identity view is intentionally not copied into project_json.
        let latestProject: DramaProject = project;
        const resume = body.resume === true;
        const result = await extractDramaLabStoryboards({
            userId: user.id,
            origin: new URL(request.url).origin,
            cookie: request.headers.get("cookie") || "",
            requestId,
            project,
            episodeId,
            resumeShots: resume ? project.episodes.find((episode) => episode.id === episodeId)?.shots || [] : undefined,
            onPartial: async (shots) => {
                if (!shots.length) return;
                const next = {
                    ...latestProject,
                    episodes: latestProject.episodes.map((episode) => (episode.id === episodeId ? { ...episode, shots } : episode)),
                    updatedAt: new Date().toISOString(),
                };
                try {
                    latestProject = (await updateDramaProject(user.id, next, latestProject.updatedAt)) || next;
                } catch (error) {
                    // The completed extraction is still returned. A later
                    // explicit resume request can persist the recovered prefix.
                    console.warn("Drama storyboard checkpoint deferred", { projectId: id, episodeId, error: error instanceof Error ? error.message : String(error) });
                }
            },
        });
        const updated = {
            ...latestProject,
            episodes: latestProject.episodes.map((episode) => (episode.id === episodeId ? { ...episode, shots: result.shots } : episode)),
            updatedAt: new Date().toISOString(),
        };
        await updateDramaProject(user.id, updated, latestProject.updatedAt);

        return NextResponse.json({
            code: 0,
            data: { shots: result.shots.map((shot) => toDramaLabShot(shot, episodeId)), templateKeys: result.templateKeys, meta: { truncated: result.truncated, recoveredCount: result.recoveredCount, duplicateCount: result.duplicateCount, continuationAttempts: result.continuationAttempts } },
            msg: "分镜提取完成",
        });
    } catch (error) {
        const status = error instanceof DramaLabStoryboardExtractionError || error instanceof DramaProjectStoreError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜提取失败" }, { status });
    }
}

function toDramaLabShot(shot: DramaShot, episodeId: string) {
    return {
        id: shot.id,
        episodeId,
        shotNumber: shot.order,
        sceneId: shot.sceneId,
        characterIds: shot.characterIds,
        propIds: shot.propIds,
        script: shot.description,
        imagePrompt: shot.imagePrompt || undefined,
        duration: shot.duration,
        cameraAngle: shot.continuity?.cameraAngle || undefined,
        status: "draft" as const,
    };
}
