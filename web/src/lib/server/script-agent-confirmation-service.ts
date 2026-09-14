import { randomUUID } from "node:crypto";
import { withPostgresTransaction, type QueryExecutor } from "./database/postgres";
import { ScriptAgentRepository } from "./database/script-agent-repository";
import { ScriptAgentRunService } from "./script-agent-run-service";
import type { PracticeTenantScope } from "./practice-tenant-scope";
import type { ScriptRunType } from "./script-agent-domain";

export type ConfirmScriptArtifactInput = {
    projectId: string;
    artifactId: string;
    stageKey: string;
    sourceRunId?: string;
    chatSessionId?: string;
};

export async function confirmScriptArtifactAndStartNext(scope: PracticeTenantScope, input: ConfirmScriptArtifactInput, executor?: QueryExecutor) {
    const operation = async (transaction: QueryExecutor) => {
        const repository = new ScriptAgentRepository(transaction);
        const confirmed = await repository.confirmArtifactAndGetNext(scope, {
            id: randomUUID(),
            projectId: input.projectId,
            artifactId: input.artifactId,
            stageKey: input.stageKey,
            sourceRunId: input.sourceRunId,
        });
        if (!confirmed) return null;
        const nextRun = confirmed.nextRunType
            ? await new ScriptAgentRunService(repository).create(scope, {
                  projectId: input.projectId,
                  runType: confirmed.nextRunType as ScriptRunType,
                  clientRequestId: `confirm:${confirmed.confirmation.id}`,
                  chatSessionId: input.chatSessionId,
                  configSnapshot: { instruction: "根据已确认成果继续下一阶段" },
              })
            : null;
        return { ...confirmed, nextRun };
    };
    return executor ? operation(executor) : withPostgresTransaction(operation);
}
