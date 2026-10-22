import { Box, Clapperboard, Film, Image as ImageIcon, Maximize2, Mic2, PanelsTopLeft, ScrollText, UserRound, type LucideIcon } from "lucide-react";

import type { GammaTaskStatus } from "@/components/gamma-ui/gamma-cards";
import type { SubjectAccent } from "@/components/gamma-ui/gamma-subjects";

/*
 * 无限练习 · 设计稿数据（本地模拟，不调接口）。
 * 字段形状贴合线上 PRACTICE_PROJECT_CARDS / PRACTICE_MODULES（见 app/(user)/practice/components/practice-home.tsx），
 * 这样设计稿定下来之后，接回真实页面时结构能直接对上，不用重新设计字段。
 */

export interface PracticeProjectCardSpec {
    kind: "canvas" | "drama";
    title: string;
    description: string;
    icon: LucideIcon;
    accent: SubjectAccent;
    recent: { id: string; title: string; updatedAt: string }[];
}

export const PRACTICE_PROJECT_CARDS: readonly PracticeProjectCardSpec[] = [
    {
        kind: "canvas",
        title: "无限画布",
        description: "自由组合文字、图片、视频和音频，练习节点式创作。",
        icon: Maximize2,
        accent: "cyan",
        recent: [
            { id: "p1", title: "新中式服装分镜画布", updatedAt: "12 分钟前" },
            { id: "p2", title: "雨夜霓虹概念板", updatedAt: "昨天" },
            { id: "p3", title: "毕设展板草稿", updatedAt: "3 天前" },
        ],
    },
    {
        kind: "drama",
        title: "无限短剧",
        description: "从剧本、分镜到镜头，完整练习一条短剧制作流程。",
        icon: Clapperboard,
        accent: "violet",
        recent: [
            { id: "d1", title: "教室分镜短片", updatedAt: "1 小时前" },
            { id: "d2", title: "东北农村题材练习", updatedAt: "2 天前" },
        ],
    },
];

export interface PracticeModuleSpec {
    module: string;
    title: string;
    description: string;
    icon: LucideIcon;
    accent: SubjectAccent;
    doneCount: number;
    /** 单人·纯文本练习（剧本），和视觉素材类模块区分一下输出形态 */
    tag?: string;
}

/**
 * 练习模块：按 doneCount 降序排列，用量最高的两个在 practice-view.tsx 里做跨列宽卡（bento 排版）。
 * 「剧本」原来是单独区块，这里并入同一张网格，不再孤立成区。
 */
/**
 * 顺序即渲染顺序：3 列网格里两张宽卡（分镜图、角色）不能相邻，各自搭一张小卡凑满一行，
 * 否则 CSS Grid 的默认 auto-flow 会在每张宽卡右侧各留一个回填不到的空位。
 * 行 1：分镜图(宽) + 剧本；行 2：角色(宽) + 场景；行 3：音频 + 道具 + 分镜视频。
 */
export const PRACTICE_MODULES: readonly PracticeModuleSpec[] = [
    { module: "storyboard-image", title: "分镜图", description: "组合场景、角色和道具完成镜头画面。", icon: ImageIcon, accent: "cyan", doneCount: 20 },
    { module: "script", title: "剧本", description: "从创意到剧本文本的单人练习。", icon: ScrollText, accent: "teal", doneCount: 4, tag: "单人 · 文本" },
    { module: "character", title: "角色", description: "生成角色主体图，并继续扩展多视角设定。", icon: UserRound, accent: "violet", doneCount: 12 },
    { module: "scene", title: "场景", description: "建立空间、光线和环境氛围。", icon: PanelsTopLeft, accent: "sky", doneCount: 8 },
    { module: "dubbing", title: "音频", description: "为台词和旁白生成情绪化配音。", icon: Mic2, accent: "indigo", doneCount: 7 },
    { module: "prop", title: "道具", description: "把关键物件设定成可用素材。", icon: Box, accent: "teal", doneCount: 5 },
    { module: "storyboard-video", title: "分镜视频", description: "让静态分镜进入动态镜头。", icon: Film, accent: "blue", doneCount: 3 },
];

/** 占 2 列宽卡的模块（用量最高的两个）；其余按小卡渲染 */
export const PRACTICE_WIDE_MODULES: readonly string[] = ["storyboard-image", "character"];

export interface PracticeSessionSpec {
    id: string;
    module: string;
    moduleLabel: string;
    title: string;
    status: GammaTaskStatus;
    progress: number;
    etaSeconds?: number;
    cover?: string;
    updatedAt: string;
}

const THUMB = "/style-thumbs";

export const PRACTICE_SESSIONS: readonly PracticeSessionSpec[] = [
    { id: "s1", module: "storyboard-image", moduleLabel: "分镜图", title: "雾港 · 镜头 14 推近", status: "running", progress: 62, etaSeconds: 18, updatedAt: "刚刚" },
    { id: "s2", module: "character", moduleLabel: "角色", title: "新中式女装系列 · 第 3 套", status: "done", progress: 100, cover: `${THUMB}/realistic.jpg`, updatedAt: "6 分钟前" },
    { id: "s3", module: "dubbing", moduleLabel: "音频", title: "旁白 · 第二幕开场", status: "done", progress: 100, cover: `${THUMB}/anime.jpg`, updatedAt: "22 分钟前" },
    { id: "s4", module: "storyboard-video", moduleLabel: "分镜视频", title: "教室分镜 · 推轨镜头", status: "failed", progress: 0, updatedAt: "1 小时前" },
    { id: "s5", module: "scene", moduleLabel: "场景", title: "雨夜霓虹 · 街景氛围", status: "done", progress: 100, cover: `${THUMB}/cinematic.jpg`, updatedAt: "昨天" },
    { id: "s6", module: "prop", moduleLabel: "道具", title: "青花瓷瓶 · 三视图", status: "done", progress: 100, cover: `${THUMB}/comic.jpg`, updatedAt: "昨天" },
];

export const PRACTICE_STATS = [
    { label: "累计练习", value: 55, delta: "+6 本周" },
    { label: "已保存素材", value: 128, delta: "+14 本周" },
    { label: "当前连续天数", value: "7 天", delta: undefined },
] as const;
