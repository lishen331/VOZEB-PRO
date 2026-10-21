"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, Pencil, Sparkles, Zap } from "lucide-react";

import "@/components/gamma-ui/gamma-tokens.css";
import { GammaMenu, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_SUBJECTS, gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { GammaThemeToggle } from "@/components/gamma-ui/gamma-theme";
import { FlowBoard, type FlowBoardHandle } from "@/app/bluegamma/flow/flow-board";
import { majorFlowBySlug } from "@/app/bluegamma/flow/flow-data";
import { DRAWER_W, FlowDrawer } from "@/app/bluegamma/flow/flow-drawer";
import { KIND_COST } from "@/app/bluegamma/flow/flow-layout";
import { FlowResultTray } from "@/app/bluegamma/flow/flow-result";
import { canGenerate, doneCount, flowReducer, initialFlowState, nextStepKey, nodeOf } from "@/app/bluegamma/flow/flow-state";
import { FlowStepBar } from "@/app/bluegamma/flow/flow-step-bar";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { cn } from "@/lib/utils";

/** 演示用生成耗时 */
const RUN_MS = 1400;
const INITIAL_POINTS = 2680;

/**
 * 专业引导式画布（/bluegamma/flow?major=interior）。
 * 顶部步骤条 = 该专业的标准流程；点一步就在画布上放一个节点，右侧抽屉里有模板库和自动参考；
 * 每做完一步，下一步亮起，连线把上一步的产出带过去。全部做完弹出成果汇总。
 */
export function FlowView() {
    const params = useSearchParams();
    const router = useRouter();
    const flow = majorFlowBySlug(params.get("major") ?? "interior");
    const subject = gammaSubjectBySlug(flow.slug);
    const [state, dispatch] = useReducer(flowReducer, flow, initialFlowState);
    const [points, setPoints] = useState(INITIAL_POINTS);
    const [editingBrief, setEditingBrief] = useState(false);
    const boardRef = useRef<FlowBoardHandle>(null);
    const timers = useRef<number[]>([]);
    const { toasts, toast, dismissToast } = useGammaDemo();

    useEffect(() => {
        dispatch({ type: "reset", flow });
    }, [flow]);
    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

    const currentKey = nextStepKey(flow, state);
    const selectedStep = flow.steps.find((step) => step.key === state.selectedKey) ?? null;
    const selectedNode = state.selectedKey ? (nodeOf(state, state.selectedKey) ?? null) : null;
    const finished = doneCount(state) === flow.steps.length;
    const drawerOpen = Boolean(selectedNode);

    const openStep = useCallback(
        (key: string) => {
            dispatch({ type: "create", flow, key });
            window.requestAnimationFrame(() => boardRef.current?.focusStep(key));
        },
        [flow],
    );

    const runStep = useCallback(
        (key: string) => {
            const step = flow.steps.find((item) => item.key === key);
            if (!step || !canGenerate(flow, state, key)) return;
            const cost = KIND_COST[step.kind];
            if (points < cost) {
                toast("error", "积分不足");
                return;
            }
            setPoints((value) => value - cost);
            dispatch({ type: "start", key });
            const timer = window.setTimeout(() => {
                dispatch({ type: "finish", flow, key });
                toast("success", `「${step.name}」已完成`);
            }, RUN_MS);
            timers.current.push(timer);
        },
        [flow, points, state, toast],
    );

    const goNext = useCallback(() => {
        const next = nextStepKey(flow, state);
        if (next) openStep(next);
    }, [flow, openStep, state]);

    const subjectItems = useMemo(
        () =>
            GAMMA_SUBJECTS.map((item) => ({
                key: item.slug,
                label: item.name,
                icon: <item.icon />,
                onSelect: () => router.replace(`/bluegamma/flow?major=${item.slug}`),
            })),
        [router],
    );

    return (
        <div className="relative flex h-full flex-col">
            {/* 顶栏：返回 / 专业切换 / 课题 —— 步骤条 —— 进度 / 积分 / 主题 */}
            <header className="pointer-events-none absolute inset-x-0 top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-start gap-3 px-3 pt-3">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                    <Link href="/bluegamma/home" aria-label="返回首页" className="gm-glass grid size-9 shrink-0 place-items-center rounded-full text-[var(--gm-text-2)] hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                    </Link>
                    <div className="gm-glass flex h-9 min-w-0 items-center gap-1 rounded-full pr-1 pl-1">
                        <GammaMenu
                            label="切换专业"
                            align="start"
                            items={subjectItems}
                            triggerClassName="rounded-full"
                            trigger={(open) => (
                                <span className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors", open ? "bg-[var(--gm-wash-strong)]" : "hover:bg-[var(--gm-wash)]")}>
                                    <subject.icon className="size-3.5 text-[var(--gm-accent)]" />
                                    {subject.name}
                                    <ChevronDown className="size-3 text-[var(--gm-text-3)]" />
                                </span>
                            )}
                        />
                        <span className="h-4 w-px bg-[var(--gm-border)]" />
                        {editingBrief ? (
                            <input
                                autoFocus
                                aria-label="课题名称"
                                value={state.brief}
                                onChange={(event) => dispatch({ type: "set-brief", brief: event.target.value })}
                                onBlur={() => setEditingBrief(false)}
                                onKeyDown={(event) => event.key === "Enter" && setEditingBrief(false)}
                                className="h-7 w-48 rounded-full bg-[var(--gm-wash)] px-2.5 text-[13px] outline-none ring-1 ring-[var(--gm-accent)]"
                            />
                        ) : (
                            <button type="button" onClick={() => setEditingBrief(true)} className="group flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]">
                                <span className="truncate">{state.brief || "填写课题"}</span>
                                <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="pointer-events-auto min-w-0">
                    <FlowStepBar flow={flow} state={state} currentKey={currentKey} onPick={openStep} />
                </div>
                <div className="pointer-events-auto flex items-center justify-end gap-2">
                    <span className="gm-glass flex h-9 items-center gap-2 rounded-full px-3 text-xs text-[var(--gm-text-2)]">
                        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)] transition-[width] duration-500" style={{ width: `${(doneCount(state) / flow.steps.length) * 100}%` }} />
                        </span>
                        <span className="tabular-nums">
                            {doneCount(state)}/{flow.steps.length}
                        </span>
                    </span>
                    <span className="gm-glass flex h-9 items-center gap-1 rounded-full px-3 text-xs tabular-nums">
                        <Zap className="size-3.5 fill-current text-[var(--gm-accent)]" />
                        {points.toLocaleString()}
                    </span>
                    <span className="gm-glass rounded-full">
                        <GammaThemeToggle />
                    </span>
                </div>
            </header>
            <main className="relative min-h-0 flex-1">
                <FlowBoard ref={boardRef} flow={flow} state={state} currentKey={currentKey} rightInset={drawerOpen ? DRAWER_W + 24 : 0} onSelect={(key) => openStep(key)} onCreate={openStep} onBlank={() => dispatch({ type: "select", key: null })} />

                {/* 空画布引导：还没放任何节点时，告诉学生从哪开始 */}
                {state.nodes.length === 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
                        <div className="gm-glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-[13px] text-[var(--gm-text-2)]">
                            <Sparkles className="size-4 text-[var(--gm-accent)]" />
                            <span>
                                {subject.name}共 {flow.steps.length} 步，从「{flow.steps[0].name}」开始，每一步的结果会自动带到下一步
                            </span>
                            <button type="button" onClick={() => openStep(flow.steps[0].key)} className="h-8 rounded-full bg-[var(--gm-blue)] px-4 text-xs font-medium text-white hover:bg-[var(--gm-blue-hover)]">
                                开始第一步
                            </button>
                        </div>
                    </div>
                ) : null}

                <FlowDrawer
                    flow={flow}
                    state={state}
                    step={selectedStep}
                    node={selectedNode}
                    canRun={selectedStep ? canGenerate(flow, state, selectedStep.key) : false}
                    onClose={() => dispatch({ type: "select", key: null })}
                    onPrompt={(prompt) => state.selectedKey && dispatch({ type: "set-prompt", key: state.selectedKey, prompt })}
                    onPreset={(index) => state.selectedKey && dispatch({ type: "pick-preset", flow, key: state.selectedKey, index })}
                    onRun={() => state.selectedKey && runStep(state.selectedKey)}
                    onNext={goNext}
                />

                <FlowResultTray flow={flow} state={state} open={finished && !drawerOpen} onPick={openStep} />
            </main>
            <GammaToastStack toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}
