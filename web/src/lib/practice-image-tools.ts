import { OUTPAINTING_TITLE } from "./practice-outpainting";

export const PRACTICE_IMAGE_TOOL_IDS = ["reverse-prompt", "local-edit", "expression-reference", "super-resolution", "ai-outpainting"] as const;

export type PracticeImageToolId = (typeof PRACTICE_IMAGE_TOOL_IDS)[number];

export type PracticeImageToolConfig = {
    id: PracticeImageToolId;
    title: string;
    description: string;
    path: `/practice/${PracticeImageToolId}`;
    tag: string;
    kind: "ai-text" | "ai-image-edit" | "local-image";
};

export const PRACTICE_IMAGE_TOOL_ENTRIES: readonly PracticeImageToolConfig[] = [
    { id: "reverse-prompt", title: "反推提示词", description: "从图片中分析主体、风格与画面细节，生成可编辑的提示词。", path: "/practice/reverse-prompt", tag: "图像理解", kind: "ai-text" },
    { id: "local-edit", title: "局部编辑", description: "涂抹需要修改的区域，描述调整内容并生成新图。", path: "/practice/local-edit", tag: "蒙版编辑", kind: "ai-image-edit" },
    { id: "expression-reference", title: "表情参考", description: "选择目标表情与强度，基于参考图片生成表情变化。", path: "/practice/expression-reference", tag: "表情编辑", kind: "ai-image-edit" },
    { id: "super-resolution", title: "超分放大", description: "本地提升图片尺寸与细节，不调用 AI 生成模型。", path: "/practice/super-resolution", tag: "本地处理", kind: "local-image" },
    { id: "ai-outpainting", title: OUTPAINTING_TITLE, description: "扩展原图边界，让 AI 补全新增画面。", path: "/practice/ai-outpainting", tag: "AI 图像编辑", kind: "ai-image-edit" },
];

export function getPracticeImageToolConfig(value: string): PracticeImageToolConfig | null {
    return PRACTICE_IMAGE_TOOL_ENTRIES.find((item) => item.id === value) || null;
}

export const LOCAL_EDIT_PROMPT_PREFIX = "只修改蒙版标示区域，其余区域尽量保持原样。";
export const LOCAL_EDIT_HISTORY_LIMIT = 5;

export type LocalEditPracticeRecord = {
    id: string;
    createdAt: number;
    model: string;
    prompt: string;
    sourceUrl: string;
    maskUrl: string;
    image: { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string };
};

export function localEditPromptExample(prompt: string) {
    return `只修改涂抹区域内原有的目标对象。修改要求：${prompt}\n保留不需要修改的形状、细节和背景，不把涂抹轮廓画进成品。`;
}
