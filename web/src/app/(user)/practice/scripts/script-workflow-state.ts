export type ScriptWorkflowArtifact = { type: string; status: string };
export type ScriptWorkflowRunType = "project_planning" | "short_story" | "novel_outlines" | "adaptation_bundle" | "episode_scripts" | "director_plan";
export type ScriptWorkflowStepStatus = "not_started" | "draft" | "awaiting_review" | "confirmed" | "failed";
export type ScriptWorkflowAction = { label: string; runType: ScriptWorkflowRunType; enabled: boolean; reason?: string };

export function resolveScriptWorkflowActions(mode: "short_story" | "long_novel", artifacts: ScriptWorkflowArtifact[]): ScriptWorkflowAction[] {
    const saved = new Set(artifacts.map((item) => item.type));
    const confirmed = new Set(artifacts.filter((item) => item.status === "confirmed").map((item) => item.type));
    const action = (label: string, runType: ScriptWorkflowRunType, enabled: boolean, reason?: string): ScriptWorkflowAction => ({ label, runType, enabled, ...(!enabled && reason ? { reason } : {}) });
    const planningConfirmed = confirmed.has("creative_positioning");
    const sourceConfirmed = confirmed.has(mode === "short_story" ? "short_story" : "chapter_outlines");
    const next = !planningConfirmed
        ? "project_planning"
        : !sourceConfirmed
          ? mode === "short_story"
              ? "short_story"
              : "novel_outlines"
          : !confirmed.has("adaptation_strategy")
            ? "adaptation_bundle"
            : !saved.has("episode_scripts")
              ? "episode_scripts"
              : !confirmed.has("review_report")
                ? "episode_scripts"
                : !saved.has("director_plan")
                  ? "director_plan"
                  : undefined;
    return [
        action("策划故事", "project_planning", next === "project_planning", "请按当前步骤执行"),
        ...(mode === "short_story" ? [action("完整短故事", "short_story", next === "short_story", "请先生成并确认创作定位")] : [action("小说总纲与章纲", "novel_outlines", next === "novel_outlines", "请先生成并确认创作定位")]),
        action("改编策划", "adaptation_bundle", next === "adaptation_bundle", "请先生成并确认来源成果"),
        action("分集剧本 · 自动审核", "episode_scripts", next === "episode_scripts", "请先生成并确认改编策略"),
        action("导演规划 · 完成分镜与提示词", "director_plan", next === "director_plan" && !saved.has("director_plan"), saved.has("review_report") ? "请先确认剧本审核" : "请先生成分集剧本并完成自动审核"),
    ];
}
