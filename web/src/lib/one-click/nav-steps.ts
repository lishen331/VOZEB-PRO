import type { DramaEpisode, DramaNamedAsset, DramaProject, DramaShot } from "@/lib/drama-project-contract";

/** L navSteps 的四态。 */
export type OneClickNavStepStatus = "pending" | "partial" | "done" | "generating";

export type OneClickNavStep = {
    key: string;
    label: string;
    /** 滚动锚点。照 L：分镜脚本与分镜图共用 anchor-storyboard。 */
    anchor: string;
    status: OneClickNavStepStatus;
    count: number;
};

/** L `hasAssetImage`：资产是否已有设定图。 */
export function hasOneClickAssetImage(asset: DramaNamedAsset) {
    return Boolean(asset.referenceImageUrl?.trim() || asset.references?.length);
}

/** L `hasSbImage`：分镜是否已有图（经典主图，或首/尾帧任一槽位）。 */
export function hasOneClickShotImage(shot: DramaShot) {
    return Boolean(shot.storyboardImageUrl?.trim() || shot.frames?.first?.url?.trim() || shot.frames?.last?.url?.trim());
}

function isRunning(status: string | undefined) {
    return status === "running" || status === "pending" || status === "queued";
}

/**
 * L 的判定语义：全部完成才 done；有内容但未全完成是 partial；空是 pending；
 * 生成中优先于其它状态。
 */
function listStatus(total: number, doneAll: boolean, generating: boolean): OneClickNavStepStatus {
    if (generating) return "generating";
    if (total > 0 && doneAll) return "done";
    return total > 0 ? "partial" : "pending";
}

/**
 * 计算 L `navSteps` 的 7 步状态，逐条对齐 L `FilmCreate.vue` 的 navSteps computed：
 * script / chars / props / scenes / sb（分镜脚本）/ sbimg（分镜图）/ video（分镜视频）。
 *
 * `scriptSplitting` 对应 L 的页面级 `storyboardGenerating` ref —— 分镜脚本没有
 * per-shot 状态字段，只能由调用方传入，不能在这里凭字段猜。
 */
export function buildOneClickNavSteps(project: DramaProject, episode: DramaEpisode | undefined, flags: { scriptSplitting?: boolean } = {}): OneClickNavStep[] {
    const shots = episode?.shots || [];
    const hasScript = Boolean(episode?.script?.trim());
    const chars = project.characters || [];
    const props = project.props || [];
    const scenes = project.scenes || [];

    const sbImgGenerating = shots.some((shot) => isRunning(shot.storyboardStatus));
    const videoGenerating = shots.some((shot) => isRunning(shot.generationStatus));

    return [
        { key: "script", label: "故事剧本", anchor: "anchor-script", status: hasScript ? "done" : "pending", count: hasScript ? 1 : 0 },
        { key: "chars", label: "角色", anchor: "anchor-characters", status: listStatus(chars.length, chars.every(hasOneClickAssetImage), false), count: chars.length },
        { key: "props", label: "道具", anchor: "anchor-props", status: listStatus(props.length, props.every(hasOneClickAssetImage), false), count: props.length },
        { key: "scenes", label: "场景", anchor: "anchor-scenes", status: listStatus(scenes.length, scenes.every(hasOneClickAssetImage), false), count: scenes.length },
        { key: "sb", label: "分镜脚本", anchor: "anchor-storyboard", status: flags.scriptSplitting ? "generating" : shots.length > 0 ? "done" : "pending", count: shots.length },
        { key: "sbimg", label: "分镜图", anchor: "anchor-storyboard", status: listStatus(shots.length, shots.every(hasOneClickShotImage), sbImgGenerating), count: shots.length },
        {
            key: "video",
            label: "分镜视频",
            anchor: "anchor-video",
            status: listStatus(
                shots.length,
                shots.every((shot) => Boolean(shot.videoUrl?.trim())),
                videoGenerating,
            ),
            count: 0,
        },
    ];
}
