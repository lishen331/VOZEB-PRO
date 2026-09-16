import { randomUUID } from "node:crypto";
import type { ScriptAgentOperation } from "@/lib/script-practice-types";
import type { ScriptAgentOperationRecord, ScriptPracticeRepository } from "./database/script-practice-repository";
import { resolveConfiguredScriptModel, runScriptModel, type ScriptRuntimeContext } from "./script-practice-model-runtime";
import { SCRIPT_AGENT_TOOL_NAMES } from "./script-practice-agent-tools";

export type ScriptAgentRequest = { operation: ScriptAgentOperation; baseVersionId: string; targetBlockIds: string[]; instruction: string };
export type ScriptAgentRequestContext = Pick<ScriptRuntimeContext, "origin" | "cookie">;
export type ScriptAgentProposal = { id: string; projectId: string; baseVersionId: string; targetBlockIds: string[]; operation: ScriptAgentOperation; before: string; proposedAfter: string };
type AgentRepository = Pick<ScriptPracticeRepository, "getScriptProject" | "getCurrentScriptDocument" | "recordScriptAgentOperation">;

export function createScriptAgentService(deps: { repository: AgentRepository; runModel?: typeof runScriptModel; resolveModel?: typeof resolveConfiguredScriptModel }) {
    return {
        toolNames: () => [...SCRIPT_AGENT_TOOL_NAMES],
        propose: async (ownerUserId: string, projectId: string, input: ScriptAgentRequest, requestContext?: ScriptAgentRequestContext): Promise<ScriptAgentProposal> => {
            const project = await deps.repository.getScriptProject(projectId, ownerUserId);
            if (!project) throw new ScriptAgentServiceError("剧本项目不存在", 404);
            if (!project.currentVersionId || project.currentVersionId !== input.baseVersionId) throw new ScriptAgentServiceError("剧本版本已变化，请刷新后重试", 409);
            const document = await deps.repository.getCurrentScriptDocument(projectId, ownerUserId);
            if (!document) throw new ScriptAgentServiceError("剧本文档不存在", 404);
            const selected = document.blocks.filter((block) => input.targetBlockIds.includes(block.id));
            if (!selected.length || selected.length !== new Set(input.targetBlockIds).size) throw new ScriptAgentServiceError("剧本选择范围无效", 400);
            const before = selected.map((block) => block.text).join("\n\n");
            const model = deps.resolveModel
                ? await deps.resolveModel()
                : deps.runModel
                  ? { modelId: "test-script-model", endpointUrl: "http://127.0.0.1", apiKey: undefined, enabledSkills: [], enabledTools: ["rewrite_selection"], executionProfile: "open-source-practice" as const }
                  : await resolveConfiguredScriptModel();
            if (!model.enabledTools.includes(input.operation)) throw new ScriptAgentServiceError("当前剧本 Tool 未启用", 403);
            const response = await (deps.runModel || runScriptModel)(
                {
                    modelId: model.modelId,
                    operation: input.operation,
                    projectContext: { title: project.title, ...(Array.isArray(model.enabledSkills) ? { enabledSkills: model.enabledSkills } : {}) },
                    stageInput: { selection: selected, instruction: input.instruction },
                    publicInstructions: "仅修改选中的剧本块并返回 proposedAfter",
                    responseSchema: { type: "object", properties: { proposedAfter: { type: "string" } }, required: ["proposedAfter"] },
                },
                {
                    endpointUrl: model.endpointUrl,
                    apiKey: model.apiKey,
                    executionProfile: model.executionProfile,
                    ...(requestContext && "candidate" in model
                        ? { origin: requestContext.origin, cookie: requestContext.cookie, userId: ownerUserId, requestId: randomUUID(), logicalModelId: model.candidate.logicalModelId, candidate: model.candidate }
                        : {}),
                },
            );
            const proposedAfter = typeof response.structured?.proposedAfter === "string" ? response.structured.proposedAfter.trim() : "";
            if (!proposedAfter) throw new ScriptAgentServiceError("剧本模型没有返回修改建议", 502);
            const proposal = { id: randomUUID(), projectId, baseVersionId: input.baseVersionId, targetBlockIds: [...input.targetBlockIds], operation: input.operation, before, proposedAfter };
            const record: ScriptAgentOperationRecord = {
                id: proposal.id,
                projectId,
                documentId: document.id,
                baseVersionId: input.baseVersionId,
                operation: input.operation,
                beforePatch: { targetBlockIds: proposal.targetBlockIds, text: before },
                proposedPatch: { targetBlockIds: proposal.targetBlockIds, text: proposedAfter },
                status: "proposed",
                createdAt: new Date().toISOString(),
            };
            await deps.repository.recordScriptAgentOperation(record, ownerUserId);
            return proposal;
        },
    };
}

export class ScriptAgentServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
