export const DRAMA_LAB_PROMPT_KEYS = [
    "story_generation",
    "character_extraction",
    "scene_extraction",
    "prop_extraction",
    "storyboard_system",
    "storyboard_output_format",
    "first_frame_prompt",
    "key_frame_prompt",
    "last_frame_prompt",
] as const;

export type DramaLabPromptKey = (typeof DRAMA_LAB_PROMPT_KEYS)[number];
export type DramaLabPromptCategory = "script" | "character" | "scene" | "prop" | "storyboard" | "image";

export type DramaLabPromptDefinition = {
    key: DramaLabPromptKey;
    name: string;
    category: DramaLabPromptCategory;
    description: string;
    template: string;
    variables: string[];
};

export const DRAMA_LAB_PROMPT_DEFINITIONS: readonly DramaLabPromptDefinition[] = [
    {
        key: "story_generation",
        name: "故事生成提示词",
        category: "script",
        description: "控制如何将故事梗概扩写为当前短剧集的完整剧本。",
        template: "你是一位专业短剧编剧。根据用户提供的故事梗概创作当前一集的完整剧本。保持人物动机、冲突升级与结尾钩子清晰，使用可直接用于后续资产提取和分镜拆解的中文叙事。",
        variables: ["故事梗概", "故事风格", "剧本类型", "计划集数", "当前集"],
    },
    {
        key: "character_extraction",
        name: "角色提取提示词",
        category: "character",
        description: "控制如何从当前集剧本中提取可复用的命名角色。",
        template: "你是专业的影视角色设定师。只从当前剧本中提取有名字、会实际出场或推动剧情的角色，忽略无名路人。每个角色写清身份、外貌、性格、与剧情相关的关系或动机；不要臆造剧本没有的信息。",
        variables: ["当前剧本", "项目风格", "已有角色"],
    },
    {
        key: "scene_extraction",
        name: "场景提取提示词",
        category: "scene",
        description: "控制如何从当前集剧本中提取可复用的拍摄场景。",
        template: "你是影视美术指导。只提取剧本中实际发生剧情的独立场景，合并同一地点且视觉设定一致的重复场景。描述地点、时间、空间结构、关键陈设、氛围和光线，不要把人物动作当作场景。",
        variables: ["当前剧本", "项目风格", "画幅比例", "已有场景"],
    },
    {
        key: "prop_extraction",
        name: "道具提取提示词",
        category: "prop",
        description: "控制如何从当前集剧本中提取剧情相关的关键道具。",
        template: "你是影视道具设计师。只提取在剧情中被使用、被强调、承载线索或影响行动的关键道具，忽略普通背景杂物。描述道具的用途、材质、外观、时代感和可见细节；不得凭空补充品牌或情节。",
        variables: ["当前剧本", "项目风格", "已有道具"],
    },
    {
        key: "storyboard_system",
        name: "分镜拆解提示词",
        category: "storyboard",
        description: "控制如何将已审核剧本拆解为可执行的镜头。",
        template: "你是一位资深影视分镜师。按叙事节拍拆解剧本，镜头必须服务剧情、动作和情绪变化；合理安排景别、机位、运镜与画面结果，并保持人物、空间和道具连续性。",
        variables: ["当前剧本", "角色", "场景", "道具", "项目风格", "画幅比例"],
    },
    {
        key: "storyboard_output_format",
        name: "分镜输出格式要求",
        category: "storyboard",
        description: "追加在分镜任务上的详细要素说明，固定 JSON 契约由系统保留。",
        template: "每个镜头应明确镜头标题、场景、时间、景别、机位、运镜、人物动作、对白或旁白、画面结果、情绪、时长，以及引用的角色、场景和道具。避免连续使用相同景别，镜头之间保持轴线、视线和动作连贯。",
        variables: ["当前剧本", "分镜数量", "角色", "场景", "道具"],
    },
    {
        key: "first_frame_prompt",
        name: "首帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作开始前的静态首帧提示词。",
        template: "你是电影分镜图像提示词专家。首帧只呈现动作发生前的静态瞬间，明确人物站位、朝向、初始姿态、表情、构图、镜位、光线和空间关系；保持角色与场景资产的一致性。",
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
    {
        key: "key_frame_prompt",
        name: "关键帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作或情绪高潮的关键帧提示词。",
        template: "你是电影分镜图像提示词专家。关键帧捕捉动作最有信息量或情绪最饱满的瞬间，强化人物动作、表情、构图、镜头角度、光线和戏剧张力，同时保持角色、场景与道具一致。",
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
    {
        key: "last_frame_prompt",
        name: "尾帧图像提示词",
        category: "image",
        description: "控制如何为分镜生成动作结束后的静态尾帧提示词。",
        template: "你是电影分镜图像提示词专家。尾帧呈现动作完成后的稳定画面，明确动作结果、人物最终站位与表情、道具状态、构图、光线和下一镜可衔接的空间关系。",
        variables: ["镜头信息", "角色资产", "场景资产", "项目风格", "画幅比例"],
    },
] as const;

export function isDramaLabPromptKey(value: unknown): value is DramaLabPromptKey {
    return typeof value === "string" && (DRAMA_LAB_PROMPT_KEYS as readonly string[]).includes(value);
}

export function dramaLabPromptDefinition(key: DramaLabPromptKey) {
    const definition = DRAMA_LAB_PROMPT_DEFINITIONS.find((item) => item.key === key);
    if (!definition) throw new Error(`Unknown drama lab prompt key: ${key}`);
    return definition;
}
