import type { AdminGenerationOverviewDistribution, AdminGenerationOverviewSummary, AdminSuccessRateGroup, AdminSuccessRatePanel, SuccessRateRange } from "@/lib/admin-generation-overview";
import { SUCCESS_RATE_RANGES } from "@/lib/admin-generation-overview";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database";
import type { GenerationLogOverviewAggregate, GenerationLogOverviewBucket, GenerationLogSuccessRateAggregate } from "@/lib/server/database/content-repository";
import { kindLabel, readGenerationLogDb, sourceLabel } from "@/lib/server/generation-log-repository";
import type { StoredGenerationLog } from "@/lib/server/generation-log-types";

const OVERVIEW_DAYS = 7;
const OVERVIEW_TIME_ZONE = "Asia/Shanghai";
const OVERVIEW_UTC_OFFSET = "+08:00";
const SUCCESS_RATE_RANGE_DAYS: Record<SuccessRateRange, number> = { "1d": 1, "7d": 7, "30d": 30 };
const SUCCESS_RATE_CHANNEL_LIMIT = 8;

export async function getAdminGenerationOverviewSummary(now = new Date()): Promise<AdminGenerationOverviewSummary> {
    const window = generationOverviewWindow(now);
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const aggregate = await createPostgresRepositories().generationLogs.getOverviewAggregate({ startAt: window.startAt, endAt: window.endAt, timeZone: OVERVIEW_TIME_ZONE });
        return generationOverviewSummary(aggregate, window.dates);
    }
    const db = await readGenerationLogDb();
    return buildAdminGenerationOverviewSummary(db.logs, now);
}

export function buildAdminGenerationOverviewSummary(logs: StoredGenerationLog[], now = new Date()) {
    const window = generationOverviewWindow(now);
    return generationOverviewSummary(aggregateGenerationLogs(logs, window), window.dates);
}

export function successRateWindow(range: SuccessRateRange, now = new Date()) {
    const days = SUCCESS_RATE_RANGE_DAYS[range];
    const endDate = shanghaiDateKey(now);
    const startDate = addDateDays(endDate, -(days - 1));
    return {
        startAt: new Date(`${startDate}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
        endAt: new Date(`${addDateDays(endDate, 1)}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
        windowLabel: days === 1 ? "今天" : days === 7 ? "近 7 天" : "近 30 天",
    };
}

export function parseSuccessRateRange(value: string | null | undefined): SuccessRateRange {
    return SUCCESS_RATE_RANGES.includes(value as SuccessRateRange) ? (value as SuccessRateRange) : "7d";
}

export async function getAdminSuccessRatePanel(range: SuccessRateRange, now = new Date()): Promise<AdminSuccessRatePanel> {
    const window = successRateWindow(range, now);
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const aggregate = await createPostgresRepositories().generationLogs.getSuccessRateAggregate({ startAt: window.startAt, endAt: window.endAt });
        return successRatePanel(aggregate, range, window.windowLabel);
    }
    const db = await readGenerationLogDb();
    return buildAdminSuccessRatePanel(db.logs, range, now);
}

/** 文件 Provider 回退：只扫描一次窗口内日志，再在内存里分组。 */
export function buildAdminSuccessRatePanel(logs: StoredGenerationLog[], range: SuccessRateRange, now = new Date()) {
    const window = successRateWindow(range, now);
    const start = Date.parse(window.startAt);
    const end = Date.parse(window.endAt);
    const scoped = logs.filter((log) => {
        const createdAt = Date.parse(log.createdAt);
        return Number.isFinite(createdAt) && createdAt >= start && createdAt < end && ["image", "video", "text", "audio"].includes(log.kind);
    });
    const group = (keyOf: (log: StoredGenerationLog) => string) => {
        const groups = new Map<string, AdminSuccessRateGroup>();
        for (const log of scoped) {
            const key = keyOf(log).trim() || "未记录";
            const entry = groups.get(key) || { label: key, settled: 0, success: 0, failed: 0, pending: 0, successRate: null };
            if (log.status === "success") entry.success += 1;
            else if (log.status === "failed") entry.failed += 1;
            else entry.pending += 1;
            groups.set(key, entry);
        }
        return [...groups.values()].map(finishGroup).sort((left, right) => right.settled - left.settled || right.pending - left.pending || left.label.localeCompare(right.label, "zh-CN"));
    };
    const failures = new Map<string, number>();
    for (const log of scoped) {
        if (log.status !== "failed") continue;
        const reason = (log.error || "").trim();
        if (reason) failures.set(reason, (failures.get(reason) || 0) + 1);
    }
    const [topFailureReason, topFailureCount] = [...failures].sort((left, right) => right[1] - left[1])[0] || ["", 0];
    const aggregate: GenerationLogSuccessRateAggregate = {
        kinds: group((log) => log.kind).map(toAggregateRow),
        channels: group((log) => (log as StoredGenerationLog & { channelName?: string }).channelName || "未记录渠道").map(toAggregateRow),
        profiles: group((log) => ((log as StoredGenerationLog & { executionProfile?: string }).executionProfile === "open-source-practice" ? "open-source-practice" : "production")).map(toAggregateRow),
        topFailureReason,
        topFailureCount,
    };
    return successRatePanel(aggregate, range, window.windowLabel);
}

function toAggregateRow(group: AdminSuccessRateGroup) {
    return { key: group.label, total: group.settled + group.pending, success: group.success, failed: group.failed, pending: group.pending };
}

function finishGroup(group: AdminSuccessRateGroup): AdminSuccessRateGroup {
    const settled = group.success + group.failed;
    return { ...group, settled, successRate: settled ? Math.round((group.success / settled) * 100) : null };
}

function successRatePanel(aggregate: GenerationLogSuccessRateAggregate, range: SuccessRateRange, windowLabel: string): AdminSuccessRatePanel {
    // 类型按固定顺序给出，缺项的补 0，保证看板四行稳定。
    const kindKeys: Array<{ key: string; label: string }> = [
        { key: "image", label: kindLabel("image") },
        { key: "video", label: kindLabel("video") },
        { key: "text", label: kindLabel("text") },
        { key: "audio", label: kindLabel("audio") },
    ];
    const kindByKey = new Map(aggregate.kinds.map((item) => [item.key, item]));
    const kinds = kindKeys.map((item) => finishGroup(groupFromAggregate(item.label, kindByKey.get(item.key))));
    const channels = withOtherBucket(
        aggregate.channels.map((item) => finishGroup(groupFromAggregate(item.key, item))),
        SUCCESS_RATE_CHANNEL_LIMIT,
    );
    const profiles = aggregate.profiles.map((item) => finishGroup(groupFromAggregate(profileLabel(item.key), item)));
    return { range, windowLabel, kinds, channels: channels.groups, profiles, topFailureReason: aggregate.topFailureReason, topFailureCount: aggregate.topFailureCount, channelsMerged: channels.merged };
}

function groupFromAggregate(label: string, row: { total: number; success: number; failed: number; pending: number } | undefined): AdminSuccessRateGroup {
    return { label, settled: 0, success: row?.success || 0, failed: row?.failed || 0, pending: row?.pending || 0, successRate: null };
}

/** 渠道多于上限时，其余合并成「其他」，避免长尾把卡片撑爆。 */
function withOtherBucket(groups: AdminSuccessRateGroup[], limit: number) {
    if (groups.length <= limit) return { groups, merged: 0 };
    const kept = groups.slice(0, limit);
    const rest = groups.slice(limit);
    const other = rest.reduce((acc, item) => ({ label: "其他", settled: acc.settled, success: acc.success + item.success, failed: acc.failed + item.failed, pending: acc.pending + item.pending, successRate: null }), {
        label: "其他",
        settled: 0,
        success: 0,
        failed: 0,
        pending: 0,
        successRate: null,
    } as AdminSuccessRateGroup);
    return { groups: [...kept, finishGroup(other)], merged: rest.length };
}

function profileLabel(key: string) {
    return key === "open-source-practice" ? "无限练习" : "生产";
}

export function generationOverviewWindow(now: Date) {
    const endDate = shanghaiDateKey(now);
    const dates = Array.from({ length: OVERVIEW_DAYS }, (_, index) => addDateDays(endDate, index - (OVERVIEW_DAYS - 1)));
    return {
        dates,
        startAt: new Date(`${dates[0]}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
        endAt: new Date(`${addDateDays(endDate, 1)}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
    };
}

function aggregateGenerationLogs(logs: StoredGenerationLog[], window: ReturnType<typeof generationOverviewWindow>): GenerationLogOverviewAggregate {
    const start = Date.parse(window.startAt);
    const end = Date.parse(window.endAt);
    const scoped = logs.filter((log) => {
        const createdAt = Date.parse(log.createdAt);
        return Number.isFinite(createdAt) && createdAt >= start && createdAt < end;
    });
    return {
        totalCalls: scoped.length,
        successCalls: scoped.filter((log) => log.status === "success").length,
        failedCalls: scoped.filter((log) => log.status === "failed").length,
        activeUsers: new Set(scoped.map((log) => log.userId).filter(Boolean)).size,
        daily: countBuckets(scoped, (log) => shanghaiDateKey(new Date(log.createdAt))),
        models: countBuckets(scoped, (log) => log.model.trim() || "未记录模型").slice(0, 6),
        sources: countBuckets(scoped, (log) => log.source),
        kinds: countBuckets(scoped, (log) => log.kind),
    };
}

function generationOverviewSummary(aggregate: GenerationLogOverviewAggregate, dates: string[]): AdminGenerationOverviewSummary {
    const daily = new Map(aggregate.daily.map((item) => [item.key, item.value]));
    return {
        windowDays: OVERVIEW_DAYS,
        totalCalls: aggregate.totalCalls,
        successCalls: aggregate.successCalls,
        failedCalls: aggregate.failedCalls,
        activeUsers: aggregate.activeUsers,
        successRate: aggregate.totalCalls ? Math.round((aggregate.successCalls / aggregate.totalCalls) * 100) : 0,
        dailyCalls: dates.map((date) => ({ date, label: date.slice(5).replace("-", "/"), value: daily.get(date) || 0 })),
        modelDistribution: distribution(aggregate.models, (key) => key, aggregate.totalCalls),
        sourceDistribution: distribution(aggregate.sources, sourceLabel, aggregate.totalCalls),
        kindDistribution: distribution(aggregate.kinds, kindLabel, aggregate.totalCalls),
    };
}

function countBuckets<T>(items: T[], keyOf: (item: T) => string): GenerationLogOverviewBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = keyOf(item).trim() || "未记录";
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts, ([key, value]) => ({ key, value })).sort((left, right) => right.value - left.value || left.key.localeCompare(right.key, "zh-CN"));
}

function distribution(items: GenerationLogOverviewBucket[], labelOf: (key: string) => string, total: number): AdminGenerationOverviewDistribution[] {
    return items.slice(0, 6).map((item) => ({ label: labelOf(item.key), value: item.value, percent: total ? Math.round((item.value / total) * 100) : 0 }));
}

function shanghaiDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: OVERVIEW_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function addDateDays(date: string, days: number) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
