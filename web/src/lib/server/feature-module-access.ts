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
    if (context?.featureModule === "drama-lab") return "drama-lab";
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
