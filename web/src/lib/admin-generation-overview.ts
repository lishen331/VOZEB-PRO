export type AdminGenerationOverviewDistribution = {
    label: string;
    value: number;
    percent: number;
};

export type AdminGenerationOverviewSummary = {
    windowDays: number;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    activeUsers: number;
    successRate: number;
    dailyCalls: Array<{ date: string; label: string; value: number }>;
    modelDistribution: AdminGenerationOverviewDistribution[];
    sourceDistribution: AdminGenerationOverviewDistribution[];
    kindDistribution: AdminGenerationOverviewDistribution[];
};

export function emptyAdminGenerationOverviewSummary(): AdminGenerationOverviewSummary {
    return {
        windowDays: 7,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        activeUsers: 0,
        successRate: 0,
        dailyCalls: [],
        modelDistribution: [],
        sourceDistribution: [],
        kindDistribution: [],
    };
}

export const SUCCESS_RATE_RANGES = ["1d", "7d", "30d"] as const;
export type SuccessRateRange = (typeof SUCCESS_RATE_RANGES)[number];

export type AdminSuccessRateGroup = {
    label: string;
    /** 已结束（成功 + 失败）的调用数，成功率的分母。 */
    settled: number;
    success: number;
    failed: number;
    pending: number;
    /** 分母为 0 时为 null，界面显示「—」而不是 0%。 */
    successRate: number | null;
};

export type AdminSuccessRatePanel = {
    range: SuccessRateRange;
    windowLabel: string;
    kinds: AdminSuccessRateGroup[];
    channels: AdminSuccessRateGroup[];
    profiles: AdminSuccessRateGroup[];
    /** 失败最多的原因与次数，没有失败时为空字符串 / 0。 */
    topFailureReason: string;
    topFailureCount: number;
    /** 渠道分组超过上限时合并为「其他」，这里给出被合并的条数。 */
    channelsMerged: number;
};

export function emptyAdminSuccessRatePanel(range: SuccessRateRange = "7d"): AdminSuccessRatePanel {
    return { range, windowLabel: "", kinds: [], channels: [], profiles: [], topFailureReason: "", topFailureCount: 0, channelsMerged: 0 };
}

export function successRatePercent(success: number, failed: number) {
    const settled = success + failed;
    return settled ? Math.round((success / settled) * 100) : null;
}
