"use client";

import type { CSSProperties, ReactNode } from "react";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Timeline } from "@/components/gamma-ui/gamma-ant-display";
import { Tag } from "@/components/gamma-ui/gamma-ant";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION } from "@/constant/env";

const releaseTagColors: Record<string, string> = {
    Agent: "geekblue",
    生成: "green",
    上游: "cyan",
    创作: "magenta",
    "Canvas/短剧": "purple",
    作品: "gold",
    商业: "volcano",
    后台: "blue",
    界面: "lime",
    安全: "red",
    性能: "cyan",
    工程: "geekblue",
    安装: "orange",
    发布: "orange",
    "品牌/文档": "purple",
    新增: "green",
    修复: "red",
    优化: "cyan",
    调整: "blue",
    二开: "gold",
    致谢: "volcano",
    文档: "purple",
};

export function getReleaseTagColor(type: string) {
    return releaseTagColors[type] || "default";
}

function getReleaseTitle(version: string) {
    return version === "Unreleased" ? "未发布" : version;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
    label?: ReactNode;
};

export function VersionReleaseModal({ className, style, label }: VersionReleaseModalProps) {
    const { open, setOpen, openReleaseModal, latestVersion, releases, checking, hasNewVersion, checkLatestRelease } = useVersionCheck();

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-xs font-medium text-[var(--gm-text-3)] transition hover:text-[var(--gm-text)]"}
                style={style}
                onClick={openReleaseModal}
                title="查看版本更新"
            >
                {label || (
                    <span className="relative inline-flex">
                        {APP_VERSION}
                        {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
                    </span>
                )}
            </button>
            <Modal title="版本更新" open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[var(--gm-border)] p-3">
                        <div className="text-xs text-[var(--gm-text-3)]">当前版本</div>
                        <div className="mt-1 text-base font-semibold text-[var(--gm-text)]">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-lg border border-[var(--gm-border)] p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-[var(--gm-text-3)]">最新版本</div>
                            <button
                                type="button"
                                className="cursor-pointer bg-transparent p-0 text-[11px] font-normal text-[var(--gm-text-3)] underline-offset-2 transition hover:text-[var(--gm-text-2)] hover:underline"
                                onClick={() => void checkLatestRelease(true)}
                            >
                                {checking ? "检查中..." : "检查更新"}
                            </button>
                        </div>
                        <div className="mt-1 text-base font-semibold text-[var(--gm-text)]">{latestVersion}</div>
                    </div>
                </div>
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={releases.map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-[var(--gm-text)]">{getReleaseTitle(release.version)}</span>
                                        <span className="text-xs text-[var(--gm-text-3)]">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {release.version === latestVersion ? <Tag color="green">最新</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag>当前</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-[var(--gm-text-2)]">
                                                <Tag color={getReleaseTagColor(item.type)} className="m-0 mt-0.5 shrink-0 whitespace-nowrap">
                                                    {item.type}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
