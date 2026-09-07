import type { AgentPlan } from "./agent-run-validation";

const ANALYSIS_INTENT = /(分析|诊断|解释|说明|为什么|报错|错误|失败|怎么解决|检查|查看|理解|describe|explain|analy[sz]e|diagnos|debug|error|why)/iu;
const MEDIA_ACTION = /(重新生成|生成一(?:张|个|段|条)|制作一(?:张|个|段|条)|创作一(?:张|个|段|条)|绘制一(?:张|个)|设计一(?:张|个)|编辑这(?:张|个)|修改这(?:张|个)|转换成|延长(?:视频|片段)|\b(?:generate|create|make|draw|design|edit|convert|extend)\b)/iu;

export function isAnalysisIntent(prompt: string) {
    const value = prompt.trim();
    return Boolean(value && ANALYSIS_INTENT.test(value) && !MEDIA_ACTION.test(value));
}

/** Intent is owned by the multimodal planner; this helper is advisory only. */
export function assertAgentPlanIntent(_plan: Pick<AgentPlan, "deliverables" | "intent">, _prompt: string, _hasMediaInput: boolean) {
    return;
}
