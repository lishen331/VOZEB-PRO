import type { WorkCategory } from "./work-publication-options";

export function normalizeOfficialCategory(value: string): WorkCategory {
    const category = value.trim();
    if (category.startsWith("01_") || category.includes("建筑") || category.includes("室内")) return "视觉设计";
    if (category.startsWith("02_") || category.includes("广告") || category.includes("电商")) return "品牌内容";
    if (category.startsWith("03_") || category.includes("电影") || category.includes("影视")) return "视频";
    if (category.startsWith("04_") || category.includes("动漫") || category.includes("游戏")) return "插画";
    if (category.startsWith("05_") || category.includes("短视频") || category.includes("Vlog")) return "视频";
    return "其他";
}

export function cleanOfficialWorkTitle(value: string) {
    return value
        .trim()
        .replace(/_[a-z0-9]{6,16}$/i, "")
        .trim();
}
