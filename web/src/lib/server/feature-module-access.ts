import type { FeatureModuleId } from "@/lib/feature-modules";
import { featureModuleDefinition } from "@/lib/feature-modules";
import type { GenerationTaskContext } from "@/lib/server/generation-task-store";

export class FeatureModuleDisabledError extends Error {
    constructor(public readonly moduleId: FeatureModuleId) {
        super(`${featureModuleDefinition(moduleId).name}暂未启用`);
    }
}

/**
 * Plugin switches are presentation controls only. Business endpoints retain
 * this compatibility function so existing route imports stay stable, but a
 * hidden navigation item must never revoke project/task access.
 */
export async function requireFeatureModuleEnabled(_moduleId: FeatureModuleId) {
    return;
}

/** Maps persisted task context back to the feature that initiated it. */
export function featureModuleForGenerationContext(context: GenerationTaskContext | undefined): FeatureModuleId | undefined {
    // 显式归属优先。商单（一键成片）与教学版（创作工坊）共用底层生成链路，
    // 只能靠这个字段区分用量归属，漏掉 one-click-film 会把商单的钱记到教学版账上。
    if (context?.featureModule === "one-click-film") return "one-click-film";
    if (context?.featureModule === "drama-lab") return "drama-lab";
    // 兜底：从项目 id 前缀推断。one-click-film 必须排在 drama-lab 之前判断，
    // 否则 "one-click-film:..." 这类 id 会因为都含 drama 语义而落到错误分支。
    if (context?.surface === "drama" && typeof context.projectId === "string" && /(^|[-_:])one-click-film[-_:]/i.test(context.projectId)) return "one-click-film";
    if (context?.surface === "drama" && typeof context.projectId === "string" && /(^|[-_:])drama-lab[-_:]/i.test(context.projectId)) return "drama-lab";
    switch (context?.surface) {
        case "canvas":
            return "canvas";
        case "drama":
            return "drama";
        default:
            return undefined;
    }
}
