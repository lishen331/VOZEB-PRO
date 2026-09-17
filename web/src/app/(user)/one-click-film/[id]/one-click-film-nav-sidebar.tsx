"use client";

import { Button, Tooltip } from "antd";
import { Check, ChevronsLeft, ChevronsRight, Loader2, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { DramaEpisode, DramaProject } from "@/lib/drama-project-contract";
import { buildOneClickNavSteps, type OneClickNavStepStatus } from "@/lib/one-click/nav-steps";

export type OneClickActiveTask = {
    id: string;
    label: string;
    /**
     * 是否有真实可调用的取消入口。
     *
     * L 的每条进行中任务都对应一个独立可取消的后端任务；V 的一键成片是「一个工作流任务 + 若干步」，
     * 分镜级图/视频任务的取消路径未逐条验证，所以只对确认可取消的条目显示 ✕，
     * 不给不可取消的条目放一个点了没反应的按钮。
     */
    cancelable?: boolean;
};

type Props = {
    project: DramaProject;
    episode: DramaEpisode | undefined;
    /** 分镜拆解进行中，对应 L 的页面级 storyboardGenerating。 */
    scriptSplitting?: boolean;
    /** 进行中任务，对应 L 的 allActiveTaskItems。 */
    activeTasks: OneClickActiveTask[];
    onCancelTask?: (task: OneClickActiveTask) => void;
    onJumpAnchor: (anchor: string) => void;
    onJumpShot: (shotId: string) => void;
};

/** L 侧栏最多列 8 条进行中任务，其余折叠为「还有 N 个任务...」。 */
const ACTIVE_TASK_LIMIT = 8;

/**
 * 一键成片左侧固定侧栏，对齐 L `FilmCreate.vue` 的 `.quick-nav`：
 * 步骤条（7 步 + 连接线 + 四态圆点）→ 分镜列表子菜单（按 segment 分组）→ 进行中任务面板。
 *
 * 尺寸沿用 L：展开 180px / 收起 48px。步骤状态计算在 `@/lib/one-click/nav-steps`，
 * 抽成纯函数是为了能做真实行为测试，而不是只对源码字符串断言。
 */
export function OneClickFilmNavSidebar({ project, episode, scriptSplitting, activeTasks, onCancelTask, onJumpAnchor, onJumpShot }: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const [shotListExpanded, setShotListExpanded] = useState(true);
    const steps = buildOneClickNavSteps(project, episode, { scriptSplitting });
    const shots = episode?.shots || [];

    return (
        <nav
            aria-label="一键成片快捷导航"
            data-testid="one-click-nav-sidebar"
            className="flex shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-card py-3 transition-[width] duration-200"
            style={{ width: collapsed ? 48 : 180 }}
        >
            <div className="flex items-center justify-between px-3 pb-2">
                {collapsed ? null : <span className="text-xs text-muted-foreground">导航</span>}
                <Tooltip title={collapsed ? "展开导航" : "收起导航"}>
                    <Button type="text" size="small" aria-label={collapsed ? "展开导航" : "收起导航"} icon={collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />} onClick={() => setCollapsed((value) => !value)} />
                </Tooltip>
            </div>

            {/* L: 步骤条 —— 左侧连接线 + 四态状态点 */}
            <ul className="m-0 flex list-none flex-col px-2.5">
                {steps.map((step, index) => (
                    <li key={step.key}>
                        <button type="button" className="flex w-full items-stretch gap-2 rounded-md px-1 text-left hover:bg-muted" aria-label={`跳转到${step.label}`} onClick={() => onJumpAnchor(step.anchor)}>
                            <span className="flex w-[18px] flex-col items-center">
                                <span className={`w-0.5 flex-1 ${index === 0 ? "invisible" : steps[index - 1].status === "done" ? "bg-green-500" : "bg-border"}`} />
                                <span className={dotClass(step.status)}>{step.status === "done" ? <Check className="size-3" /> : step.status === "generating" ? <Loader2 className="size-3 animate-spin" /> : index + 1}</span>
                                <span className={`w-0.5 flex-1 ${index === steps.length - 1 ? "invisible" : step.status === "done" ? "bg-green-500" : "bg-border"}`} />
                            </span>
                            {collapsed ? null : (
                                <span className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
                                    <span className="truncate text-[13px]">{step.label}</span>
                                    {step.count > 0 && step.status !== "done" ? <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{step.count}</span> : null}
                                    {step.status === "partial" ? <TriangleAlert className="size-3 text-amber-500" aria-label="部分完成" /> : null}
                                    {step.status === "generating" ? <Loader2 className="size-3 animate-spin text-primary" aria-label="生成中" /> : null}
                                </span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>

            {/* L: 分镜列表子菜单，按 segment_title 分组 */}
            {!collapsed && shots.length > 0 ? (
                <div className="mt-2.5 px-2.5">
                    <button
                        type="button"
                        className="flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-primary"
                        aria-label={shotListExpanded ? "收起分镜列表" : "展开分镜列表"}
                        onClick={() => setShotListExpanded((value) => !value)}
                    >
                        {shotListExpanded ? <Minus className="size-3" /> : <Plus className="size-3" />}
                        <span>分镜列表</span>
                    </button>
                    {shotListExpanded ? (
                        <ul className="m-0 flex list-none flex-col gap-0.5">
                            {shots.map((shot, index) => (
                                <li key={shot.id}>
                                    {shot.segmentTitle && (index === 0 || shot.segmentIndex !== shots[index - 1].segmentIndex) ? (
                                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <span className="size-1 rounded-full bg-primary" />
                                            <span className="truncate">{shot.segmentTitle}</span>
                                        </div>
                                    ) : null}
                                    <button
                                        type="button"
                                        title={shot.title || `分镜 ${index + 1}`}
                                        aria-label={`跳转到分镜 ${index + 1}`}
                                        className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-foreground/80 hover:bg-muted hover:text-primary"
                                        onClick={() => onJumpShot(shot.id)}
                                    >
                                        {index + 1}. {shot.title || "分镜"}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            {/* L: 进行中任务面板 —— 固定在侧栏底部，超出可滚动，最多 8 条 */}
            {activeTasks.length > 0 ? (
                <div className="mt-auto border-t border-border px-2.5 pb-1 pt-2" data-testid="one-click-active-tasks">
                    {collapsed ? (
                        <Tooltip title={activeTasks.map((task) => task.label).join("\n")}>
                            <div className="flex flex-col items-center gap-1" aria-label={`进行中任务 ${activeTasks.length} 个`}>
                                <span className="size-2 animate-pulse rounded-full bg-primary" />
                                <span className="text-[11px] text-muted-foreground">{activeTasks.length}</span>
                            </div>
                        </Tooltip>
                    ) : (
                        <>
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs">
                                <span className="size-2 animate-pulse rounded-full bg-primary" />
                                <span className="text-muted-foreground">进行中</span>
                                <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] text-white">{activeTasks.length}</span>
                            </div>
                            <ul className="m-0 flex max-h-[180px] list-none flex-col gap-1 overflow-y-auto">
                                {activeTasks.slice(0, ACTIVE_TASK_LIMIT).map((task) => (
                                    <li key={task.id} className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-1.5 py-1 text-xs">
                                        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                                        <Tooltip title={task.label} placement="right">
                                            <span className="min-w-0 flex-1 truncate">{task.label}</span>
                                        </Tooltip>
                                        {onCancelTask && task.cancelable ? (
                                            <button type="button" aria-label={`取消任务 ${task.label}`} title="取消任务" className="text-muted-foreground hover:text-red-500" onClick={() => onCancelTask(task)}>
                                                <X className="size-3" />
                                            </button>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                            {activeTasks.length > ACTIVE_TASK_LIMIT ? (
                                <Tooltip
                                    title={activeTasks
                                        .slice(ACTIVE_TASK_LIMIT)
                                        .map((task) => task.label)
                                        .join("\n")}
                                    placement="right"
                                >
                                    <div className="pt-1 text-center text-[11px] text-muted-foreground">还有 {activeTasks.length - ACTIVE_TASK_LIMIT} 个任务...</div>
                                </Tooltip>
                            ) : null}
                        </>
                    )}
                </div>
            ) : null}
        </nav>
    );
}

function dotClass(status: OneClickNavStepStatus) {
    const base = "flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[10px]";
    if (status === "done") return `${base} border-green-500 bg-green-500 text-white`;
    if (status === "generating") return `${base} border-primary bg-card text-primary`;
    if (status === "partial") return `${base} border-amber-500 bg-card text-amber-500`;
    return `${base} border-border bg-card text-muted-foreground`;
}
