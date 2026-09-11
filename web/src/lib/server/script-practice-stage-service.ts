import type { ScriptAgentOperation, ScriptDocument, ScriptStage, ScriptStageKey } from "@/lib/script-practice-types";
import type { ScriptPracticeRepository } from "./database/script-practice-repository";
import { resolveConfiguredScriptModel, runScriptModel } from "./script-practice-model-runtime";

export type ScriptStageRepository = Pick<
    ScriptPracticeRepository,
    "getScriptProject" | "getCurrentScriptDocument" | "getScriptStage" | "listScriptStages" | "setScriptStage" | "createScriptVersion" | "nextScriptVersionNumber" | "compareAndSetCurrentVersion" | "recordScriptAgentOperation"
>;
export type ScriptStageServiceDeps = { repository: ScriptStageRepository; runModel?: typeof runScriptModel; resolveModel?: typeof resolveConfiguredScriptModel };
export type ScriptStageProposal = { projectId: string; stage: ScriptStageKey; status: "awaiting_review"; result: Record<string, unknown> };
export type ScriptPatch = { projectId: string; baseVersionId: string; currentVersionId: string; targetBlockIds: string[]; operation: ScriptAgentOperation; before: string; proposedAfter: string };

const STAGE_BY_OPERATION: Partial<Record<ScriptAgentOperation, ScriptStageKey>> = { generate_synopsis: "synopsis", generate_outline: "outline", generate_entities: "entities", generate_scenes: "scenes", generate_screenplay: "screenplay" };
const PREREQUISITE_BY_STAGE: Partial<Record<ScriptStageKey, ScriptStageKey>> = { outline: "synopsis", entities: "outline", scenes: "entities", screenplay: "scenes" };
const STAGE_ORDER: ScriptStageKey[] = ["idea", "synopsis", "outline", "entities", "scenes", "screenplay", "revision"];

export function createScriptStageService(deps: ScriptStageServiceDeps) {
    return { generate: (ownerUserId: string, projectId: string, operation: ScriptAgentOperation, stageInput: unknown) => generateScriptStage(deps, ownerUserId, projectId, operation, stageInput) };
}

async function generateScriptStage(deps: ScriptStageServiceDeps, ownerUserId: string, projectId: string, operation: ScriptAgentOperation, stageInput: unknown): Promise<ScriptStageProposal> {
    const stage = STAGE_BY_OPERATION[operation];
    if (!stage) throw new ScriptStageServiceError("该操作不是阶段生成操作", 400);
    const project = await deps.repository.getScriptProject(projectId, ownerUserId);
    if (!project) throw new ScriptStageServiceError("剧本项目不存在", 404);
    const prerequisite = PREREQUISITE_BY_STAGE[stage];
    let effectiveStageInput = stageInput;
    if (prerequisite) {
        const confirmed = await deps.repository.getScriptStage(projectId, ownerUserId, prerequisite);
        if (!confirmed || confirmed.status !== "confirmed" || confirmed.confirmed === undefined) throw new ScriptStageServiceError(`请先确认${prerequisite}阶段结果`, 409);
        effectiveStageInput = { confirmed: confirmed.confirmed };
    }
    await deps.repository.setScriptStage(projectId, ownerUserId, { projectId, key: stage, status: "generating", updatedAt: new Date().toISOString() });
    try {
        const model = deps.resolveModel
            ? await deps.resolveModel()
            : deps.runModel
              ? { modelId: "test-script-model", endpointUrl: "http://127.0.0.1", apiKey: undefined, enabledSkills: [], executionProfile: "open-source-practice" as const }
              : await resolveConfiguredScriptModel();
        const response = await (deps.runModel || runScriptModel)(
            {
                modelId: model.modelId,
                operation,
                projectContext: { title: project.title, sourceType: project.sourceType, ...(Array.isArray(model.enabledSkills) ? { enabledSkills: model.enabledSkills } : {}) },
                stageInput: effectiveStageInput,
                publicInstructions: "生成当前剧本阶段的公开结果",
                responseSchema: stageResponseSchema(operation),
            },
            { endpointUrl: model.endpointUrl, apiKey: model.apiKey, executionProfile: model.executionProfile },
        );
        if (!response.structured) throw new Error("结构化结果为空");
        const result = { projectId, stage, status: "awaiting_review" as const, result: response.structured };
        await deps.repository.setScriptStage(projectId, ownerUserId, { projectId, key: stage, status: "awaiting_review", draft: response.structured, updatedAt: new Date().toISOString() });
        return result;
    } catch (error) {
        await deps.repository.setScriptStage(projectId, ownerUserId, { projectId, key: stage, status: "failed", error: error instanceof Error ? error.message : "剧本阶段生成失败", updatedAt: new Date().toISOString() });
        throw error;
    }
}

function stageResponseSchema(operation: ScriptAgentOperation) {
    const requiredByOperation: Partial<Record<ScriptAgentOperation, string>> = { generate_synopsis: "synopsis", generate_outline: "outline", generate_entities: "entities", generate_scenes: "scenes" };
    const required = requiredByOperation[operation];
    if (required) return { type: "object", required: [required] };
    return { type: "object", anyOf: [{ required: ["screenplay"] }, { required: ["blocks"] }, { required: ["text"] }] };
}

export async function confirmScriptStage(repository: Pick<ScriptPracticeRepository, "getScriptProject" | "getScriptStage" | "listScriptStages" | "setScriptStage">, ownerUserId: string, projectId: string, key: ScriptStageKey) {
    const project = await repository.getScriptProject(projectId, ownerUserId);
    if (!project) throw new ScriptStageServiceError("剧本项目不存在", 404);
    const stage = await repository.getScriptStage(projectId, ownerUserId, key);
    if (!stage || stage.status !== "awaiting_review" || stage.draft === undefined) throw new ScriptStageServiceError("该阶段没有待确认的生成结果", 409);
    const confirmed = await repository.setScriptStage(projectId, ownerUserId, { ...stage, status: "confirmed", confirmed: stage.draft, updatedAt: new Date().toISOString() });
    const index = STAGE_ORDER.indexOf(key);
    if (index >= 0) {
        const downstream = (await repository.listScriptStages(projectId, ownerUserId)).filter((item) => STAGE_ORDER.indexOf(item.key) > index && item.status !== "not_started");
        await Promise.all(downstream.map((item) => repository.setScriptStage(projectId, ownerUserId, { ...item, status: "stale", updatedAt: new Date().toISOString() })));
    }
    return confirmed;
}

export async function applyScriptPatch(
    repository: Pick<ScriptPracticeRepository, "getScriptProject" | "getCurrentScriptDocument" | "createScriptVersion" | "nextScriptVersionNumber" | "compareAndSetCurrentVersion">,
    ownerUserId: string,
    patch: ScriptPatch,
) {
    const project = await repository.getScriptProject(patch.projectId, ownerUserId);
    const current = await repository.getCurrentScriptDocument(patch.projectId, ownerUserId);
    if (!project || !current || !project.currentVersionId || project.currentVersionId !== patch.baseVersionId || patch.currentVersionId !== patch.baseVersionId) throw new ScriptStageServiceError("剧本版本已变化，请刷新后重新预览", 409);
    const blocks = current.blocks.map((block) => (patch.targetBlockIds.includes(block.id) ? { ...block, text: patch.proposedAfter } : block));
    const document: ScriptDocument = { ...current, blocks, version: await repository.nextScriptVersionNumber(patch.projectId, ownerUserId), updatedAt: new Date().toISOString() };
    const version = await repository.createScriptVersion(
        { id: crypto.randomUUID(), projectId: patch.projectId, documentSnapshot: document, source: "ai", operation: patch.operation, parentVersionId: patch.baseVersionId, createdAt: new Date().toISOString() },
        ownerUserId,
    );
    if (!version || !(await repository.compareAndSetCurrentVersion(patch.projectId, ownerUserId, patch.baseVersionId, version.id))) throw new ScriptStageServiceError("剧本版本已变化，请刷新后重新预览", 409);
    return version;
}

export class ScriptStageServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
