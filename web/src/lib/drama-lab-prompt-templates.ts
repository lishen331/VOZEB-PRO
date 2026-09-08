import productionStoryDefaults from "./drama-lab-production-story-defaults.json";
import productionAssetDefaults from "./drama-lab-production-asset-defaults.json";
import productionFrameDefaults from "./drama-lab-production-frame-defaults.json";

export const DRAMA_LAB_PROMPT_KEYS = ["story_expansion_system", "character_extraction", "scene_extraction", "prop_extraction", "storyboard_system", "storyboard_user_suffix", "first_frame_prompt", "key_frame_prompt", "last_frame_prompt"] as const;

export type DramaLabCanonicalPromptKey = (typeof DRAMA_LAB_PROMPT_KEYS)[number];
export type DramaLabLegacyPromptKey = "story_generation" | "storyboard_output_format";
export type DramaLabPromptKey = DramaLabCanonicalPromptKey | DramaLabLegacyPromptKey;
export type DramaLabPromptCategory = "script" | "character" | "scene" | "prop" | "storyboard" | "image";

export type DramaLabPromptDefinition = {
    key: DramaLabCanonicalPromptKey;
    name: string;
    category: DramaLabPromptCategory;
    description: string;
    template: string;
    variables: string[];
};

export const DRAMA_LAB_PROMPT_DEFINITIONS: readonly DramaLabPromptDefinition[] = [
    {
        key: "story_expansion_system",
        name: "故事扩写提示词",
        category: "script",
        description: "控制如何将故事梗概扩写为当前短剧集的完整剧本。",
        template: productionStoryDefaults.story_expansion_system,
        variables: ["故事梗概", "故事风格", "剧本类型", "计划集数", "当前集"],
    },
    {
        key: "character_extraction",
        name: "角色提取提示词",
        category: "character",
        description: "控制如何从当前集剧本中提取可复用的命名角色。",
        template: productionAssetDefaults.character_extraction,
        variables: ["当前剧本", "项目风格", "已有角色"],
    },
    {
        key: "scene_extraction",
        name: "场景提取提示词",
        category: "scene",
        description: "控制如何从当前集剧本中提取可复用的拍摄场景。",
        template: productionAssetDefaults.scene_extraction,
        variables: ["当前剧本", "项目风格", "画幅比例", "已有场景"],
    },
    {
        key: "prop_extraction",
        name: "道具提取提示词",
        category: "prop",
        description: "控制如何从当前集剧本中提取剧情相关的关键道具。",
        template: productionAssetDefaults.prop_extraction,
        variables: ["当前剧本", "项目风格", "已有道具"],
    },
    {
        key: "storyboard_system",
        name: "分镜拆解提示词",
        category: "storyboard",
        description: "控制如何将已审核剧本拆解为可执行的镜头。",
        template: productionStoryDefaults.storyboard_system,
        variables: ["当前剧本", "角色", "场景", "道具", "项目风格", "画幅比例"],
    },
    {
        key: "storyboard_user_suffix",
        name: "分镜输出字段与空间合同",
        category: "storyboard",
        description: "追加在分镜任务上的详细要素说明，固定 JSON 契约由系统保留。",
        template: productionStoryDefaults.storyboard_user_suffix,
        variables: ["当前剧本", "分镜数量", "角色", "场景", "道具"],
    },
    {
        key: "first_frame_prompt",
        name: "首帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作开始前的静态首帧提示词。",
        template: productionFrameDefaults.first_frame_prompt,
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
    {
        key: "key_frame_prompt",
        name: "关键帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作或情绪高潮的关键帧提示词。",
        template: productionFrameDefaults.key_frame_prompt,
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
    {
        key: "last_frame_prompt",
        name: "尾帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作结束后的静态尾帧提示词。",
        template: productionFrameDefaults.last_frame_prompt,
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
] as const;

const LEGACY_TO_CANONICAL: Record<DramaLabPromptKey, DramaLabCanonicalPromptKey> = {
    story_generation: "story_expansion_system",
    storyboard_output_format: "storyboard_user_suffix",
    story_expansion_system: "story_expansion_system",
    character_extraction: "character_extraction",
    scene_extraction: "scene_extraction",
    prop_extraction: "prop_extraction",
    storyboard_system: "storyboard_system",
    storyboard_user_suffix: "storyboard_user_suffix",
    first_frame_prompt: "first_frame_prompt",
    key_frame_prompt: "key_frame_prompt",
    last_frame_prompt: "last_frame_prompt",
};

export function canonicalDramaLabPromptKey(key: DramaLabPromptKey): DramaLabCanonicalPromptKey {
    return LEGACY_TO_CANONICAL[key];
}

export function isDramaLabPromptKey(value: unknown): value is DramaLabPromptKey {
    return typeof value === "string" && value in LEGACY_TO_CANONICAL;
}

export function dramaLabPromptDefinition(key: DramaLabPromptKey) {
    const definition = DRAMA_LAB_PROMPT_DEFINITIONS.find((item) => item.key === canonicalDramaLabPromptKey(key));
    if (!definition) throw new Error(`Unknown drama lab prompt key: ${key}`);
    return definition;
}
