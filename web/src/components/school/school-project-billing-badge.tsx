"use client";

import { Tag } from "antd";
import { CircleDollarSign } from "lucide-react";
import { useEffect, useState } from "react";

import type { SchoolProjectBillingSummary } from "@/services/api/school-compute";
import { schoolComputeApi } from "@/services/api/school-compute";

export function SchoolProjectBillingBadge({ surface, projectId, executionProfile = "production" }: { surface: "canvas" | "drama"; projectId: string; executionProfile?: string }) {
    const [summary, setSummary] = useState<SchoolProjectBillingSummary | undefined>();
    useEffect(() => {
        if (!projectId || executionProfile === "open-source-practice") return;
        let cancelled = false;
        void schoolComputeApi
            .getSchoolProjectBilling(surface, projectId)
            .then((value) => {
                if (!cancelled) setSummary(value);
            })
            .catch(() => {
                if (!cancelled) setSummary(undefined);
            });
        return () => {
            cancelled = true;
        };
    }, [executionProfile, projectId, surface]);
    if (executionProfile === "open-source-practice" || !summary) return null;
    const source = summary.chargeSource === "group_school_points" ? "学校小组算力" : "个人永久积分垫付";
    return (
        <div data-school-project-billing-badge className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <CircleDollarSign className="size-3.5 text-zinc-500" />
            <span className="font-medium">{source}</span>
            {summary.schoolName ? <span className="text-zinc-500">学校：{summary.schoolName}</span> : null}
            {summary.groupName ? <span className="text-zinc-500">小组：{summary.groupName}</span> : null}
            {summary.orderTitle ? <span className="text-zinc-500">商单：{summary.orderTitle}</span> : null}
            {typeof summary.availablePoints === "number" ? <Tag color="blue">可用 {summary.availablePoints.toFixed(2)} 点</Tag> : null}
            <span className="text-zinc-500">预计扣费来源：{source}</span>
        </div>
    );
}
