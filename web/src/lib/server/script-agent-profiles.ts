import { getFreshAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModel, type ResolvedLogicalModel } from "./logical-model-router";
import type { ScriptAgentKey } from "./script-agent-domain";
import type { ScriptAgentProfileRecord } from "./database/script-agent-repository";
import { ScriptAgentRepository } from "./database/script-agent-repository";
import { postgresQuery } from "./database/postgres";
import { compileScriptAgentInstructions, scriptAgentProfileDefaults } from "./script-agent-skills";

export type ResolvedScriptAgentProfile = { profile: ScriptAgentProfileRecord; candidate: ResolvedLogicalModel; instructions: string };
type Settings = Awaited<ReturnType<typeof getFreshAuthSettings>>;

export class ScriptAgentProfileService {
    constructor(
        private readonly deps: {
            getSettings?: () => Promise<Settings>;
            getProfile?: (agentKey: ScriptAgentKey) => Promise<ScriptAgentProfileRecord | null>;
        } = {},
    ) {}

    async resolve(agentKey: ScriptAgentKey, selectedSkillIds: string[] = []): Promise<ResolvedScriptAgentProfile> {
        const settings = await (this.deps.getSettings || getFreshAuthSettings)();
        const stored = await (this.deps.getProfile || ((key) => new ScriptAgentRepository({ query: postgresQuery }).getAgentProfile(key)))(agentKey);
        const seed = scriptAgentProfileDefaults().find((item) => item.agentKey === agentKey);
        if (!seed) throw new ScriptAgentProfileError("未知剧本 Agent", 400);
        const profile: ScriptAgentProfileRecord =
            stored ||
            ({
                agentKey,
                name: seed.name,
                enabled: true,
                primaryLogicalModelId: settings.practiceScriptSettings.defaultModelId || settings.practiceDefaultModels.textModel || "",
                fallbackLogicalModelId: settings.practiceScriptSettings.fallbackModelId || "",
                endpointId: settings.practiceScriptSettings.endpointId || undefined,
                reasoningMode: seed.reasoningMode,
                outputPolicy: {},
                timeoutConfig: {},
                batchConfig: seed.batchConfig,
                toolAllowlist: seed.toolAllowlist,
                skillBindings: seed.skillBindings,
                version: 1,
            } satisfies ScriptAgentProfileRecord);
        if (!profile.enabled) throw new ScriptAgentProfileError("当前剧本 Agent 已停用", 503);
        const candidates = [profile.primaryLogicalModelId, profile.fallbackLogicalModelId, settings.practiceDefaultModels.textModel].filter(Boolean);
        const candidate = candidates.map((modelId) => resolveLogicalModel(settings, "text", modelId, profile.endpointId || "", "open-source-practice")).find(Boolean);
        if (!candidate || candidate.channel.purpose === "production") throw new ScriptAgentProfileError(`${profile.name}没有可用的无限练习文本模型`, 503);
        return { profile, candidate, instructions: compileScriptAgentInstructions(agentKey, [...profile.skillBindings, ...selectedSkillIds]) };
    }
}

export class ScriptAgentProfileError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
