import type { WorkPublicationModerationStatus, WorkPublicationSourceType, WorkPublicationVisibility } from "@/services/api/work-publications";

export { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";

export const WORK_STATUS_OPTIONS: Array<{ value: WorkPublicationModerationStatus | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "draft", label: "草稿" },
    { value: "pending", label: "审核中" },
    { value: "approved", label: "已通过" },
    { value: "rejected", label: "已驳回" },
    { value: "taken_down", label: "已下架" },
];

export const SOURCE_TYPE_LABELS: Record<WorkPublicationSourceType, string> = {
    media: "素材",
    canvas: "画布",
    drama: "短剧",
};

/**
 * 当前对外可见的发布来源（只控制显示，不删除实现）。
 *
 * 短剧、视频、音频的代码与接口都还在，只是先不露出；
 * 后续功能补齐后把对应值加回这个数组即可重新开放。
 * 现阶段的目标是先跑通「图片发布」这一条最小链路。
 */
export const VISIBLE_SOURCE_TYPES: readonly WorkPublicationSourceType[] = ["media", "canvas"];

export function visibleSourceTypeOptions() {
    return VISIBLE_SOURCE_TYPES.map((value) => ({ value, label: SOURCE_TYPE_LABELS[value] }));
}

export const VISIBILITY_LABELS: Record<WorkPublicationVisibility, string> = {
    private: "仅自己可见",
    unlisted: "仅链接分享（不进入广场）",
    public: "公开到作品广场",
};

export function workStatusLabel(status: WorkPublicationModerationStatus) {
    return WORK_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

export function formatWorkTime(value?: string) {
    if (!value) return "暂无";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function workSharePath(slug: string) {
    return `/share/${encodeURIComponent(slug)}`;
}
