import type { DramaProject, DramaShot, DramaShotFrameState, DramaShotFrameType } from "@/lib/drama-project-contract";

export class OneClickFramePromptError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

/**
 * L `framePromptSave` 路由校验 validTypes = ['first','key','last','panel','action']，
 * 但全仓库搜索确认 panel/action 从未真正写入 frame_prompts（零命中），
 * 实际产生的只有 first/key/last —— 与 V 的 DramaShotFrameType 完全一致。
 * 因此这里按实际行为取三种，不引入两个永不落库的枚举值。
 */
const FRAME_TYPES: DramaShotFrameType[] = ["first", "key", "last"];

export function isOneClickFrameType(value: unknown): value is DramaShotFrameType {
    return typeof value === "string" && (FRAME_TYPES as string[]).includes(value);
}

export type OneClickFramePrompt = {
    frameType: DramaShotFrameType;
    prompt: string;
    description?: string;
    layout?: string;
};

function locate(project: DramaProject, episodeId: string, shotId: string) {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new OneClickFramePromptError("分集不存在", 404);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new OneClickFramePromptError("分镜不存在", 404);
    return { episode, shot };
}

/**
 * 对应 L `GET /storyboards/:id/frame-prompts`。
 * L 从独立表按 created_at 升序返回；V 把帧内联在分镜上，因此按固定的
 * first → key → last 顺序返回，只输出确实有提示词的帧。
 */
export function listOneClickFramePrompts(project: DramaProject, episodeId: string, shotId: string): OneClickFramePrompt[] {
    const { shot } = locate(project, episodeId, shotId);
    return FRAME_TYPES.flatMap((frameType) => {
        const frame = shot.frames?.[frameType];
        if (!frame?.prompt?.trim()) return [];
        return [
            {
                frameType,
                prompt: frame.prompt,
                ...(frame.description ? { description: frame.description } : {}),
                ...(frame.layout ? { layout: frame.layout } : {}),
            },
        ];
    });
}

/**
 * 对应 L `PUT /storyboards/:id/frame-prompts/:frame_type`（framePromptService.saveFramePrompt）。
 *
 * L 的语义是「先 DELETE 同 (storyboard_id, frame_type) 再 INSERT」，即整条提示词记录被替换：
 * prompt/description/layout 三列一起覆盖，未传的写 null。这里照抄该覆盖语义 —— 未传的
 * description/layout 会被清空，而不是保留旧值。
 *
 * 但已生成的图片状态（status/url/taskId/history 等）不属于 frame_prompts 表，
 * L 保存提示词时不会动它们，所以这里必须原样保留。
 */
export function saveOneClickFramePrompt(
    project: DramaProject,
    episodeId: string,
    shotId: string,
    frameType: DramaShotFrameType,
    input: { prompt: string; description?: string; layout?: string },
): { project: DramaProject; framePrompts: OneClickFramePrompt[] } {
    if (!isOneClickFrameType(frameType)) throw new OneClickFramePromptError("不支持的 frame_type");
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    // L: if (!prompt.trim()) return badRequest('prompt 不能为空')
    if (!prompt.trim()) throw new OneClickFramePromptError("prompt 不能为空");

    const { episode, shot } = locate(project, episodeId, shotId);
    const existing = shot.frames?.[frameType];
    const nextFrame: DramaShotFrameState = {
        // 保留生成结果与任务状态：它们不在 L 的 frame_prompts 表里，保存提示词不应影响。
        ...(existing || { status: "idle" }),
        prompt,
        // 覆盖语义：未传即清空，与 L 的 DELETE+INSERT 一致。
        ...(input.description?.trim() ? { description: input.description } : { description: undefined }),
        ...(input.layout?.trim() ? { layout: input.layout } : { layout: undefined }),
    };

    const nextShot: DramaShot = { ...shot, frames: { ...(shot.frames || {}), [frameType]: nextFrame } };
    const shots = episode.shots.map((item) => (item.id === shotId ? nextShot : item));
    const next = { ...project, episodes: project.episodes.map((item) => (item.id === episodeId ? { ...item, shots } : item)) };
    return { project: next, framePrompts: listOneClickFramePrompts(next, episodeId, shotId) };
}
