import { randomUUID } from "node:crypto";
import type { PracticeTenantScope } from "./practice-tenant-scope";
import type { ScriptRunType } from "./script-agent-domain";
import { ScriptAgentRepository } from "./database/script-agent-repository";

export class ScriptAgentRunService {
    constructor(
        private readonly repository: ScriptAgentRepository,
        private readonly id: () => string = randomUUID,
    ) {}

    async create(scope: PracticeTenantScope, input: { projectId: string; chatSessionId?: string; runType: ScriptRunType; stageKey?: string; clientRequestId: string; configSnapshot?: Record<string, unknown> }) {
        const run = await this.repository.createRun(scope, {
            id: this.id(),
            projectId: input.projectId,
            chatSessionId: input.chatSessionId,
            runType: input.runType,
            stageKey: input.stageKey,
            clientRequestId: input.clientRequestId,
            configSnapshot: input.configSnapshot || {},
        });
        if (!run) throw new ScriptAgentRunError("剧本 Run 创建失败", 500);
        if (run.lastEventSequence === 0) await this.repository.appendRunEvent(scope, input.projectId, run.id, "run_started", { runType: run.runType, stageKey: run.stageKey }, this.id());
        return run;
    }

    async stop(scope: PracticeTenantScope, projectId: string, runId: string) {
        const run = await this.repository.getRun(scope, projectId, runId);
        if (!run) throw new ScriptAgentRunError("剧本 Run 不存在", 404);
        if (["success", "failed", "stopped"].includes(run.status)) return run;
        const updated = await this.repository.updateRun(scope, projectId, runId, { status: "stopped", completedAt: new Date().toISOString() });
        await this.repository.appendRunEvent(scope, projectId, runId, "run_stopped", {}, this.id());
        return updated || { ...run, status: "stopped" as const };
    }

    async retryFailed(scope: PracticeTenantScope, projectId: string, runId: string) {
        const run = await this.repository.getRun(scope, projectId, runId);
        if (!run) throw new ScriptAgentRunError("剧本 Run 不存在", 404);
        const failed = await this.repository.listRunItems(scope, projectId, runId, "failed");
        const queued = [];
        for (const item of latestItems(failed)) {
            const retry = await this.repository.createRunItem(scope, projectId, { ...item, id: this.id(), status: "queued", attemptNo: item.attemptNo + 1, artifactId: undefined, errorCode: undefined, errorMessage: undefined });
            if (retry) queued.push(retry);
        }
        if (queued.length) await this.repository.updateRun(scope, projectId, runId, { status: "running", completedAt: undefined, errorCode: undefined, errorMessage: undefined });
        return queued;
    }
}

function latestItems<T extends { itemType: string; itemKey: string; attemptNo: number }>(items: T[]) {
    const latest = new Map<string, T>();
    for (const item of items) {
        const key = `${item.itemType}:${item.itemKey}`;
        const previous = latest.get(key);
        if (!previous || previous.attemptNo < item.attemptNo) latest.set(key, item);
    }
    return [...latest.values()];
}
export class ScriptAgentRunError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
