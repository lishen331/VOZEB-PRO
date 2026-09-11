import type { QueryExecutor } from "./postgres";
import { getDatabaseProvider, postgresQuery } from "./postgres";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import type { JsonValue } from "./repository-types";
import type { ScriptDocument, ScriptEntity, ScriptEntityType, ScriptPracticeProject, ScriptProjectStatus, ScriptSourceType, ScriptStage, ScriptStageKey, ScriptStageStatus, ScriptVersion } from "@/lib/script-practice-types";
import { isoValue, jsonParam, jsonValue, normalizePage, normalizePageSize, optionalString, pageResult, stringValue } from "./repository-utils";

export type ScriptProjectListInput = { page?: number; pageSize?: number; keyword?: string; status?: ScriptProjectStatus };
export type ScriptProjectCreateInput = Omit<ScriptPracticeProject, "userId" | "createdAt" | "updatedAt">;
export type ScriptProjectPatch = Partial<Pick<ScriptPracticeProject, "title" | "genre" | "logline" | "synopsis" | "status" | "sourceType" | "currentVersionId">>;
export type ScriptAgentOperationRecord = {
    id: string;
    projectId: string;
    documentId?: string;
    baseVersionId?: string;
    operation: string;
    modelSnapshot?: JsonValue;
    skillSnapshot?: JsonValue;
    workflowSnapshot?: JsonValue;
    beforePatch?: JsonValue;
    proposedPatch?: JsonValue;
    afterPatch?: JsonValue;
    status: "proposed" | "applied" | "failed";
    errorMessage?: string;
    createdAt: string;
};

export class ScriptPracticeRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createScriptProject(input: ScriptProjectCreateInput, ownerUserId: string) {
        const result = await this.db.query("INSERT INTO practice_script_projects (id, owner_user_id, title, genre, logline, synopsis, status, source_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *", [
            input.id,
            ownerUserId,
            input.title,
            input.genre || null,
            input.logline || null,
            input.synopsis || null,
            input.status,
            input.sourceType,
        ]);
        return mapProject(result.rows[0]);
    }

    async getScriptProject(id: string, ownerUserId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM practice_script_projects WHERE id = $1 AND owner_user_id = $2${forUpdate ? " FOR UPDATE" : ""}`, [id, ownerUserId]);
        return result.rows[0] ? mapProject(result.rows[0]) : null;
    }

    async listScriptProjects(ownerUserId: string, input: ScriptProjectListInput = {}) {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim() || "";
        const values = [ownerUserId, input.status || null, keyword ? `%${keyword}%` : null, pageSize, (page - 1) * pageSize];
        const where = "owner_user_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR title ILIKE $3 OR logline ILIKE $3)";
        const [items, count] = await Promise.all([
            this.db.query(`SELECT * FROM practice_script_projects WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT $4 OFFSET $5`, values),
            this.db.query(`SELECT count(*)::int AS total FROM practice_script_projects WHERE ${where}`, values.slice(0, 3)),
        ]);
        return pageResult(items.rows.map(mapProject), Number(count.rows[0]?.total || 0), page, pageSize);
    }

    async updateScriptProject(id: string, ownerUserId: string, patch: ScriptProjectPatch) {
        const assignments: string[] = [];
        const values: unknown[] = [id, ownerUserId];
        const add = (column: string, value: unknown) => {
            values.push(value);
            assignments.push(`${column} = $${values.length}`);
        };
        if (patch.title !== undefined) add("title", patch.title);
        if (patch.genre !== undefined) add("genre", patch.genre || null);
        if (patch.logline !== undefined) add("logline", patch.logline || null);
        if (patch.synopsis !== undefined) add("synopsis", patch.synopsis || null);
        if (patch.status !== undefined) add("status", patch.status);
        if (patch.sourceType !== undefined) add("source_type", patch.sourceType);
        if (patch.currentVersionId !== undefined) add("current_version_id", patch.currentVersionId || null);
        if (!assignments.length) return this.getScriptProject(id, ownerUserId);
        assignments.push("updated_at = now()");
        const result = await this.db.query(`UPDATE practice_script_projects SET ${assignments.join(", ")} WHERE id = $1 AND owner_user_id = $2 RETURNING *`, values);
        return result.rows[0] ? mapProject(result.rows[0]) : null;
    }

    async deleteScriptProject(id: string, ownerUserId: string) {
        const result = await this.db.query("DELETE FROM practice_script_projects WHERE id = $1 AND owner_user_id = $2", [id, ownerUserId]);
        return result.rowCount === 1;
    }

    async nextScriptVersionNumber(projectId: string, ownerUserId: string) {
        const result = await this.db.query("SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version FROM practice_script_versions WHERE project_id = $1 AND owner_user_id = $2", [projectId, ownerUserId]);
        return Number(result.rows[0]?.next_version || 1);
    }

    async createScriptVersion(input: ScriptVersion, ownerUserId: string) {
        if (!(await this.getScriptProject(input.projectId, ownerUserId))) return null;
        const result = await this.db.query("INSERT INTO practice_script_versions (id, project_id, owner_user_id, version, document_json, source, operation, parent_version_id, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING *", [
            input.id,
            input.projectId,
            ownerUserId,
            input.documentSnapshot.version,
            jsonParam(input.documentSnapshot as unknown as JsonValue),
            input.source,
            input.operation || null,
            input.parentVersionId || null,
            input.createdAt,
        ]);
        return mapVersion(result.rows[0]);
    }

    async listScriptVersions(projectId: string, ownerUserId: string, input: { page?: number; pageSize?: number } = {}) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return pageResult([], 0, normalizePage(input.page), normalizePageSize(input.pageSize));
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const values = [projectId, ownerUserId, pageSize, (page - 1) * pageSize];
        const [items, count] = await Promise.all([
            this.db.query("SELECT * FROM practice_script_versions WHERE project_id = $1 AND owner_user_id = $2 ORDER BY version DESC LIMIT $3 OFFSET $4", values),
            this.db.query("SELECT count(*)::int AS total FROM practice_script_versions WHERE project_id = $1 AND owner_user_id = $2", values.slice(0, 2)),
        ]);
        return pageResult(items.rows.map(mapVersion), Number(count.rows[0]?.total || 0), page, pageSize);
    }

    async getScriptVersion(projectId: string, versionId: string, ownerUserId: string) {
        const result = await this.db.query("SELECT v.* FROM practice_script_versions v JOIN practice_script_projects p ON p.id = v.project_id AND p.owner_user_id = v.owner_user_id WHERE v.project_id = $1 AND v.id = $2 AND v.owner_user_id = $3", [
            projectId,
            versionId,
            ownerUserId,
        ]);
        return result.rows[0] ? mapVersion(result.rows[0]) : null;
    }

    async compareAndSetCurrentVersion(projectId: string, ownerUserId: string, baseVersionId: string | undefined, nextVersionId: string) {
        const result = await this.db.query(
            "UPDATE practice_script_projects SET current_version_id = $4, updated_at = now() WHERE id = $1 AND owner_user_id = $2 AND ($3::text IS NULL OR current_version_id = $3) AND EXISTS (SELECT 1 FROM practice_script_versions WHERE id = $4 AND project_id = $1 AND owner_user_id = $2)",
            [projectId, ownerUserId, baseVersionId || null, nextVersionId],
        );
        return result.rowCount === 1;
    }

    async getCurrentScriptDocument(projectId: string, ownerUserId: string) {
        const result = await this.db.query(
            "SELECT v.document_json FROM practice_script_projects p JOIN practice_script_versions v ON v.id = p.current_version_id AND v.project_id = p.id AND v.owner_user_id = p.owner_user_id WHERE p.id = $1 AND p.owner_user_id = $2",
            [projectId, ownerUserId],
        );
        return result.rows[0] ? (jsonValue(result.rows[0].document_json) as unknown as ScriptDocument) : null;
    }

    async upsertScriptEntity(projectId: string, ownerUserId: string, entity: ScriptEntity) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return null;
        const result = await this.db.query(
            "INSERT INTO practice_script_entities (id, project_id, owner_user_id, type, name, description, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT (project_id, id) DO UPDATE SET type = EXCLUDED.type, name = EXCLUDED.name, description = EXCLUDED.description, metadata = EXCLUDED.metadata RETURNING *",
            [entity.id, projectId, ownerUserId, entity.type, entity.name, entity.description || null, jsonParam((entity.metadata || {}) as JsonValue)],
        );
        return mapEntity(result.rows[0]);
    }

    async listScriptEntities(projectId: string, ownerUserId: string, type?: ScriptEntityType) {
        const result = await this.db.query("SELECT * FROM practice_script_entities WHERE project_id = $1 AND owner_user_id = $2 AND ($3::text IS NULL OR type = $3) ORDER BY name ASC, id ASC", [projectId, ownerUserId, type || null]);
        return result.rows.map(mapEntity);
    }

    async setScriptStage(projectId: string, ownerUserId: string, stage: ScriptStage) {
        const result = await this.db.query(
            "INSERT INTO practice_script_stages (project_id, owner_user_id, stage_key, status, draft_json, confirmed_json, error_message) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) ON CONFLICT (project_id, stage_key) DO UPDATE SET status = EXCLUDED.status, draft_json = COALESCE(EXCLUDED.draft_json, practice_script_stages.draft_json), confirmed_json = COALESCE(EXCLUDED.confirmed_json, practice_script_stages.confirmed_json), error_message = EXCLUDED.error_message, updated_at = now() RETURNING *",
            [projectId, ownerUserId, stage.key, stage.status, jsonParam((stage.draft === undefined ? null : stage.draft) as JsonValue), jsonParam((stage.confirmed === undefined ? null : stage.confirmed) as JsonValue), stage.error || null],
        );
        return result.rows[0] ? mapStage(result.rows[0]) : null;
    }

    async getScriptStage(projectId: string, ownerUserId: string, key: ScriptStageKey) {
        const result = await this.db.query("SELECT * FROM practice_script_stages WHERE project_id = $1 AND owner_user_id = $2 AND stage_key = $3", [projectId, ownerUserId, key]);
        return result.rows[0] ? mapStage(result.rows[0]) : null;
    }
    async listScriptStages(projectId: string, ownerUserId: string) {
        const result = await this.db.query("SELECT * FROM practice_script_stages WHERE project_id = $1 AND owner_user_id = $2 ORDER BY stage_key ASC", [projectId, ownerUserId]);
        return result.rows.map(mapStage);
    }

    async recordScriptAgentOperation(input: ScriptAgentOperationRecord, ownerUserId: string) {
        if (!(await this.getScriptProject(input.projectId, ownerUserId))) return null;
        const result = await this.db.query(
            "INSERT INTO practice_script_agent_operations (id, project_id, owner_user_id, document_id, base_version_id, operation, model_snapshot, skill_snapshot, workflow_snapshot, before_patch, proposed_patch, after_patch, status, error_message, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15) RETURNING *",
            [
                input.id,
                input.projectId,
                ownerUserId,
                input.documentId || null,
                input.baseVersionId || null,
                input.operation,
                jsonParam(input.modelSnapshot || null),
                jsonParam(input.skillSnapshot || null),
                jsonParam(input.workflowSnapshot || null),
                jsonParam(input.beforePatch || null),
                jsonParam(input.proposedPatch || null),
                jsonParam(input.afterPatch || null),
                input.status,
                input.errorMessage || null,
                input.createdAt,
            ],
        );
        return mapAgentOperation(result.rows[0]);
    }
}

export function createPostgresScriptPracticeRepository(executor: QueryExecutor) {
    return new ScriptPracticeRepository(executor);
}

export function createScriptPracticeRepository(executor?: QueryExecutor) {
    if (getDatabaseProvider() === "file") return new FileScriptPracticeRepository();
    return new ScriptPracticeRepository(executor || { query: postgresQuery });
}

function mapProject(row: Record<string, unknown>): ScriptPracticeProject {
    return {
        id: stringValue(row.id),
        userId: stringValue(row.owner_user_id),
        title: stringValue(row.title),
        ...(optionalString(row.genre) ? { genre: optionalString(row.genre) } : {}),
        ...(optionalString(row.logline) ? { logline: optionalString(row.logline) } : {}),
        ...(optionalString(row.synopsis) ? { synopsis: optionalString(row.synopsis) } : {}),
        status: row.status === "writing" || row.status === "completed" ? row.status : "draft",
        sourceType: ["fountain", "fdx", "text", "markdown"].includes(row.source_type as ScriptSourceType) ? (row.source_type as ScriptSourceType) : "idea",
        ...(optionalString(row.current_version_id) ? { currentVersionId: optionalString(row.current_version_id) } : {}),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapVersion(row: Record<string, unknown>): ScriptVersion {
    return {
        id: stringValue(row.id),
        projectId: stringValue(row.project_id),
        documentSnapshot: jsonValue(row.document_json) as unknown as ScriptDocument,
        source: row.source === "ai" || row.source === "import" || row.source === "restore" ? row.source : "user",
        ...(optionalString(row.operation) ? { operation: optionalString(row.operation) } : {}),
        ...(optionalString(row.parent_version_id) ? { parentVersionId: optionalString(row.parent_version_id) } : {}),
        createdAt: isoValue(row.created_at),
    };
}
function mapEntity(row: Record<string, unknown>): ScriptEntity {
    return {
        id: stringValue(row.id),
        projectId: stringValue(row.project_id),
        type: row.type as ScriptEntityType,
        name: stringValue(row.name),
        ...(optionalString(row.description) ? { description: optionalString(row.description) } : {}),
        metadata: jsonValue(row.metadata) as Record<string, unknown>,
    };
}
function mapStage(row: Record<string, unknown>): ScriptStage {
    return {
        projectId: stringValue(row.project_id),
        key: stringValue(row.stage_key) as ScriptStageKey,
        status: stringValue(row.status) as ScriptStageStatus,
        draft: jsonValue(row.draft_json),
        confirmed: jsonValue(row.confirmed_json),
        ...(optionalString(row.error_message) ? { error: optionalString(row.error_message) } : {}),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapAgentOperation(row: Record<string, unknown>): ScriptAgentOperationRecord {
    return {
        id: stringValue(row.id),
        projectId: stringValue(row.project_id),
        documentId: optionalString(row.document_id),
        baseVersionId: optionalString(row.base_version_id),
        operation: stringValue(row.operation),
        modelSnapshot: jsonValue(row.model_snapshot),
        skillSnapshot: jsonValue(row.skill_snapshot),
        workflowSnapshot: jsonValue(row.workflow_snapshot),
        beforePatch: jsonValue(row.before_patch),
        proposedPatch: jsonValue(row.proposed_patch),
        afterPatch: jsonValue(row.after_patch),
        status: row.status as ScriptAgentOperationRecord["status"],
        errorMessage: optionalString(row.error_message),
        createdAt: isoValue(row.created_at),
    };
}
type ScriptPracticeFile = {
    projects: ScriptPracticeProject[];
    versions: ScriptVersion[];
    entities: ScriptEntity[];
    stages: ScriptStage[];
    operations: ScriptAgentOperationRecord[];
};
const SCRIPT_PRACTICE_DATA_FILE = "script-practice.json";
const EMPTY_SCRIPT_PRACTICE_FILE: ScriptPracticeFile = { projects: [], versions: [], entities: [], stages: [], operations: [] };

class FileScriptPracticeRepository {
    private async read() {
        return readJsonDataFile<ScriptPracticeFile>(SCRIPT_PRACTICE_DATA_FILE, EMPTY_SCRIPT_PRACTICE_FILE);
    }
    private async mutate<T>(operation: (state: ScriptPracticeFile) => T) {
        return withJsonDataFileLock(SCRIPT_PRACTICE_DATA_FILE, async () => {
            const state = await this.read();
            const result = operation(state);
            await writeJsonDataFile(SCRIPT_PRACTICE_DATA_FILE, state);
            return result;
        });
    }
    async createScriptProject(input: ScriptProjectCreateInput, ownerUserId: string) {
        return this.mutate((state) => {
            const project = { ...input, userId: ownerUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            state.projects.push(project);
            return structuredClone(project);
        });
    }
    async getScriptProject(id: string, ownerUserId: string) {
        const state = await this.read();
        const project = state.projects.find((item) => item.id === id && item.userId === ownerUserId);
        return project ? structuredClone(project) : null;
    }
    async listScriptProjects(ownerUserId: string, input: ScriptProjectListInput = {}) {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const items = (await this.read()).projects
            .filter((item) => item.userId === ownerUserId && (!input.status || item.status === input.status) && (!keyword || item.title.toLowerCase().includes(keyword) || (item.logline || "").toLowerCase().includes(keyword)))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
        return pageResult(
            items.slice((page - 1) * pageSize, page * pageSize).map((item) => structuredClone(item)),
            items.length,
            page,
            pageSize,
        );
    }
    async updateScriptProject(id: string, ownerUserId: string, patch: ScriptProjectPatch) {
        return this.mutate((state) => {
            const project = state.projects.find((item) => item.id === id && item.userId === ownerUserId);
            if (!project) return null;
            Object.assign(project, patch, { updatedAt: new Date().toISOString() });
            return structuredClone(project);
        });
    }
    async deleteScriptProject(id: string, ownerUserId: string) {
        return this.mutate((state) => {
            const index = state.projects.findIndex((item) => item.id === id && item.userId === ownerUserId);
            if (index < 0) return false;
            state.projects.splice(index, 1);
            state.versions = state.versions.filter((item) => item.projectId !== id);
            state.entities = state.entities.filter((item) => item.projectId !== id);
            state.stages = state.stages.filter((item) => item.projectId !== id);
            state.operations = state.operations.filter((item) => item.projectId !== id);
            return true;
        });
    }
    async nextScriptVersionNumber(projectId: string, ownerUserId: string) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return 1;
        return Math.max(0, ...(await this.read()).versions.filter((item) => item.projectId === projectId).map((item) => item.documentSnapshot.version)) + 1;
    }
    async createScriptVersion(input: ScriptVersion, ownerUserId: string) {
        return this.mutate((state) => {
            if (!state.projects.some((item) => item.id === input.projectId && item.userId === ownerUserId)) return null;
            state.versions.push(structuredClone(input));
            return structuredClone(input);
        });
    }
    async listScriptVersions(projectId: string, ownerUserId: string, input: { page?: number; pageSize?: number } = {}) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return pageResult([], 0, normalizePage(input.page), normalizePageSize(input.pageSize));
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const items = (await this.read()).versions.filter((item) => item.projectId === projectId).sort((a, b) => b.documentSnapshot.version - a.documentSnapshot.version);
        return pageResult(
            items.slice((page - 1) * pageSize, page * pageSize).map((item) => structuredClone(item)),
            items.length,
            page,
            pageSize,
        );
    }
    async getScriptVersion(projectId: string, versionId: string, ownerUserId: string) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return null;
        const version = (await this.read()).versions.find((item) => item.projectId === projectId && item.id === versionId);
        return version ? structuredClone(version) : null;
    }
    async compareAndSetCurrentVersion(projectId: string, ownerUserId: string, baseVersionId: string | undefined, nextVersionId: string) {
        return this.mutate((state) => {
            const project = state.projects.find((item) => item.id === projectId && item.userId === ownerUserId);
            if (!project || (baseVersionId !== undefined && project.currentVersionId !== baseVersionId) || !state.versions.some((item) => item.projectId === projectId && item.id === nextVersionId)) return false;
            project.currentVersionId = nextVersionId;
            project.updatedAt = new Date().toISOString();
            return true;
        });
    }
    async getCurrentScriptDocument(projectId: string, ownerUserId: string) {
        const project = await this.getScriptProject(projectId, ownerUserId);
        if (!project?.currentVersionId) return null;
        const version = (await this.read()).versions.find((item) => item.projectId === projectId && item.id === project.currentVersionId);
        return version ? structuredClone(version.documentSnapshot) : null;
    }
    async upsertScriptEntity(projectId: string, ownerUserId: string, entity: ScriptEntity) {
        return this.mutate((state) => {
            if (!state.projects.some((item) => item.id === projectId && item.userId === ownerUserId)) return null;
            const index = state.entities.findIndex((item) => item.projectId === projectId && item.id === entity.id);
            if (index >= 0) state.entities[index] = structuredClone(entity);
            else state.entities.push(structuredClone(entity));
            return structuredClone(entity);
        });
    }
    async listScriptEntities(projectId: string, ownerUserId: string, type?: ScriptEntityType) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return [];
        return (await this.read()).entities.filter((item) => item.projectId === projectId && (!type || item.type === type)).map((item) => structuredClone(item));
    }
    async setScriptStage(projectId: string, ownerUserId: string, stage: ScriptStage) {
        return this.mutate((state) => {
            if (!state.projects.some((item) => item.id === projectId && item.userId === ownerUserId)) return null;
            const index = state.stages.findIndex((item) => item.projectId === projectId && item.key === stage.key);
            if (index >= 0) state.stages[index] = structuredClone(stage);
            else state.stages.push(structuredClone(stage));
            return structuredClone(stage);
        });
    }
    async getScriptStage(projectId: string, ownerUserId: string, key: ScriptStageKey) {
        const stage = (await this.read()).stages.find((item) => item.projectId === projectId && item.key === key);
        return stage && (await this.getScriptProject(projectId, ownerUserId)) ? structuredClone(stage) : null;
    }
    async listScriptStages(projectId: string, ownerUserId: string) {
        if (!(await this.getScriptProject(projectId, ownerUserId))) return [];
        return (await this.read()).stages.filter((item) => item.projectId === projectId).map((item) => structuredClone(item));
    }
    async recordScriptAgentOperation(input: ScriptAgentOperationRecord, ownerUserId: string) {
        return this.mutate((state) => {
            if (!state.projects.some((item) => item.id === input.projectId && item.userId === ownerUserId)) return null;
            state.operations.push(structuredClone(input));
            return structuredClone(input);
        });
    }
}
