import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { createPracticeSessionForUser, listPracticeSessionsForUser } from "@/lib/server/practice-session-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        const result = await listPracticeSessionsForUser(user, { page: params.get("page"), pageSize: params.get("pageSize"), module: params.get("module") as never });
        return NextResponse.json({ code: 0, data: result, msg: "OK" });
    } catch (error) {
        return knownError(error);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<unknown>(request, 2 * 1024 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        const body = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>) : {};
        const input = sanitizePracticeInput(body.input);
        const session = await createPracticeSessionForUser(
            user,
            {
                module: body.module as never,
                ...(body.mode === "manual" || body.mode === "workflow" ? { mode: body.mode } : {}),
                title: typeof body.title === "string" ? body.title : "",
                input,
                references: Array.isArray(body.references) ? body.references : [],
                ...(typeof body.logicalModelId === "string" ? { logicalModelId: body.logicalModelId } : {}),
                clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : "",
                projectId: typeof body.projectId === "string" ? body.projectId : undefined,
                projectKind: body.projectKind === "drama" ? "drama" : "canvas",
            },
            { dispatch: (input) => dispatchPracticeTask(request, input) },
        );
        return NextResponse.json({ code: 0, data: { session }, msg: "练习任务已创建" });
    } catch (error) {
        return knownError(error);
    }
}

async function dispatchPracticeTask(request: Request, input: import("@/lib/server/practice-session-service").PracticeTaskDispatchInput) {
    const endpoint = input.capability === "text" ? "/api/text-tasks" : input.capability === "image" ? "/api/image-tasks" : input.capability === "video" ? "/api/video-generation-tasks" : "/api/audio-tasks";
    const ipReferences = input.references.filter((reference) => reference && typeof reference === "object" && !Array.isArray(reference) && (reference as { type?: unknown }).type === "ip");
    const context = {
        surface: input.projectKind === "drama" ? "drama" : "canvas",
        executionProfile: "open-source-practice" as const,
        projectId: input.sessionId,
        clientRequestId: input.clientRequestId,
        ipReferences,
        ...(input.workflow
            ? {
                  workflowKey: input.workflow.workflowKey,
                  workflowVersion: input.workflow.version,
                  upstreamWorkflowId: input.workflow.workflowId,
                  businessCode: input.workflow.businessCode,
                  taskOrigin: "user" as const,
              }
            : {}),
    };
    const prompt = typeof input.input.prompt === "string" ? input.input.prompt : typeof input.input.text === "string" ? input.input.text : "练习任务";
    const body =
        input.capability === "text"
            ? { config: { model: input.logicalModelId }, messages: Array.isArray(input.input.messages) ? input.input.messages : [{ role: "user", content: prompt }], context }
            : input.capability === "image"
              ? { config: { model: input.logicalModelId }, prompt, references: input.references, context, source: "practice" }
              : input.capability === "video"
                ? { config: { model: input.logicalModelId }, prompt, references: input.references, context, source: "practice" }
                : { config: { model: input.logicalModelId }, prompt, context, source: "practice" };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(input.userId, input.clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const response = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; type?: string }; error?: string };
    if (!response.ok || !payload.task?.id) throw new Error(payload.error || "练习任务调度失败");
    return { taskId: payload.task.id, taskType: input.capability };
}

function knownError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return response(status, error instanceof Error ? error.message : "练习会话请求失败");
}

function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}

function sanitizePracticeInput(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const blocked = new Set(["provider", "model", "channelId", "workflowId", "workflowKey", "taskRefs", "pointsCost", "executionProfile"]);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => !blocked.has(key) && (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null)));
}
