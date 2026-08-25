/**
 * Drama Lab API - Project Detail
 *
 * 替代 LocalMiniDrama 的 /api/v1/dramas/:id 接口
 */

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject } from "@/lib/server/drama-project-store";
import { deleteDramaProjectForUser, DramaProjectServiceError, updateDramaProjectForUser } from "@/lib/server/drama-project-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/drama-lab/projects/:id
 * 获取项目详情
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const project = await getDramaProject(id, user.id);

        if (!project) {
            return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
        }

        return NextResponse.json({
            code: 0,
            data: { project },
            msg: "OK",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] GET error:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目加载失败",
            },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/drama-lab/projects/:id
 * 更新项目
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 2 * 1024 * 1024);

        // 获取现有项目
        const existing = await getDramaProject(id, user.id);
        if (!existing) {
            return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
        }

        const normalizedBody = normalizeLegacyStoryboardPayload(existing, body);

        // 合并更新
        const updated = {
            ...existing,
            ...normalizedBody,
            id, // 保持 ID 不变
            updatedAt: new Date().toISOString(),
        };

        const saved = await updateDramaProjectForUser(user.id, id, updated);

        return NextResponse.json({
            code: 0,
            data: { project: saved },
            msg: "项目更新成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] PUT error:", error);

        if (error instanceof DramaProjectServiceError) {
            return NextResponse.json({ code: error.status, msg: error.message }, { status: error.status });
        }

        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目更新失败",
            },
            { status: 500 },
        );
    }
}

function normalizeLegacyStoryboardPayload(existing: Record<string, unknown>, body: Record<string, unknown>) {
    const legacyShots = Array.isArray(body.shots) ? body.shots : undefined;
    const legacyEpisodes = Array.isArray(body.episodes) && body.episodes.some((episode) => isLegacyEpisode(episode));
    if (!legacyShots && !legacyEpisodes) return body;

    const { shots: _legacyShots, ...withoutLegacyShots } = body;
    const existingEpisodes = Array.isArray(existing.episodes) ? existing.episodes : [];
    const incomingEpisodes = Array.isArray(body.episodes) ? body.episodes : existingEpisodes;
    const episodes = incomingEpisodes.flatMap((episode, index) => {
        if (!episode || typeof episode !== "object") return [];
        const incoming = episode as Record<string, unknown>;
        const id = typeof incoming.id === "string" ? incoming.id : "";
        if (!id) return [];
        const current = existingEpisodes.find((candidate) => candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
        const matchingShots = legacyShots?.filter((shot) => shot && typeof shot === "object" && (shot as Record<string, unknown>).episodeId === id);
        const currentShots = Array.isArray(current?.shots) ? current.shots : [];
        return [
            {
                ...(current || createEpisodeFallback(incoming, id)),
                ...incoming,
                id,
                shots: matchingShots ? matchingShots.flatMap((shot, shotIndex) => legacyShotToEpisodeShot(shot, shotIndex, currentShots)) : currentShots,
            },
        ];
    });
    return { ...withoutLegacyShots, episodes };
}

function isLegacyEpisode(value: unknown) {
    if (!value || typeof value !== "object") return false;
    const episode = value as Record<string, unknown>;
    return typeof episode.number === "number" || ("status" in episode && !("reviewStatus" in episode));
}

function createEpisodeFallback(source: Record<string, unknown>, id: string) {
    return {
        id,
        title: typeof source.title === "string" ? source.title : "未命名剧集",
        script: typeof source.script === "string" ? source.script : "",
        outline: "",
        hook: "",
        nextPreview: "",
        sourceRange: "",
        reviewStatus: "draft",
        shots: [],
    };
}

function legacyShotToEpisodeShot(value: unknown, index: number, currentShots: unknown[]) {
    if (!value || typeof value !== "object") return [];
    const shot = value as Record<string, unknown>;
    const id = typeof shot.id === "string" ? shot.id : "";
    if (!id) return [];
    const current = currentShots.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
    const order = typeof shot.shotNumber === "number" ? shot.shotNumber : index + 1;
    const script = typeof shot.script === "string" ? shot.script : "";
    const imageUrl = typeof shot.imageUrl === "string" ? shot.imageUrl : "";
    return [
        {
            ...current,
            id,
            order,
            title: script || (typeof current?.title === "string" ? current.title : `镜头 ${order}`),
            description: script || (typeof current?.description === "string" ? current.description : ""),
            sourceText: script || (typeof current?.sourceText === "string" ? current.sourceText : ""),
            shotBoundary: typeof current?.shotBoundary === "string" ? current.shotBoundary : "",
            dialogue: typeof current?.dialogue === "string" ? current.dialogue : "",
            narration: typeof current?.narration === "string" ? current.narration : "",
            utterances: Array.isArray(current?.utterances) ? current.utterances : [],
            imagePrompt: typeof shot.imagePrompt === "string" ? shot.imagePrompt : typeof current?.imagePrompt === "string" ? current.imagePrompt : "",
            videoPrompt: typeof current?.videoPrompt === "string" ? current.videoPrompt : "",
            cameraMotion: typeof current?.cameraMotion === "string" ? current.cameraMotion : "",
            duration: typeof shot.duration === "number" ? shot.duration : 3,
            characterIds: Array.isArray(shot.characterIds) ? shot.characterIds.filter((item): item is string => typeof item === "string") : [],
            propIds: Array.isArray(shot.propIds) ? shot.propIds.filter((item): item is string => typeof item === "string") : [],
            clueIds: Array.isArray(current?.clueIds) ? current.clueIds : [],
            ...(typeof shot.sceneId === "string" ? { sceneId: shot.sceneId } : {}),
            ...(imageUrl ? { storyboardImageUrl: imageUrl } : {}),
            ...(typeof shot.videoUrl === "string" ? { videoUrl: shot.videoUrl } : {}),
            ...pickStoryboardWorkflowFields(shot),
        },
    ];
}

function pickStoryboardWorkflowFields(shot: Record<string, unknown>) {
    const keys = [
        "title",
        "description",
        "sourceText",
        "shotBoundary",
        "dialogue",
        "narration",
        "utterances",
        "imagePrompt",
        "videoPrompt",
        "cameraMotion",
        "continuity",
        "storyboardStatus",
        "storyboardAttempt",
        "storyboardTaskId",
        "storyboardError",
        "storyboardImageUrl",
        "storyboardImageWidth",
        "storyboardImageHeight",
        "storyboardHistory",
        "generationStatus",
        "generationAttempt",
        "generationTaskId",
        "generationNeedsReview",
        "generationError",
        "videoHistory",
    ];
    return Object.fromEntries(keys.filter((key) => shot[key] !== undefined).map((key) => [key, shot[key]]));
}

/**
 * DELETE /api/drama-lab/projects/:id
 * 删除项目
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;

        await deleteDramaProjectForUser(user.id, id);

        return NextResponse.json({
            code: 0,
            msg: "项目删除成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] DELETE error:", error);
        if (error instanceof DramaProjectServiceError) {
            return NextResponse.json({ code: error.status, msg: error.message }, { status: error.status });
        }
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目删除失败",
            },
            { status: 500 },
        );
    }
}
