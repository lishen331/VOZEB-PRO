import type { WorkCategory } from "./work-publication-options";

export function normalizeOfficialCategory(value: string): WorkCategory {
    const category = value.trim();
    if (["视觉设计", "插画", "摄影", "品牌内容", "视频", "短剧", "其他"].includes(category)) return category as WorkCategory;
    if (category.startsWith("05_") && (category.includes("短视频") || category.includes("Vlog"))) return "视频";
    if (category.startsWith("01_") || category.startsWith("04_") || category.startsWith("06_") || category.startsWith("08_") || category.startsWith("11_") || category.startsWith("13_") || category.includes("建筑") || category.includes("室内"))
        return "视觉设计";
    if (category.startsWith("02_") || category.startsWith("05_") || category.includes("人物肖像") || category.includes("写实摄影") || category.includes("生活时尚")) return "摄影";
    if (category.startsWith("03_") || category.startsWith("14_") || category.startsWith("15_") || category.includes("广告") || category.includes("电商") || category.includes("社交媒体")) return "品牌内容";
    if (category.startsWith("07_") || category.startsWith("09_") || category.startsWith("10_") || category.startsWith("12_") || category.includes("分镜") || category.includes("动漫") || category.includes("游戏")) return "插画";
    return "其他";
}

export function cleanOfficialWorkTitle(value: string) {
    return value
        .trim()
        .replace(/_[a-z0-9]{6,16}$/i, "")
        .trim();
}
