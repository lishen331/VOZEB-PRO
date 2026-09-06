import type { AgentSkill, AgentSkillWorkspace } from "@/lib/auth/store-types";
import type { TextPlanningProtocol } from "@/lib/server/text-planning-runtime";

export const AGENT_PLAN_SCHEMA_VERSION = 2 as const;

export type AgentRunSkillSnapshot = {
    id: string;
    name: string;
    description: string;
    plannerSummary: string;
    instructions: string;
    enabled: boolean;
    keywords: string[];
    workspaces: AgentSkillWorkspace[];
    capabilities?: AgentSkill["capabilities"];
    action: "generate" | "edit";
    requiresReference: boolean;
    defaultConfig: Record<string, string | number | boolean>;
    sourceUrl?: string;
    sourceRepository?: string;
    sourcePath?: string;
    sourceVersion?: string;
    sourceCommit?: string;
    sourceContentHash?: string;
    license?: string;
};

export type AgentRunPlannerAudit = {
    schemaVersion: typeof AGENT_PLAN_SCHEMA_VERSION;
    mode: "direct" | "model";
    logicalModelId?: string;
    channelId?: string;
    upstreamModel?: string;
    protocol?: TextPlanningProtocol;
    elapsedMs?: number;
    pointsCost?: number;
    billingReceiptId?: string;
    skills: AgentRunSkillSnapshot[];
};

export function buildAgentRunPlannerAudit(input: {
    mode: AgentRunPlannerAudit["mode"];
    logicalModelId?: string;
    channelId?: string;
    upstreamModel?: string;
    protocol?: TextPlanningProtocol;
    elapsedMs?: number;
    pointsCost?: number;
    billingReceiptId?: string;
    skills: AgentSkill[];
}): AgentRunPlannerAudit {
    return {
        schemaVersion: AGENT_PLAN_SCHEMA_VERSION,
        mode: input.mode,
        ...(input.logicalModelId ? { logicalModelId: input.logicalModelId } : {}),
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.upstreamModel ? { upstreamModel: input.upstreamModel } : {}),
        ...(input.protocol ? { protocol: input.protocol } : {}),
        ...(Number.isFinite(input.elapsedMs) && input.elapsedMs! >= 0 ? { elapsedMs: input.elapsedMs } : {}),
        ...(Number.isFinite(input.pointsCost) && input.pointsCost! >= 0 ? { pointsCost: input.pointsCost } : {}),
        ...(input.billingReceiptId ? { billingReceiptId: input.billingReceiptId } : {}),
        skills: input.skills.map(snapshotAgentSkill),
    };
}

function snapshotAgentSkill(skill: AgentSkill): AgentRunSkillSnapshot {
    return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        plannerSummary: skill.plannerSummary || skill.description || skill.instructions,
        instructions: skill.instructions,
        enabled: skill.enabled,
        keywords: [...skill.keywords],
        workspaces: [...(skill.workspaces || ["image"])],
        capabilities: skill.capabilities?.map((capability) => ({ inputs: [...capability.inputs], outputs: [...capability.outputs] })),
        action: skill.action === "edit" ? "edit" : "generate",
        requiresReference: Boolean(skill.requiresReference),
        defaultConfig: { ...(skill.defaultConfig || {}) },
        ...(skill.sourceUrl ? { sourceUrl: skill.sourceUrl } : {}),
        ...(skill.sourceRepository ? { sourceRepository: skill.sourceRepository } : {}),
        ...(skill.sourcePath ? { sourcePath: skill.sourcePath } : {}),
        ...(skill.sourceVersion ? { sourceVersion: skill.sourceVersion } : {}),
        ...(skill.sourceCommit ? { sourceCommit: skill.sourceCommit } : {}),
        ...(skill.sourceContentHash ? { sourceContentHash: skill.sourceContentHash } : {}),
        ...(skill.license ? { license: skill.license } : {}),
    };
}
