import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";

export type OneClickUniversalPromptInput = {
    project: Pick<DramaProject, "style" | "ratio" | "characters" | "scenes" | "props" | "episodes">;
    shot: DramaShot;
    duration?: number;
    draft?: string;
    forceWithoutReferenceImages?: boolean;
};

/** L universalSegmentPromptBundle 的 V 适配合同：只负责组装输入，不调用模型。 */
export function buildOneClickUniversalPromptInput(input: OneClickUniversalPromptInput) {
    const { project, shot } = input;
    const scene = project.scenes.find((item) => item.id === shot.sceneId);
    const characters = (shot.characterIds || []).map((id) => project.characters.find((item) => item.id === id)).filter(Boolean);
    const props = (shot.propIds || []).map((id) => project.props.find((item) => item.id === id)).filter(Boolean);
    const references = [
        scene ? { slot: "@图片1", kind: "场景", id: scene.id, name: scene.name, imageUrl: scene.referenceImageUrl } : null,
        ...characters.map((item, index) => ({ slot: `@图片${index + 2}`, kind: "角色", id: item!.id, name: item!.name, imageUrl: item!.referenceImageUrl })),
        ...props.map((item, index) => ({ slot: `@图片${index + 2 + characters.length}`, kind: "道具", id: item!.id, name: item!.name, imageUrl: item!.referenceImageUrl })),
    ].filter(Boolean);
    const fields: Record<string, unknown> = {
        TITLE: shot.title,
        DESCRIPTION: shot.description,
        LOCATION: shot.location,
        TIME: shot.time,
        ACTION: shot.action,
        DIALOGUE: shot.dialogue,
        NARRATION: shot.narration,
        RESULT: shot.result,
        ATMOSPHERE: shot.atmosphere,
        IMAGE_PROMPT: shot.imagePrompt,
        POLISHED_IMAGE_PROMPT: shot.polishedPrompt,
        VIDEO_PROMPT: shot.videoPrompt,
        SHOT_TYPE: shot.shotType,
        ANGLE: shot.cameraAngle,
        ANGLE_H: shot.angleH,
        ANGLE_V: shot.angleV,
        ANGLE_S: shot.angleS,
        MOVEMENT: shot.cameraMotion,
        LIGHTING: shot.lightingStyle,
        DEPTH_OF_FIELD: shot.depthOfField,
        CURRENT_UNIVERSAL_SEGMENT: input.draft ?? shot.universalSegmentText,
        PROJECT_STYLE: project.style,
        ASPECT_RATIO: project.ratio,
        DURATION_SECONDS: input.duration ?? shot.duration,
        EPISODE_SCRIPT: project.episodes.find((episode) => episode.shots.some((item) => item.id === shot.id))?.script?.slice(0, 20_000) || "",
        IMAGE_SLOT_MAP: references,
        FORCE_WITHOUT_REFERENCE_IMAGES: input.forceWithoutReferenceImages === true,
    };
    return { fields, references, systemContract: "L_UNIVERSAL_SEGMENT_PROMPT_V1" };
}
