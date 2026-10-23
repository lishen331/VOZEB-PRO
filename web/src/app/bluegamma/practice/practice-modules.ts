import { Box, Film, ImageIcon, Mic2, PanelsTopLeft, UserRound, type LucideIcon } from "lucide-react";

/**
 * 练习模块元数据，字段形状对照线上 app/(user)/practice/components/practice-home.tsx 的
 * PRACTICE_MODULES，这样设计稿定下来之后能直接套回真实页面。
 */
export type PracticeModuleKind = "character" | "scene" | "prop" | "storyboard-image" | "storyboard-video" | "dubbing";

export interface PracticeModuleMeta {
    module: PracticeModuleKind;
    title: string;
    description: string;
    icon: LucideIcon;
    accentChip: string;
    accentText: string;
    /** 创作输入面板的提示词占位文案，贴合该模块实际练习内容 */
    promptPlaceholder: string;
    /** 该模块是否需要参考图（分镜图、分镜视频都需要） */
    needsReference: boolean;
    /** 视图/风格切换的分段选项；没有则不渲染分段控件 */
    variants?: readonly { value: string; label: string }[];
}

export const PRACTICE_MODULE_META: readonly PracticeModuleMeta[] = [
    {
        module: "character",
        title: "角色",
        description: "生成角色主体图，并继续扩展多视角设定。",
        icon: UserRound,
        accentChip: "bg-[rgba(139,92,246,0.16)]",
        accentText: "text-[#9b7cf6]",
        promptPlaceholder: "描述外观、服装、气质和视觉风格",
        needsReference: false,
        variants: [
            { value: "main", label: "主形象" },
            { value: "multi", label: "多视图" },
        ],
    },
    {
        module: "scene",
        title: "场景",
        description: "建立空间、光线和环境氛围。",
        icon: PanelsTopLeft,
        accentChip: "bg-[rgba(56,189,248,0.14)]",
        accentText: "text-[#38a5e0]",
        promptPlaceholder: "描述空间类型、光线方向和环境氛围",
        needsReference: false,
    },
    {
        module: "prop",
        title: "道具",
        description: "把关键物件设定成可用素材。",
        icon: Box,
        accentChip: "bg-[rgba(45,212,191,0.14)]",
        accentText: "text-[#14b8a6]",
        promptPlaceholder: "描述物件外形、材质和用途",
        needsReference: false,
    },
    {
        module: "storyboard-image",
        title: "分镜图",
        description: "组合场景、角色和道具完成镜头画面。",
        icon: ImageIcon,
        accentChip: "bg-[var(--gm-accent-soft)]",
        accentText: "text-[var(--gm-accent)]",
        promptPlaceholder: "描述镜头构图、机位和画面内容",
        needsReference: true,
    },
    {
        module: "storyboard-video",
        title: "分镜视频",
        description: "让静态分镜进入动态镜头。",
        icon: Film,
        accentChip: "bg-[rgba(0,80,245,0.16)]",
        accentText: "text-[var(--gm-blue-text)]",
        promptPlaceholder: "描述镜头运动方式和时长",
        needsReference: true,
    },
    {
        module: "dubbing",
        title: "音频",
        description: "为台词和旁白生成情绪化配音。",
        icon: Mic2,
        accentChip: "bg-[rgba(99,102,241,0.16)]",
        accentText: "text-[#7c83f5]",
        promptPlaceholder: "填写台词或旁白文本，并描述情绪语气",
        needsReference: false,
    },
];

export function practiceModuleMeta(module: string): PracticeModuleMeta | undefined {
    return PRACTICE_MODULE_META.find((item) => item.module === module);
}
