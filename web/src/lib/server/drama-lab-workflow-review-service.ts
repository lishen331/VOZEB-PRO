import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import type { CreativeFoundation, CreativeReview } from "@/lib/creative-agent-contract";
import { reviewCreativeOutputs, type CreativeReviewTaskInput } from "@/lib/server/creative-review-service";

export type DramaLabWorkflowReviewInput = {
    userId: string;
    project: DramaProject;
    episodeIds: string[];
    origin: string;
    cookie: string;
};

/**
 * Build the same bounded, explicit review contract for both the workflow
 * worker and a future manual review entry point.  The model receives the
 * project direction plus durable shot/asset references; it never has to
 * infer the project from a UI-only snapshot.
 */
export async function reviewDramaLabWorkflowOutputs(input: DramaLabWorkflowReviewInput): Promise<{ review: CreativeReview; taskIds: string[] }> {
    const { foundation, tasks } = buildDramaLabWorkflowReviewInput(input.project, input.episodeIds);
    const review = await reviewCreativeOutputs({
        origin: input.origin || "http://localhost",
        cookie: input.cookie || "",
        userId: input.userId,
        foundation,
        tasks,
    });
    return { review, taskIds: tasks.map((task) => task.id) };
}

export function buildDramaLabWorkflowReviewInput(project: DramaProject, episodeIds: string[]) {
    const selected = project.episodes.filter((episode) => episodeIds.includes(episode.id));
    const tasks: CreativeReviewTaskInput[] = [];
    for (const episode of selected) {
        const script = episode.script.trim().slice(0, 12_000);
        if (script) {
            tasks.push({
                id: `script:${episode.id}`,
                title: `${episode.title || "剧集"}剧本`,
                type: "text",
                prompt: script,
                resultSummary: script,
            });
        }
        for (const shot of episode.shots || []) tasks.push(shotReviewTask(episode.title || "剧集", shot));
    }

    const assetSummary = JSON.stringify({
        characters: project.characters.map((item) => ({ id: item.id, name: item.name, description: item.description?.slice(0, 1_000) })),
        scenes: project.scenes.map((item) => ({ id: item.id, name: item.name, description: item.description?.slice(0, 1_000) })),
        props: project.props.map((item) => ({ id: item.id, name: item.name, description: item.description?.slice(0, 1_000) })),
    }).slice(0, 24_000);
    if (assetSummary !== "{}") {
        tasks.push({ id: "assets:project", title: "项目视觉资产", type: "text", prompt: assetSummary, resultSummary: assetSummary });
    }

    const ratio = project.ratio?.trim() || "未指定";
    const style = project.style?.trim() || "保持项目既有视觉方向";
    const foundation: CreativeFoundation = {
        complexity: "complex",
        brief: {
            objective: `${project.title || "短剧项目"} · ${selected.map((episode) => episode.title || `第${episode.episodeNumber || ""}集`).join("、") || "当前剧集"}产物审核`,
            coreMessage: project.summary?.trim().slice(0, 2_000),
            constraints: [`画幅 ${ratio}`, "只评价项目内已提供的产物", "角色、场景、道具和相邻镜头必须保持连续"],
            referenceStrategy: "以项目资产主参考图、镜头绑定关系和相邻镜头为一致性基准",
        },
        direction: {
            summary: style,
            style,
            composition: "检查景别、构图、人物站位、视线、轴线和运动方向",
            avoid: ["角色身份漂移", "服装或道具无依据变化", "空间关系跳变", "轴线与视线错误", "文字和水印"],
        },
    };
    return { foundation, tasks: tasks.slice(0, 10_000) };
}

function shotReviewTask(episodeTitle: string, shot: DramaShot): CreativeReviewTaskInput {
    const imageUrls = uniqueMediaUrls([
        shot.storyboardImageUrl,
        shot.storyboardEndImageUrl,
        shot.frames?.first?.url,
        shot.frames?.key?.url,
        shot.frames?.last?.url,
    ]);
    const videoUrl = typeof shot.videoUrl === "string" ? shot.videoUrl.trim() : "";
    const compiledPrompt = (shot as DramaShot & { compiledPrompt?: string }).compiledPrompt;
    const prompt = [compiledPrompt, shot.imagePrompt, shot.videoPrompt, shot.description, shot.dialogue, shot.narration].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join("\n").slice(0, 8_000);
    return {
        id: `shot:${shot.id}`,
        title: `${episodeTitle} · ${shot.title || `镜头${shot.order || ""}`}`,
        type: videoUrl ? "video" : "image",
        prompt,
        resultSummary: [imageUrls.length ? `图片结果 ${imageUrls.length} 张` : "尚无图片结果", videoUrl ? "已有视频结果" : "尚无视频结果", shot.sceneId ? `场景 ${shot.sceneId}` : "未绑定场景", ...(shot.characterIds || []).map((id) => `角色 ${id}`), ...(shot.propIds || []).map((id) => `道具 ${id}`)].join("；").slice(0, 4_000),
        ...(imageUrls.length ? { imageUrls } : {}),
        ...(videoUrl ? { videoUrls: [videoUrl] } : {}),
    };
}

function uniqueMediaUrls(values: unknown[]) {
    return Array.from(new Set(values.flatMap((value) => {
        if (typeof value !== "string") return [];
        const url = value.trim();
        return url.startsWith("/api/") || /^https:\/\//i.test(url) || /^data:(?:image|video)\//i.test(url) ? [url] : [];
    })));
}
