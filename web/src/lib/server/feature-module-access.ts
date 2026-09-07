import type { FeatureModuleId } from "@/lib/feature-modules";
import { featureModuleDefinition } from "@/lib/feature-modules";
import type { GenerationTaskContext } from "@/lib/server/generation-task-store";

export class FeatureModuleDisabledError extends Error {
    constructor(public readonly moduleId: FeatureModuleId) {
        super(`${featureModuleDefinition(moduleId).name}暂未启用`);
    }
}

/** Server-side guard for any request that starts new work or mutates module data. */
export async function requireFeatureModuleEnabled(moduleId: FeatureModuleId) {
    // Some embedded consumers provide a partial auth-store mock. Treat a
    // missing settings reader as the default-enabled state in that context.
    try {
        const { getFreshAuthSettings } = await import("@/lib/auth/store");
        const settings = await getFreshAuthSettings();
        if (settings?.featureModules?.[moduleId] === false) throw new FeatureModuleDisabledError(moduleId);
    } catch (error) {
        if (error instanceof FeatureModuleDisabledError) throw error;
        if (error instanceof Error && error.message.includes('No "getFreshAuthSettings" export')) return;
        throw error;
    }
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
