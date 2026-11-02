"use client";

import type { ReactNode } from "react";
import { AdminAccountId } from "@/components/admin/admin-user-identity";
import { createDefaultChannelAdvancedConfig } from "@/components/admin/admin-system-channel-editor";
import { applyChannelProtocol } from "@/lib/channel-protocol-registry";
import { formatCreditAmount } from "@/constant/credits";
import type { CreatedCdkCode, PublicCdkCode, SystemChannelAdvancedConfig, SystemModelChannel } from "@/lib/auth/store";
import { nanoid } from "nanoid";
import { urlHostMatches, urlPathStartsWith } from "@/lib/url-host";

export const settingsStatusToneClass = {
    cyan: "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[color-mix(in_srgb,var(--gm-accent)_25%,transparent)]",
    blue: "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)] ring-[color-mix(in_srgb,var(--gm-accent)_25%,transparent)]",
    emerald: "bg-[color-mix(in_srgb,var(--gm-success)_10%,transparent)] text-[var(--gm-success)] ring-[color-mix(in_srgb,var(--gm-success)_25%,transparent)]",
    amber: "bg-[color-mix(in_srgb,var(--gm-warning)_10%,transparent)] text-[var(--gm-warning)] ring-[color-mix(in_srgb,var(--gm-warning)_25%,transparent)]",
};

export function SettingsStatusTile({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: keyof typeof settingsStatusToneClass }) {
    return (
        <div className="min-w-0 rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                <div className="min-w-0">
                    <div className="text-[11px] font-medium text-[var(--gm-text-3)] sm:text-xs">{label}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-[var(--gm-text)] sm:mt-2 sm:text-base">{value}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--gm-text-3)] sm:mt-1 sm:text-xs">{detail}</div>
                </div>
                <span className={"flex size-7 shrink-0 items-center justify-center rounded-md ring-1 [&>svg]:size-3.5 sm:size-9 sm:rounded-lg sm:[&>svg]:size-4 " + settingsStatusToneClass[tone]}>{icon}</span>
            </div>
        </div>
    );
}

export function SettingsAnchorItem({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail: string }) {
    return (
        <a
            href={href}
            className="group flex min-w-0 items-center gap-1 rounded-md px-2 py-2 text-left transition hover:bg-[var(--gm-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-border-strong)] sm:gap-3 sm:px-3 sm:py-2.5"
        >
            <span className="flex size-5 shrink-0 items-center justify-center text-[var(--gm-text-2)] transition [&>svg]:size-3 sm:size-8 sm:[&>svg]:size-4 group-hover:text-[var(--gm-text)]">{icon}</span>
            <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--gm-text)] sm:text-sm">{title}</span>
                <span className="mt-0.5 hidden truncate text-xs text-[var(--gm-text-3)] sm:block">{detail}</span>
            </span>
        </a>
    );
}

export function FinanceFlowItem({ title, amount, description, icon }: { title: string; amount: string; description: string; icon: ReactNode }) {
    return (
        <div className="rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                <div>
                    <div className="text-xs text-[var(--gm-text-3)] sm:text-sm">{title}</div>
                    <div className="mt-1 text-lg font-semibold tracking-normal text-[var(--gm-text)] sm:mt-2 sm:text-2xl">{amount}</div>
                </div>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)] [&>svg]:size-3.5 sm:size-9 sm:rounded-lg sm:[&>svg]:size-4">{icon}</span>
            </div>
            <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--gm-text-3)] sm:mt-3 sm:line-clamp-none sm:text-sm sm:leading-6">{description}</div>
        </div>
    );
}

export function FinanceMiniRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--gm-text-2)]">{label}</span>
            <span className="font-semibold text-[var(--gm-text)]">{value}</span>
        </div>
    );
}

export function createSystemChannel(): SystemModelChannel {
    return applyChannelProtocol({ id: nanoid(), name: "新接口", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false, advancedConfig: createDefaultChannelAdvancedConfig() }, "openai");
}

export function suggestedChannelModels(channel: Pick<SystemModelChannel, "baseUrl" | "name">) {
    const name = channel.name.toLowerCase();
    if (name.includes("globalaiopc") || urlHostMatches(channel.baseUrl, "globalaiopc.com")) return ["videos", "videos_stable", "videos_stable_fast"];
    if (name.includes("seedance") || urlHostMatches(channel.baseUrl, "volces.com") || urlPathStartsWith(channel.baseUrl, "/api/plan/v3")) return ["doubao-seedance-1-0-lite-t2v", "doubao-seedance-1-0-lite-i2v"];
    return [];
}

export type AdminModelsResult = {
    models: string[];
    modelCapabilities?: SystemChannelAdvancedConfig["modelCapabilities"];
    modelConfigs?: SystemChannelAdvancedConfig["modelConfigs"];
    recommendedConfig?: Partial<SystemChannelAdvancedConfig>;
    discoveredCount?: number;
    totalCount?: number;
    warning?: string;
    globalAiOpcPresets?: SystemChannelAdvancedConfig["globalAiOpcPresets"];
};

export async function requestAdminModels(channel: SystemModelChannel): Promise<AdminModelsResult> {
    const advanced = channel.advancedConfig;
    const response = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            channelId: channel.id,
            baseUrl: channel.baseUrl,
            apiKey: channel.apiKey,
            apiFormat: channel.apiFormat,
            protocol: advanced?.protocol,
            authMode: advanced?.authMode,
            authHeader: advanced?.authHeader,
            authPrefix: advanced?.authPrefix,
            globalAiOpcPreset: advanced?.globalAiOpcPreset,
            globalAiOpcPresets: advanced?.globalAiOpcPresets,
            createPath: advanced?.createPath,
            modelCatalogPaths: advanced?.modelCatalogPaths,
            configuredModels: channel.models,
            modelCapabilities: advanced?.modelCapabilities,
            modelConfigs: advanced?.modelConfigs,
            operationConfigs: advanced?.operationConfigs,
        }),
    });
    const payload = (await response.json()) as AdminModelsResult & { error?: string };
    if (!response.ok || !payload.models) throw new Error(payload.error || "拉取模型失败");
    return payload;
}

export function modelNameFromOption(value: string) {
    const normalized = value.trim();
    if (!normalized) return "";
    const parts = normalized.split("::");
    return parts[parts.length - 1] || normalized;
}

export function isCdkExpired(code: PublicCdkCode) {
    return Boolean(code.expiresAt && Date.parse(code.expiresAt) <= Date.now());
}

export function cdkStatusLabel(code: PublicCdkCode) {
    if (!code.code) return "明文缺失";
    if (isCdkExpired(code)) return "已过期";
    if (code.status !== "active") return "不可用";
    if (code.redeemedCount >= code.maxRedemptions) return "已兑完";
    return code.redeemedCount > 0 ? "部分兑换" : "未兑换";
}

export function cdkStatusTone(code: PublicCdkCode) {
    if (!code.code || isCdkExpired(code) || code.status !== "active") return "default";
    if (code.redeemedCount >= code.maxRedemptions) return "green";
    return code.redeemedCount > 0 ? "blue" : "gold";
}

export function formatCreatedCdkExport(codes: CreatedCdkCode[], siteTitle: string) {
    const lines = [
        `${siteTitle} CDK 导出`,
        `导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        `数量：${codes.length}`,
        "",
        ...codes.map((code, index) =>
            [
                `${index + 1}. ${code.code}`,
                `积分：${formatCreditAmount(code.points)}`,
                `可兑换次数：${code.maxRedemptions}`,
                `有效期：${code.expiresAt ? new Date(code.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "长期有效"}`,
                code.note ? `备注：${code.note}` : "",
            ]
                .filter(Boolean)
                .join(" | "),
        ),
        "",
        "说明：仅导出本次生成且可复制的明文 CDK。",
    ];
    return lines.join("\n");
}

export function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function CdkRedemptionDetail({ code }: { code: PublicCdkCode }) {
    const redemptions = [...code.redemptions].sort((a, b) => Date.parse(b.redeemedAt) - Date.parse(a.redeemedAt));
    const visibleRedemptions = redemptions.slice(0, 20);

    return (
        <div className="rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash)] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--gm-text)]">兑换明细</div>
                <div className="text-xs text-[var(--gm-text-3)]">
                    共 {redemptions.length} 条{redemptions.length > visibleRedemptions.length ? "，展示最近 20 条" : ""}
                </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleRedemptions.map((item) => (
                    <div key={`${item.userId}-${item.redeemedAt}`} className="min-w-0 rounded-md border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3">
                        <div className="truncate text-sm font-medium text-[var(--gm-text)]">
                            {item.displayName}
                            <span className="ml-1 font-normal text-[var(--gm-text-2)]">@{item.username}</span>
                        </div>
                        <AdminAccountId accountId={item.accountId} className="mt-0.5" />
                        <div className="mt-1 text-xs text-[var(--gm-text-3)]">{new Date(item.redeemedAt).toLocaleString("zh-CN")}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function splitTags(value?: string) {
    return (value || "")
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number) {
    const numberValue = Math.floor(Number(value));
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(min, Math.min(max, numberValue));
}
