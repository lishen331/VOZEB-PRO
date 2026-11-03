import type { LabModel, LabUploadItem } from "@/components/vz-lab";

// Local-only preview data. Nothing here is sent to an API or written to the database.
export const IMG = {
    a: "/style-thumbs/3d-render.jpg",
    b: "/style-thumbs/anime.jpg",
    c: "/style-thumbs/2d-gufeng.jpg",
    d: "/style-thumbs/cartoon.jpg",
    e: "/style-thumbs/2d-animation.jpg",
    hero: "/login/hero-poster.webp",
    video: "/login/hero.mp4",
};

export const MODELS: LabModel[] = [
    { id: "m1", name: "Seedream 4.5", vendor: "ByteDance", desc: "写实与商业摄影，中文理解强", cost: 8, badge: "推荐", fast: true },
    { id: "m2", name: "GPT Image 2", vendor: "OpenAI", desc: "精准排版与文字渲染", cost: 12, badge: "新" },
    { id: "m3", name: "FLUX 1.1 Pro Ultra", vendor: "Black Forest Labs", desc: "高细节、强构图控制，适合概念设计与海报", cost: 10 },
    { id: "m4", name: "Kling 2.5", vendor: "Kuaishou", desc: "图生图风格迁移", cost: 6, fast: true },
    { id: "m5", name: "Midjourney v7", vendor: "Midjourney", desc: "艺术化风格", cost: 15, disabled: true, disabledReason: "当前套餐不可用" },
];

export const UPLOADS: LabUploadItem[] = [
    { id: "u1", src: IMG.a, name: "角色参考.jpg", status: "done" },
    { id: "u2", src: IMG.c, name: "场景参考.jpg", status: "uploading", progress: 64 },
    { id: "u3", src: IMG.d, name: "超出大小.jpg", status: "error" },
];

export const SUGGESTIONS = ["电影感", "赛博朋克", "柔和晨光", "国风水墨", "微距特写"];

export const GALLERY = [
    { id: "g1", src: IMG.a, title: "霓虹雨夜中的机械少女", meta: "Seedream 4.5 · 16:9 · 2 分钟前", tag: "精选" },
    { id: "g2", src: IMG.b, title: "樱花下的少年剑客，动画分镜第 3 帧", meta: "Kling 2.5 · 3:4 · 12 分钟前" },
    { id: "g3", src: IMG.c, title: "山水长卷 · 远山与孤舟", meta: "FLUX Ultra · 4:3 · 昨天" },
    { id: "g4", src: IMG.e, title: "儿童绘本封面：森林里的小狐狸", meta: "GPT Image 2 · 1:1 · 3 天前" },
];

export const PROMPT = "一位身穿银色机能风外套的少女站在霓虹灯闪烁的雨夜街头，背景是层叠的全息广告牌，地面倒映着紫色与青色的光，35mm 镜头。";
