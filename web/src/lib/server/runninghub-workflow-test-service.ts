import { randomUUID } from "node:crypto";

import { getFreshAuthSettings, setAuthSettings } from "@/lib/auth/store";
import type { GenerationTaskType } from "@/lib/server/generation-task-types";
import { buildRunningHubWorkflowPayload } from "@/lib/server/runninghub-workflow-runtime";
import { queryRunningHubTask, submitRunningHubTask, uploadRunningHubMedia } from "@/lib/server/runninghub-provider";
import { getWorkflowChannel, getWorkflowExecution, RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { runningHubWorkflowConfigFingerprint } from "@/lib/server/runninghub-workflow-domain";

import { createAdminWorkflowTest, getAdminWorkflowTest, updateAdminWorkflowTest, type AdminWorkflowTestRecord } from "./admin-workflow-test-store";

export type WorkflowTestReference = { type: string; inputKey?: string; url?: string; assetId?: string; file?: Blob; fileName?: string };
export type StartWorkflowTestInput = { workflowKey: string; adminId: string; input: Record<string, unknown>; references?: WorkflowTestReference[] };

export async function startRunningHubWorkflowTest(input: StartWorkflowTestInput) {
    const { config, channel } = await getWorkflowExecution(input.workflowKey);
    if (!config.inputSchema.length || !config.nodeMappings.length || !config.outputMappings.length) throw new RunningHubWorkflowError("提交测试前必须确认输入、节点和输出映射", 400);
    const references = await prepareReferences(channel.baseUrl, channel.apiKey || "", input.references || []);
    const payload = buildRunningHubWorkflowPayload({ config, businessInput: input.input, references });
    const configFingerprint = runningHubWorkflowConfigFingerprint(config);
    const type = taskType(config.capability);
    const record = await createAdminWorkflowTest({
        id: randomUUID(),
        userId: input.adminId,
        workflowKey: config.workflowKey,
        workflowVersion: config.version,
        upstreamWorkflowId: config.workflowId,
        businessCode: config.businessCode,
        type,
        status: "pending",
        durationMs: undefined,
        workflowConfig: structuredClone(config),
        configFingerprint,
    });
    try {
        const submitted = await submitRunningHubTask({ baseUrl: channel.baseUrl, apiKey: channel.apiKey || "", config, payload });
        const running = await updateAdminWorkflowTest({ ...record, status: "running", taskId: submitted.taskId });
        return { runId: running.id, status: running.status, taskId: running.taskId, workflowKey: running.workflowKey, workflowVersion: running.workflowVersion };
    } catch (error) {
        const failed = await updateAdminWorkflowTest({ ...record, status: "error", error: safeError(error) });
        await saveWorkflowTestSummary(config.workflowKey, "failed", failed.error, configFingerprint, config.channelId, config.version);
        throw Object.assign(new Error(failed.error), { runId: failed.id });
    }
}

export async function inspectRunningHubWorkflowTest(input: { workflowKey: string; runId: string; adminId: string }) {
    const record =
        (await getAdminWorkflowTest("text", input.runId, input.adminId)) ||
        (await getAdminWorkflowTest("image", input.runId, input.adminId)) ||
        (await getAdminWorkflowTest("video", input.runId, input.adminId)) ||
        (await getAdminWorkflowTest("audio", input.runId, input.adminId));
    if (!record || record.workflowKey !== input.workflowKey || !record.workflowConfig) throw new Error("测试运行不存在");
    const config = record.workflowConfig;
    const channel = await getWorkflowChannel(config.channelId);
    if (!record.taskId) return publicTest(record);
    if (["success", "error", "cancelled"].includes(record.status)) return publicTest(record);
    try {
        const result = await queryRunningHubTask({ baseUrl: channel.baseUrl, apiKey: channel.apiKey || "", config, taskId: record.taskId });
        const status = normalizeUpstreamStatus(result);
        const next: AdminWorkflowTestRecord = {
            ...record,
            status,
            taskId: record.taskId,
            ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}),
            ...(result.resultUrls ? { resultUrls: result.resultUrls } : {}),
            ...(result.resultText ? { resultText: result.resultText } : {}),
            ...(result.outputs ? { outputs: result.outputs } : {}),
            ...(status === "error" ? { error: result.status || "RunningHub 工作流失败" } : {}),
            durationMs: Date.now() - record.createdAt,
        };
        const saved = await updateAdminWorkflowTest(next);
        if (saved.status === "success" || saved.status === "error") await saveWorkflowTestSummary(config.workflowKey, saved.status === "success" ? "success" : "failed", saved.error, saved.configFingerprint, config.channelId, config.version);
        return publicTest(saved);
    } catch (error) {
        const saved = await updateAdminWorkflowTest({ ...record, status: "error", error: safeError(error), durationMs: Date.now() - record.createdAt });
        await saveWorkflowTestSummary(config.workflowKey, "failed", saved.error, record.configFingerprint, config.channelId, config.version);
        return publicTest(saved);
    }
}

function taskType(capability: "text" | "image" | "video" | "audio"): GenerationTaskType {
    return capability;
}

async function prepareReferences(baseUrl: string, apiKey: string, references: WorkflowTestReference[]) {
    return Promise.all(
        references.map(async (reference) => {
            if (!reference.file) return { type: reference.type, inputKey: reference.inputKey, url: reference.url, assetId: reference.assetId };
            const url = await uploadRunningHubMedia({ baseUrl, apiKey, file: reference.file, fileName: reference.fileName || "workflow-test-media" });
            return { type: reference.type, inputKey: reference.inputKey, url };
        }),
    );
}

function normalizeUpstreamStatus(result: { status: string; resultUrl?: string; resultUrls?: string[]; resultText?: string; outputs?: unknown[] }): AdminWorkflowTestRecord["status"] {
    const normalized = result.status.trim().toLowerCase();
    if (["failed", "failure", "error", "cancelled", "canceled"].includes(normalized)) return "error";
    if (["pending", "queued", "running", "processing", "in_progress", "created", "submitted"].includes(normalized)) return "running";
    if (result.resultUrl || result.resultUrls?.length || result.resultText || result.outputs?.length || ["success", "succeeded", "completed", "done", "finished"].includes(normalized)) return "success";
    return "running";
}

function publicTest(record: AdminWorkflowTestRecord) {
    return {
        runId: record.id,
        status: record.status,
        taskId: record.taskId,
        workflowId: record.upstreamWorkflowId,
        configFingerprint: record.configFingerprint,
        workflowKey: record.workflowKey,
        workflowVersion: record.workflowVersion,
        durationMs: record.durationMs,
        resultUrl: record.resultUrl,
        resultUrls: record.resultUrls,
        resultText: record.resultText,
        outputs: record.outputs,
        error: record.error,
    };
}

async function saveWorkflowTestSummary(workflowKey: string, result: "success" | "failed", error?: string, configFingerprint?: string, channelId?: string, version?: number) {
    const settings = await getFreshAuthSettings();
    const systemChannels = settings.systemChannels.map((channel) => {
        const workflows = channel.advancedConfig?.workflowConfigs;
        const current = workflows?.[workflowKey];
        if (channelId && channel.id !== channelId) return channel;
        if (version && current && Number((current as { version?: unknown }).version) !== version) return channel;
        if (!current) return channel;
        return {
            ...channel,
            advancedConfig: {
                ...channel.advancedConfig!,
                workflowConfigs: {
                    ...workflows,
                    [workflowKey]: {
                        ...current,
                        lastTestAt: new Date().toISOString(),
                        lastTestResult: result,
                        ...(result === "success" && configFingerprint ? { lastTestConfigFingerprint: configFingerprint } : { lastTestConfigFingerprint: undefined }),
                        lastTestError: result === "failed" ? error?.slice(0, 500) : undefined,
                    },
                },
            },
        };
    });
    await setAuthSettings({ systemChannels });
}

function safeError(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : "RunningHub 测试失败";
}
