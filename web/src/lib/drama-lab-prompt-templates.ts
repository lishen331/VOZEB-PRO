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
        template: `你是一位专业的编剧。你的任务是根据用户提供的故事梗概，创作 1 集完整的短片剧本。

要求：
1. 用中文写作，叙事清晰流畅，适合后续拆分为分镜。
2. 可以包含场景描述、角色动作与对话，但不要输出分镜格式、镜头编号或“内景/外景”等场次标记。
3. 每集约 800 字。如有多集，剧情必须前后衔接——每集从上一集结尾处推进，确保整体故事连贯。
4. 每集有清晰的起承转合，结尾留有悬念或转折，吸引观众看下一集。

输出格式（必须严格遵守）：返回 JSON 数组，包含 1 个对象：
[{"episode":1,"title":"第一集标题（5-10字，概括本集核心内容）","content":"本集剧本正文（约800字）"}]
必须只返回纯 JSON 数组，不要 Markdown 代码块、说明文字或任何其他内容。`,
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
        template: `【角色】你是一位资深影视分镜师，精通叙事节拍、镜头语言和情绪节奏。

【任务】将剧本按独立动作单元拆解为分镜。每个分镜对应一个叙事节拍，可包含 1-4 个快速内部切镜；仅在明显停顿、场景切换或叙事需要时拆开。

【景别】大远景、远景、中景、近景、特写按叙事需要选择，禁止连续三个镜头使用同一景别。
【动态运镜】优先 push、pull、pan、tilt、tracking、crane_up、crane_dn、orbit、handheld、zoom、roll、whip_pan、spiral、hitchcock_zoom、bullet_time、dutch_angle_move、dolly_track、slowmo_orbit，固定镜头不超过 20%。
【连续性】每镜头有明确 action、result、emotion、emotion_intensity，保持轴线、视线、动作方向、空间和道具连续。
【空间合同】每镜头必须写 layoutDescription：角色左/中/右站位、朝向、与关键道具关系、真实物体尺度、构图以及为 declared movement 预留的自然取景空间。道具均为次要环境元素，禁止夸大；古代/古装场景禁止现代物品。`,
        variables: ["当前剧本", "角色", "场景", "道具", "项目风格", "画幅比例"],
    },
    {
        key: "storyboard_user_suffix",
        name: "分镜输出字段与空间合同",
        category: "storyboard",
        description: "追加在分镜任务上的详细要素说明，固定 JSON 契约由系统保留。",
        template: `每个镜头必须包含 shotNumber、title、description、sourceText、shotBoundary、segmentIndex、segmentTitle、location、time、shotType、cameraAngle、cameraMotion、angleH、angleV、angleS、lightingStyle、depthOfField、atmosphere、action、result、dialogue、narration、emotion、emotionIntensity、duration、layoutDescription、creationMode、universalSegmentText、polishedPrompt、imagePrompt、videoPrompt、continuity、sceneId、characterIds、propIds。

工具调用统一使用上述 camelCase 字段；LocalMiniDrama 的 shot_number、segment_index、scene_id、character_ids、prop_ids、camera_movement、lighting_style、depth_of_field、creation_mode、universal_segment_text、image_prompt、video_prompt、layout_description、continuity_notes 等 snake_case 仅作为非工具 JSON 回退的兼容输入。imagePrompt 和 videoPrompt 必须是可直接执行的提示词文本，不要填写链接。creationMode 只能为 classic 或 universal；classic 模式的 universalSegmentText 可以为空字符串，universal 模式的 universalSegmentText 必须包含时间线、动作阶段和至少两步连续运镜。continuity 必须是对象，并包含 shotSize、cameraAngle、composition、characterBlocking、gazeDirection、actionStart、actionEnd、screenDirection、axisRule、continuityNotes，未使用时填空字符串。

sceneId 只能引用 availableAssets.scenes 内真实 ID；characterIds 和 propIds 只能分别引用对应真实 ID，绝不能根据名称猜测、编造或新建 ID。layoutDescription 必须明确角色站位、道具真实尺度、整体构图和 declared movement 的演化空间；角色名单只能包含本镜实际出场者，场景描述不得包含人物外貌。`,
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
