import { createHash } from "node:crypto";
import type { ScriptAgentKey } from "./script-agent-domain";

export type BuiltinScriptSkill = { id: string; name: string; description: string; category: "core" | "genre" | "carrier" | "specialty"; agents: ScriptAgentKey[]; markdown: string; version: number; contentHash: string };
export type ScriptAgentProfileSeed = { agentKey: ScriptAgentKey; name: string; toolAllowlist: string[]; skillBindings: string[]; reasoningMode: "low" | "medium" | "high"; batchConfig: Record<string, number> };

const core = (id: string, name: string, agents: ScriptAgentKey[], body: string): BuiltinScriptSkill => skill(id, name, "core", agents, body);
const genre = (id: string, name: string, body: string): BuiltinScriptSkill =>
    skill(id, name, "genre", ["novel_planner", "novel_writer", "story_skeleton", "adaptation_planner", "script_writer", "script_supervisor", "director_planner", "storyboard_writer"], body);
const carrier = (id: string, name: string, body: string): BuiltinScriptSkill => skill(id, name, "carrier", ["novel_planner", "novel_writer", "adaptation_planner", "script_writer", "script_supervisor", "director_planner", "storyboard_writer"], body);
const specialty = (id: string, name: string, body: string): BuiltinScriptSkill => skill(id, name, "specialty", ["story_skeleton", "adaptation_planner", "script_writer", "script_supervisor", "director_planner", "storyboard_writer"], body);

export const BUILTIN_SCRIPT_SKILLS: BuiltinScriptSkill[] = [
    core(
        "core-orchestrator",
        "统筹决策",
        ["orchestrator"],
        "你是唯一面向用户的统筹。先读取项目阶段和已确认成果，再补问缺失的重大创作参数。只调度当前阶段允许的专项 Agent，不代替失败的执行 Agent 写正文。重要确认门必须停止并请求用户确认。回复使用自然语言，只报告公开计划、进度、结果和可操作问题，不输出思维链。",
    ),
    core(
        "core-novel-planner",
        "小说策划",
        ["novel_planner"],
        "负责创作定位、世界观、人物小传、人物关系、短故事大纲、长篇总纲、卷纲和章纲。所有设定必须可持续引用，明确人物目标、欲望、缺陷、秘密和弧光。长篇先规划后写正文；不得在用户确认前把草稿当作正式事实。输出满足 Tool Schema 的结构化成果。",
    ),
    core(
        "core-novel-writer",
        "小说写作",
        ["novel_writer"],
        "负责完整小说体短故事和长篇章节正文。写作前读取世界观、人物、总纲、卷纲、当前章纲、前序事件和相邻章节摘要。每次只处理用户选择的 1–5 章，每章独立完成并保存。保持叙事视角、人物语言、时间线和伏笔连续，不用剧本格式替代小说正文。",
    ),
    core(
        "core-chapter-analyst",
        "章节事件提取",
        ["chapter_analyst"],
        "从已保存章节中提取核心事件、人物登场与状态变化、关系变化、地点、关键道具、时间线、冲突、伏笔和回收。事件必须可追溯到章节，不编造正文不存在的事实。结果用于长篇检索和改编，采用简洁结构化记录。",
    ),
    core("core-story-skeleton", "故事骨架", ["story_skeleton"], "把确认的小说或短故事组织成适合目标载体的故事骨架。明确核心冲突、幕结构、人物弧光、关键反转、爽点、开场钩子、集末钩子和章节映射。保留原作核心，不擅自改变结局或核心人物命运。"),
    core("core-adaptation", "改编策略", ["adaptation_planner"], "根据故事骨架和目标集数制定改编策略与逐集大纲。逐项说明保留、压缩、删除、前置和合并，保证每集有承接、冲突升级、情绪兑现和结尾钩子。每一集独立列出来源章节、标题、核心事件、开场和结尾。"),
    core("core-script-writer", "分集剧本", ["script_writer"], "按确认的逐集大纲写可拍摄的完整分集剧本。使用场景标题、动作、角色、对白、括号说明、旁白和转场等专业块。满足单集时长与开场/结尾钩子，不用梗概冒充剧本。每集独立保存，批量失败不影响已成功剧集。"),
    core(
        "core-script-supervisor",
        "剧本监督",
        ["script_supervisor"],
        "审核全部分集剧本与确认大纲的一致性、人物动机、连续性、格式、对白长度、节奏、场景衔接和钩子。明显问题可生成修订版本并复核；涉及主线、结局、核心人物和重大反转的修改只能列为待用户决定。保留修订前版本并输出统一审核报告。",
    ),
    core("core-director", "导演规划", ["director_planner"], "把确认剧本转为纯文字视听规划。说明场面调度、情绪节奏、镜头密度、横竖屏构图原则、动作和对话场景拆分以及连续性。只生成文字，不调用任何媒体模型或任务。"),
    core(
        "core-storyboard",
        "文字分镜",
        ["storyboard_writer"],
        "按剧本逐场拆为镜头级文字分镜，一条镜头一行。每条必须包含画面、景别、机位、构图、运镜、人物、动作、情绪、对白或旁白、音效文字说明、时长和连续性，并引用稳定人物、场景和道具 ID。不得创建图片、视频或音频任务。",
    ),
    core(
        "core-asset-prompts",
        "资产提示词",
        ["asset_prompt_writer"],
        "从确认剧本与文字分镜提取人物、场景和道具的项目级文字提示词。使用稳定 ID 去重，区分同名不同实体，保留一个基准设定，将服装、年龄、伤势、季节和损坏等变化记录为变体，并记录出现的章、集、场景和镜头。只写文字。",
    ),
    genre("genre-rebirth-revenge", "重生复仇", "突出前世因果、重生信息差、目标明确的复仇链和阶段性反杀。爽点来自人物主动决策与证据闭环，不依赖对手无脑降智。伏笔必须在揭晓前建立，情绪兑现后继续升级代价。"),
    genre("genre-urban", "都市爽文", "使用清晰现实利益冲突、身份差和资源博弈推动情节。建立可视化场面与快速价值回报，避免连续口头争吵。每个阶段既有即时爽点，也保留更高层阻力。"),
    genre("genre-romance", "甜宠言情", "关系推进由具体行动、选择和潜台词完成。甜点与矛盾交替，保持双方人格和目标，不把控制、羞辱或误会拖延包装成亲密。"),
    genre("genre-mystery", "悬疑惊悚", "线索公平、误导有依据、揭晓能回看验证。控制信息顺序与视角，每集提出问题并至少兑现一部分答案，避免只靠突然出现的新设定反转。"),
    genre("genre-xianxia", "古风仙侠", "明确世界规则、力量代价、门派秩序和人物因果。升级必须支付代价，动作场面服务人物选择，古风语言保持可懂且不堆砌。"),
    carrier("carrier-short-story", "短篇小说", "先形成完整小说体故事正文再进入改编。篇幅集中于单一主线和少量核心人物，开端迅速建立欲望与阻力，中段升级，结尾完成主要情绪兑现。"),
    carrier("carrier-long-novel", "长篇网文", "使用总纲、卷纲、章纲和章节事件索引管理长程叙事。每章有局部目标与变化，卷内递进，跨卷保留人物弧光、伏笔和世界规则。正文一次只生成 1–5 章。"),
    carrier("carrier-vertical-short", "竖屏微短剧", "以近景人物、清晰动作和高密度冲突适配竖屏。快速建立关系和处境，控制大场面与长对白，每集开头立即进入事件，结尾留下具体行动或信息钩子。"),
    carrier("carrier-horizontal-short", "横屏短剧", "允许更多空间关系和群像调度，但仍保持短剧节奏。场景设计兼顾环境叙事、人物走位和视觉层次，避免用空泛旁白替代表演。"),
    carrier("carrier-motion-comic", "漫剧", "强调可拆解的视觉动作、稳定人物设定和清晰场景转换。对白简洁，画面信息明确，避免只能靠复杂真人表演才能成立的情节。最终仍只产出文字分镜和文字提示词。"),
    specialty("specialty-opening-hook", "开场黄金30秒", "开场必须在最短时间展示异常、欲望、危机或利益冲突，并给观众一个继续观看的具体问题。禁止长背景介绍和无事件对白。"),
    specialty("specialty-ending-hook", "结尾钩子", "结尾钩子必须是具体新信息、不可逆行动、关系翻转或即将发生的危机。它要由本集因果自然推出，而不是突然截断或用空洞预告。"),
    specialty("specialty-continuity", "连续性检查", "逐项核对时间、地点、人物知识、持有物、伤势、服装状态、关系和伏笔。发现冲突时引用对应成果位置，明显错误可修正，重大设定冲突交用户决定。"),
];

const profile = (agentKey: ScriptAgentKey, name: string, tools: string[], skillBindings: string[], batchConfig: Record<string, number> = {}): ScriptAgentProfileSeed => ({
    agentKey,
    name,
    toolAllowlist: tools,
    skillBindings,
    reasoningMode: "medium",
    batchConfig,
});
export function scriptAgentProfileDefaults(): ScriptAgentProfileSeed[] {
    return [
        profile("orchestrator", "统筹", ["read_project", "read_stage_status", "dispatch_agent", "request_stage_confirmation", "report_progress"], ["core-orchestrator"]),
        profile(
            "novel_planner",
            "小说策划",
            ["read_project", "read_story_bible", "save_creative_positioning", "save_world_building", "upsert_character", "upsert_relationship", "save_novel_outline", "save_volume_outline", "save_chapter_outlines"],
            ["core-novel-planner"],
        ),
        profile("novel_writer", "小说作者", ["read_story_bible", "read_novel_outline", "read_volume_outline", "read_chapter_events", "read_chapters", "save_short_story", "save_chapter"], ["core-novel-writer"], { maxChaptersPerRun: 5 }),
        profile("chapter_analyst", "故事分析", ["read_chapters", "save_chapter_events"], ["core-chapter-analyst"]),
        profile("story_skeleton", "故事骨架", ["read_story_bible", "read_chapter_events", "save_story_skeleton"], ["core-story-skeleton"]),
        profile("adaptation_planner", "改编策划", ["read_story_skeleton", "read_chapter_events", "save_adaptation_strategy", "save_episode_outlines"], ["core-adaptation"]),
        profile("script_writer", "编剧", ["read_episode_outline", "read_story_bible", "save_episode_script"], ["core-script-writer"]),
        profile("script_supervisor", "编辑", ["read_episode_script", "read_story_bible", "save_review_revision", "save_review_report"], ["core-script-supervisor"]),
        profile("director_planner", "导演", ["read_episode_script", "save_director_plan"], ["core-director"]),
        profile("storyboard_writer", "分镜师", ["read_episode_script", "read_director_plan", "save_storyboard_shots"], ["core-storyboard"]),
        profile("asset_prompt_writer", "设定师", ["read_storyboard", "read_characters", "upsert_asset_prompt"], ["core-asset-prompts"]),
    ];
}

export function compileScriptAgentInstructions(agentKey: ScriptAgentKey, selectedSkillIds: string[] = []) {
    const profileSeed = scriptAgentProfileDefaults().find((item) => item.agentKey === agentKey);
    if (!profileSeed) throw new Error("未知剧本 Agent");
    const ids = new Set([...profileSeed.skillBindings, ...selectedSkillIds]);
    const skills = BUILTIN_SCRIPT_SKILLS.filter((item) => ids.has(item.id) && item.agents.includes(agentKey));
    return skills.map((item) => `# ${item.name}\n\n${item.markdown}`).join("\n\n---\n\n");
}

function skill(id: string, name: string, category: BuiltinScriptSkill["category"], agents: ScriptAgentKey[], markdown: string): BuiltinScriptSkill {
    const content = `${markdown}\n\n执行要求：先读取当前项目与已确认上游成果，只处理本次明确范围；通过受控 Tool 写入，数据库保存成功后才能报告完成。失败必须指出具体项目，不得伪造进度或结果。`;
    return { id, name, description: markdown.slice(0, 100), category, agents, markdown: content, version: 1, contentHash: createHash("sha256").update(content).digest("hex") };
}
