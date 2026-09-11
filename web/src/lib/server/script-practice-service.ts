import { randomUUID } from "node:crypto";
import { createScriptPracticeRepository } from "./database/script-practice-repository";
import { normalizeScriptDocument, parseFdx, parseFountain } from "@/lib/script-practice-contract";
import type { ScriptDocument, ScriptSourceType } from "@/lib/script-practice-types";

export async function createScriptProject(ownerUserId: string, input: { title: string; sourceType: ScriptSourceType; idea?: string }) {
    const document = normalizeScriptDocument({ blocks: input.idea ? [{ type: "action", text: input.idea }] : [] });
    return persistScriptProject(ownerUserId, input, document, "user");
}

export async function listScriptProjects(ownerUserId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: "draft" | "writing" | "completed" } = {}) {
    return createScriptPracticeRepository().listScriptProjects(ownerUserId, input);
}

export async function getScriptProjectDetail(ownerUserId: string, projectId: string) {
    const repository = createScriptPracticeRepository();
    const project = await repository.getScriptProject(projectId, ownerUserId);
    if (!project) throw new ScriptPracticeServiceError("剧本项目不存在", 404);
    return {
        project,
        document: await repository.getCurrentScriptDocument(projectId, ownerUserId),
        versions: await repository.listScriptVersions(projectId, ownerUserId),
        entities: await repository.listScriptEntities(projectId, ownerUserId),
        stages: await repository.listScriptStages(projectId, ownerUserId),
    };
}

export async function updateScriptProject(ownerUserId: string, projectId: string, patch: import("./database/script-practice-repository").ScriptProjectPatch) {
    const project = await createScriptPracticeRepository().updateScriptProject(projectId, ownerUserId, patch);
    if (!project) throw new ScriptPracticeServiceError("剧本项目不存在", 404);
    return project;
}

export async function deleteScriptProject(ownerUserId: string, projectId: string) {
    if (!(await createScriptPracticeRepository().deleteScriptProject(projectId, ownerUserId))) throw new ScriptPracticeServiceError("剧本项目不存在", 404);
    return { deleted: true };
}

export async function importScriptProject(ownerUserId: string, input: { title: string; format: "fountain" | "fdx" | "text" | "markdown"; content: string; confirm: boolean }) {
    const document =
        input.format === "fountain"
            ? parseFountain(input.content)
            : input.format === "fdx"
              ? parseFdx(input.content)
              : normalizeScriptDocument({
                    blocks: input.content
                        .split(/\n{2,}/)
                        .filter(Boolean)
                        .map((text) => ({ type: "action", text })),
                });
    if (!input.confirm) return { preview: true, format: input.format, document };
    const persistedDocument = { ...document, projectId: "", id: "", createdAt: "", updatedAt: "" };
    return persistScriptProject(ownerUserId, { title: input.title, sourceType: input.format }, persistedDocument, "import");
}

async function persistScriptProject(ownerUserId: string, input: { title: string; sourceType: ScriptSourceType }, sourceDocument: ScriptDocument, source: "user" | "import") {
    const repository = createScriptPracticeRepository();
    const now = new Date().toISOString();
    const project = await repository.createScriptProject({ id: randomUUID(), title: input.title, sourceType: input.sourceType, status: "draft" }, ownerUserId);
    const document = normalizeScriptDocument({ ...sourceDocument, projectId: project.id }, { projectId: project.id, documentId: randomUUID(), version: 1, now });
    const version = await repository.createScriptVersion({ id: randomUUID(), projectId: project.id, documentSnapshot: document, source, createdAt: now }, ownerUserId);
    if (!version || !(await repository.compareAndSetCurrentVersion(project.id, ownerUserId, undefined, version.id))) throw new Error("剧本文档创建失败");
    const currentProject = { ...project, currentVersionId: version.id };
    return source === "import" ? { project: currentProject, document } : { ...currentProject, document };
}

export class ScriptPracticeServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
