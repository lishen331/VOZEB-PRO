import type { GammaTaskStatus } from "@/components/gamma-ui/gamma-cards";

/** 工作台右侧「历史生成」的模拟数据，字段贴合 GammaTaskCard props */
export interface StudioHistoryItem {
    id: string;
    title: string;
    meta: string;
    status: GammaTaskStatus;
    progress: number;
    cover?: string;
}

const THUMB = "/style-thumbs";

/*
 * style-thumbs/ 下的图是按风格流派命名（realistic/cinematic/...），不是按题材分类，
 * 不能直接套到具体业务标题上（例如 realistic.jpg 实际是一张男性人像写真，配不上「新中式女装」）。
 * 这里标题就写成风格本身，和缩略图内容保持一致。
 */
export const STUDIO_HISTORY: readonly StudioHistoryItem[] = [
    { id: "h1", title: "写实人像 · 效果图", meta: "服装设计 · 6 分钟前", status: "done", progress: 100, cover: `${THUMB}/realistic.jpg` },
    { id: "h2", title: "电影质感 · 分镜测试", meta: "影视制作 · 22 分钟前", status: "done", progress: 100, cover: `${THUMB}/cinematic.jpg` },
    { id: "h3", title: "极简风景 · 氛围图", meta: "室内设计 · 1 小时前", status: "done", progress: 100, cover: `${THUMB}/minimalist.jpg` },
    { id: "h4", title: "教室分镜 · 推轨镜头", meta: "动漫制作 · 2 小时前", status: "failed", progress: 0 },
];
