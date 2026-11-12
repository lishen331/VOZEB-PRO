import type { GenerationLogTraceStep } from "@/lib/server/generation-log-trace";

export type GenerationLogFlowNode = {
    key: string;
    label: string;
    at: number;
    tone: "neutral" | "success" | "danger";
    model?: string;
    channel?: string;
    status?: number;
    durationMs?: number;
    errorMessage?: string;
    errorName?: string;
    state?: string;
    /** 被折叠进这个节点的轮询、传输等事件数。 */
    collapsedCount: number;
    /** 指向下一个节点的连线说明，比如「故障转移」。 */
    connector?: string;
};

const CALL_START = new Set(["provider_start", "upstream_request"]);
const CALL_END = new Set(["provider_end", "provider_exception", "provider_error", "upstream_error"]);
const RESULT_PHASES = new Set(["result_persist_complete", "result_persist_failed", "recovery_end"]);

/** 把一条调用的几十个诊断事件收成 3～5 个流程节点。原始事件仍由调用方保留。 */
export function buildGenerationLogFlow(steps: GenerationLogTraceStep[]): GenerationLogFlowNode[] {
    const nodes: GenerationLogFlowNode[] = [];
    let call: CallAccumulator | null = null;
    let collapsed = 0;
    let polls = 0;
    let lastState = "";

    const flushCollapsed = () => {
        if (polls > 0) nodes.push(pollNode(steps, polls, lastState, collapsed));
        else if (collapsed > 0 && nodes.length) nodes[nodes.length - 1].collapsedCount += collapsed;
        collapsed = 0;
        polls = 0;
    };

    for (const step of steps) {
        if (step.phase === "task_created") {
            flushCollapsed();
            nodes.push(node(`created-${step.at}`, "建任务", step, "neutral"));
            continue;
        }
        if (CALL_START.has(step.phase)) {
            flushCollapsed();
            if (!call || (step.model && call.model && step.model !== call.model)) {
                if (call) closeCall(nodes, call);
                call = startCall(step, nodes.length);
            }
            call.absorb(step);
            continue;
        }
        if (call && (step.phase === "upstream_response" || CALL_END.has(step.phase) || step.model === call.model || !step.model)) {
            call.absorb(step);
            if (CALL_END.has(step.phase)) {
                closeCall(nodes, call);
                call = null;
            }
            continue;
        }
        if (step.phase === "poll") {
            polls += 1;
            if (step.state) lastState = step.state;
            continue;
        }
        if (RESULT_PHASES.has(step.phase) || step.phase === "result_persist_start") {
            flushCollapsed();
            if (call) {
                closeCall(nodes, call);
                call = null;
            }
            if (RESULT_PHASES.has(step.phase)) nodes.push(resultNode(step));
            else collapsed += 1;
            continue;
        }
        if (step.phase === "state") {
            if (step.state) lastState = step.state;
            collapsed += 1;
            continue;
        }
        collapsed += 1;
    }
    if (call) closeCall(nodes, call);
    flushCollapsed();
    markFailover(nodes);
    return nodes;
}

type CallAccumulator = {
    at: number;
    model?: string;
    channel?: string;
    status?: number;
    durationMs?: number;
    errorMessage?: string;
    errorName?: string;
    collapsedCount: number;
    absorb: (step: GenerationLogTraceStep) => void;
};

function startCall(step: GenerationLogTraceStep, index: number): CallAccumulator {
    const call: CallAccumulator = {
        at: step.at,
        collapsedCount: 0,
        absorb(current) {
            this.collapsedCount += 1;
            if (current.model) this.model = current.model;
            if (current.channelName || current.channelId) this.channel = current.channelName || current.channelId;
            if (typeof current.status === "number") this.status = current.status;
            if (typeof current.durationMs === "number") this.durationMs = (this.durationMs ?? 0) + current.durationMs;
            if (current.errorMessage) this.errorMessage = current.errorMessage;
            if (current.errorName) this.errorName = current.errorName;
            this.at = Math.min(this.at, current.at);
        },
    };
    call.absorb(step);
    call.collapsedCount = 0;
    void index;
    return call;
}

function closeCall(nodes: GenerationLogFlowNode[], call: CallAccumulator) {
    const failed = Boolean(call.errorMessage) || (typeof call.status === "number" && call.status >= 400);
    nodes.push({
        key: `call-${nodes.length}-${call.at}`,
        label: `调用 ${nodes.filter((item) => item.label.startsWith("调用")).length + 1}`,
        at: call.at,
        tone: failed ? "danger" : "success",
        model: call.model,
        channel: call.channel,
        status: call.status,
        durationMs: call.durationMs,
        errorMessage: call.errorMessage,
        errorName: call.errorName,
        collapsedCount: call.collapsedCount,
    });
}

function node(key: string, label: string, step: GenerationLogTraceStep, tone: GenerationLogFlowNode["tone"]): GenerationLogFlowNode {
    return {
        key,
        label,
        at: step.at,
        tone,
        model: step.model,
        channel: step.channelName || step.channelId,
        collapsedCount: 0,
    };
}

function pollNode(steps: GenerationLogTraceStep[], count: number, state: string, extra: number): GenerationLogFlowNode {
    const last = [...steps].reverse().find((step) => step.phase === "poll");
    return {
        key: `poll-${last?.at ?? count}`,
        label: count > 1 ? `轮询 ×${count}` : "轮询",
        at: last?.at ?? 0,
        tone: "neutral",
        state: state.replace(/^api_response:/, ""),
        collapsedCount: extra,
    };
}

function resultNode(step: GenerationLogTraceStep): GenerationLogFlowNode {
    const failed = step.phase === "result_persist_failed" || step.state === "failed" || step.state === "error";
    const labels: Record<string, string> = { result_persist_complete: "结果已保存", result_persist_failed: "保存失败", recovery_end: failed ? "任务失败" : "任务完成" };
    return {
        key: `result-${step.at}`,
        label: labels[step.phase] ?? step.phase,
        at: step.at,
        tone: failed ? "danger" : "success",
        state: step.state,
        errorMessage: step.errorMessage,
        collapsedCount: 0,
    };
}

/** 一次失败的调用后面换了模型再调用，连线上标「故障转移」。中间的轮询节点不影响判断。 */
function markFailover(nodes: GenerationLogFlowNode[]) {
    for (let index = 0; index < nodes.length - 1; index += 1) {
        const current = nodes[index];
        if (!current.label.startsWith("调用") || current.tone !== "danger" || !current.model) continue;
        const next = nodes.slice(index + 1).find((node) => node.label.startsWith("调用"));
        if (next?.model && next.model !== current.model) current.connector = "故障转移";
    }
}
