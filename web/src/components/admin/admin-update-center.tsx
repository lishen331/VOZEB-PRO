import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck, UsersRound } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { VOZEB_QQ_GROUP_URL } from "@/constant/community";
import { APP_VERSION } from "@/constant/env";
import { resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function UpdateCenterPanel() {
    const siteTitle = usePublicSessionStore((state) => resolveSiteTitle(state.payload?.settings?.site?.title));
    const releaseLinks = [
        { label: "Release", href: "https://github.com/csyqlz/VOZEB-PRO/releases", description: "查看正式版本包和升级说明" },
        { label: "Issues", href: "https://github.com/csyqlz/VOZEB-PRO/issues", description: "提交问题、部署异常和功能建议" },
        { label: "Docs", href: "https://github.com/csyqlz/VOZEB-PRO", description: "查看开源仓库与部署入口" },
    ];
    const upgradeChecks = ["备份 PostgreSQL 数据库", "确认 .env / Docker 环境变量", "阅读 CHANGELOG 破坏性变更", "保留当前版本回滚方式"];
    return (
        <Panel>
            <PanelHeader title="更新中心" description="版本检查、升级准备、更新日志和 GitHub 仓库入口集中放在这里。" actions={<GitHubLink className="rounded-xl" />} />
            <div className="space-y-3 p-3 sm:space-y-5 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                    {/* 品牌蓝块面上的次级文字/底保留 white/alpha：gamma-ui 暂无「蓝底次级文字」令牌 */}
                    <div className="overflow-hidden rounded-3xl border border-[var(--gm-border)] bg-[var(--gm-blue)] text-white shadow-sm">
                        <div className="grid gap-3 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">{siteTitle} Update</div>
                                <h3 className="mt-2 text-2xl font-semibold tracking-normal sm:mt-4 sm:text-3xl">可升级，也可回滚。</h3>
                                <div className="mt-2 max-w-2xl text-xs leading-5 text-white/68 sm:mt-3 sm:text-sm sm:leading-6">商业化部署升级前先确认数据库备份、环境变量和变更日志；服务器安装用户可以在这里集中完成版本检查与资料跳转。</div>
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
                                    <VersionReleaseModal className="admin-update-primary-button inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition sm:h-10 sm:rounded-xl sm:px-4 sm:text-sm" label="查看更新日志" />
                                    <a
                                        href="https://github.com/csyqlz/VOZEB-PRO/releases"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-update-secondary-link inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm"
                                    >
                                        <ExternalLink className="size-4" />
                                        打开 Release
                                    </a>
                                    <a
                                        href={VOZEB_QQ_GROUP_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-update-secondary-link col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition sm:col-auto sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm"
                                    >
                                        <UsersRound className="size-4" />
                                        加入 QQ 群
                                    </a>
                                </div>
                            </div>
                            <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/12 sm:rounded-2xl sm:p-4">
                                <div className="text-xs text-white/55">当前版本</div>
                                <div className="mt-1 text-2xl font-semibold tracking-normal sm:mt-2 sm:text-3xl">{APP_VERSION}</div>
                                <div className="mt-2 line-clamp-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] leading-[18px] text-white/65 sm:mt-4 sm:line-clamp-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs sm:leading-5">
                                    点击“查看更新日志”会读取远端 VERSION 与 CHANGELOG，并在弹窗中展示差异。
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-[var(--gm-border)] bg-[var(--gm-wash)] p-3 sm:rounded-3xl sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-[var(--gm-text)]">升级准备</div>
                                <div className="mt-1 text-xs leading-5 text-[var(--gm-text-3)]">生产环境升级前建议逐项确认。</div>
                            </div>
                            <ShieldCheck className="size-5 text-[var(--gm-text-2)]" />
                        </div>
                        <div className="mt-3 divide-y divide-[var(--gm-border)] sm:mt-4 sm:space-y-2 sm:divide-y-0">
                            {upgradeChecks.map((item) => (
                                <div key={item} className="flex items-center gap-2 py-2 text-xs text-[var(--gm-text-2)] sm:rounded-2xl sm:bg-[var(--gm-surface)] sm:px-3 sm:text-sm sm:ring-1 sm:ring-[var(--gm-border)]">
                                    <CheckCircle2 className="size-3.5 text-[var(--gm-text-2)] sm:size-4" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {releaseLinks.map((item) => (
                        <a key={item.label} href={item.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-[var(--gm-border)] bg-[var(--gm-surface)] p-3 transition hover:-translate-y-0.5 hover:shadow-sm sm:rounded-3xl sm:p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-semibold text-[var(--gm-text)]">{item.label}</div>
                                <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--gm-wash)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)] transition group-hover:bg-[var(--gm-blue)] group-hover:text-white sm:size-9 sm:rounded-2xl">
                                    <ArrowRight className="size-4" />
                                </span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[var(--gm-text-3)] sm:mt-3 sm:text-sm sm:leading-6">{item.description}</div>
                        </a>
                    ))}
                </div>
            </div>
        </Panel>
    );
}
