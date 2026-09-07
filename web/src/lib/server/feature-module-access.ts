import type { FeatureModuleId } from "@/lib/feature-modules";
import { featureModuleDefinition } from "@/lib/feature-modules";
import { getAuthSettings } from "@/lib/auth/store";
import type { GenerationTaskContext } from "@/lib/server/generation-task-store";

export class FeatureModuleDisabledError extends Error {
    constructor(public readonly moduleId: FeatureModuleId) {
        super(`${featureModuleDefinition(moduleId).name}暂未启用`);
    }
}

/** Server-side guard for any request that starts new work or mutates module data. */
export async function requireFeatureModuleEnabled(moduleId: FeatureModuleId) {
    const settings = await getAuthSettings();
    if (settings.featureModules[moduleId] === false) throw new FeatureModuleDisabledError(moduleId);
}

/** Maps persisted task context back to the feature that initiated it. */
export function featureModuleForGenerationContext(context: GenerationTaskContext | undefined): FeatureModuleId | undefined {
    switch (context?.surface) {
        case "canvas":
            return "canvas";
        case "drama":
            return "drama";
        default:
            return undefined;
    }
}
