import { fillBrief, type FlowStep, type MajorFlow } from "@/app/bluegamma/flow/flow-types";

/*
 * 引导式画布的纯状态（reducer），不依赖 React，便于单测。
 * 步骤只能按顺序“解锁”：上一步完成后下一步才能生成；但已完成的步骤随时可以回去改，改完下游标记为“需更新”。
 */

export type FlowNodeStatus = "draft" | "running" | "done" | "stale";

export interface FlowNodeState {
    key: string;
    status: FlowNodeStatus;
    prompt: string;
    presetIndex: number | null;
    /** 文本类步骤的生成结果（要点）；图片/视频/音频演示时只记版本与所用模板 */
    lines?: readonly string[];
    /** 生成时用的模板名（自定义描述时为空） */
    resultLabel?: string;
    /** 第几版（每次生成 +1） */
    version: number;
}

export interface FlowState {
    slug: string;
    brief: string;
    /** 已放到画布上的节点，顺序同流程 */
    nodes: readonly FlowNodeState[];
    selectedKey: string | null;
}

export type FlowAction =
    | { type: "reset"; flow: MajorFlow }
    | { type: "set-brief"; brief: string }
    | { type: "create"; flow: MajorFlow; key: string }
    | { type: "select"; key: string | null }
    | { type: "set-prompt"; key: string; prompt: string }
    | { type: "pick-preset"; flow: MajorFlow; key: string; index: number }
    | { type: "start"; key: string }
    | { type: "finish"; flow: MajorFlow; key: string };

export function initialFlowState(flow: MajorFlow): FlowState {
    return { slug: flow.slug, brief: flow.brief, nodes: [], selectedKey: null };
}

function stepOf(flow: MajorFlow, key: string): FlowStep | undefined {
    return flow.steps.find((step) => step.key === key);
}

export function nodeOf(state: FlowState, key: string) {
    return state.nodes.find((node) => node.key === key);
}

function patchNode(state: FlowState, key: string, patch: Partial<FlowNodeState>): FlowState {
    return { ...state, nodes: state.nodes.map((node) => (node.key === key ? { ...node, ...patch } : node)) };
}

/** 一步能否生成：它引用的上游都已完成（没有 refs 的第一步永远可以） */
export function canGenerate(flow: MajorFlow, state: FlowState, key: string) {
    const step = stepOf(flow, key);
    if (!step) return false;
    const upstream = step.refs ?? [];
    return upstream.every((ref) => nodeOf(state, ref)?.status === "done");
}

/** 下一个还没完成的步骤（流程推进的“当前步”） */
export function nextStepKey(flow: MajorFlow, state: FlowState) {
    return flow.steps.find((step) => nodeOf(state, step.key)?.status !== "done")?.key ?? null;
}

export function doneCount(state: FlowState) {
    return state.nodes.filter((node) => node.status === "done").length;
}

/** 依赖 key 的所有下游（直接或间接） */
export function downstreamOf(flow: MajorFlow, key: string): string[] {
    const result = new Set<string>();
    let frontier = [key];
    while (frontier.length > 0) {
        const next = flow.steps.filter((step) => !result.has(step.key) && (step.refs ?? []).some((ref) => frontier.includes(ref))).map((step) => step.key);
        next.forEach((item) => result.add(item));
        frontier = next;
    }
    return [...result];
}

/** 新建节点：默认选中第一个模板并填好提示词，学生可以直接点生成 */
function createNode(flow: MajorFlow, state: FlowState, key: string): FlowState {
    const step = stepOf(flow, key);
    if (!step) return state;
    if (nodeOf(state, key)) return { ...state, selectedKey: key };
    const node: FlowNodeState = { key, status: "draft", prompt: fillBrief(step.presets[0]?.prompt ?? "", state.brief), presetIndex: 0, version: 0 };
    const order = flow.steps.map((item) => item.key);
    const nodes = [...state.nodes, node].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return { ...state, nodes, selectedKey: key };
}

/** 生成完成：写入演示产出；若这是重做，下游已完成的节点标记为“需更新” */
function finishNode(flow: MajorFlow, state: FlowState, key: string): FlowState {
    const step = stepOf(flow, key);
    const node = nodeOf(state, key);
    if (!step || !node) return state;
    const preset = node.presetIndex === null ? undefined : step.presets[node.presetIndex];
    const result: Partial<FlowNodeState> = { resultLabel: preset?.name ?? "自定义", ...(step.kind === "text" ? { lines: step.sample ?? [] } : {}) };
    const next = patchNode(state, key, { ...result, status: "done", version: node.version + 1 });
    if (node.version === 0) return next;
    const stale = new Set(downstreamOf(flow, key));
    return { ...next, nodes: next.nodes.map((item) => (stale.has(item.key) && item.status === "done" ? { ...item, status: "stale" } : item)) };
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
    switch (action.type) {
        case "reset":
            return initialFlowState(action.flow);
        case "set-brief":
            return { ...state, brief: action.brief };
        case "create":
            return createNode(action.flow, state, action.key);
        case "select":
            return { ...state, selectedKey: action.key };
        case "set-prompt":
            return patchNode(state, action.key, { prompt: action.prompt, presetIndex: null });
        case "pick-preset": {
            const preset = stepOf(action.flow, action.key)?.presets[action.index];
            return preset ? patchNode(state, action.key, { presetIndex: action.index, prompt: fillBrief(preset.prompt, state.brief) }) : state;
        }
        case "start":
            return nodeOf(state, action.key) ? patchNode(state, action.key, { status: "running" }) : state;
        case "finish":
            return finishNode(action.flow, state, action.key);
    }
}
