import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { createPracticeSessionForUser, listPracticeSessionsForUser } from "@/lib/server/practice-session-service";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";
import { practiceReferenceMediaUrl } from "@/lib/server/practice-reference-authorization";
import { recordWorkflowTaskContext } from "@/lib/server/runninghub-workflow-runtime";

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
                ...(typeof body.workflowCode === "string" ? { workflowCode: body.workflowCode } : {}),
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
        schoolId: input.schoolId,
        projectId: input.sessionId,
        clientRequestId: input.clientRequestId,
        ipReferences,
        ...(input.workflow
            ? {
                  ...recordWorkflowTaskContext(input.workflow),
                  taskOrigin: "user" as const,
              }
            : {}),
    };
    const rawPrompt = typeof input.input.prompt === "string" ? input.input.prompt.trim() : typeof input.input.text === "string" ? input.input.text.trim() : "";
    // 任务路由要求非空 prompt；角色多视图等允许空描述词的工作流用占位标题提交，并把空 prompt 显式写进工作流输入，避免占位文本注入节点.
    const prompt = rawPrompt || "练习任务";
    const workflowInput = { ...Object.fromEntries(Object.entries(input.input).filter(([key]) => key !== "prompt" && key !== "text" && key !== "references")), ...(rawPrompt ? {} : { prompt: "" }) };
    const references = input.references.flatMap((reference) => {
        if (!reference || typeof reference !== "object" || Array.isArray(reference)) return [];
        const source = reference as { type?: unknown; id?: unknown; inputKey?: unknown; scope?: unknown };
        if (source.type !== "asset" || typeof source.id !== "string" || !source.id.trim()) return [];
        const inputKey = normalizePracticeReferenceInputKey(source.inputKey);
        const type = inputKey === "audio" ? "audio" : "image";
        return [{ type, url: practiceReferenceMediaUrl(source.id, source.scope), ...(inputKey ? { inputKey } : {}) }];
    });
    const body =
        input.capability === "text"
            ? { ...workflowInput, config: { model: input.logicalModelId }, messages: [{ role: "user", content: prompt }], context }
            : input.capability === "image"
              ? { ...workflowInput, input: workflowInput, config: { model: input.logicalModelId }, prompt, references, context, source: "practice" }
              : input.capability === "video"
                ? { ...workflowInput, input: workflowInput, config: { model: input.logicalModelId }, prompt, references, context, source: "practice" }
                : { ...workflowInput, input: workflowInput, config: { model: input.logicalModelId }, prompt, context, source: "practice" };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(input.userId, input.schoolId, input.clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const response = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as { task?: { id?: string; type?: string }; error?: string };
    if (!response.ok || !payload.task?.id) throw new Error(payload.error || "练习任务调度失败");
    return { taskId: payload.task.id, taskType: input.capability };
}

function normalizePracticeReferenceInputKey(value: unknown) {
    const key = typeof value === "string" ? value.trim() : "";
    return ["referenceImage", "firstFrameImage", "lastFrameImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image", "audio"].includes(key) ? key : undefined;
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
    const result = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => !blocked.has(key) && (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null)));
    const lines = sanitizeDialogueLines((value as Record<string, unknown>).lines);
    if (lines.length) result.lines = lines;
    return result;
}

function sanitizeDialogueLines(value: unknown) {
    if (!Array.isArray(value)) return [];
    const emotionKeys = ["happy", "sad", "disgust", "fear", "surprise", "angry"] as const;
    return value
        .flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return [];
            const source = item as Record<string, unknown>;
            const text = typeof source.text === "string" ? source.text.trim().slice(0, 2_000) : "";
            if (!text) return [];
            const audioValue = typeof source.audio === "string" ? source.audio.trim().slice(0, 2_000) : typeof source.audioUrl === "string" ? source.audioUrl.trim().slice(0, 2_000) : "";
            const emotionSource = source.emotion && typeof source.emotion === "object" && !Array.isArray(source.emotion) ? (source.emotion as Record<string, unknown>) : {};
            const emotion = Object.fromEntries(emotionKeys.flatMap((key) => (typeof emotionSource[key] === "number" && Number.isFinite(emotionSource[key]) ? [[key, emotionSource[key]]] : [])));
            return [{ text, ...(audioValue ? { audio: audioValue } : {}), ...(Object.keys(emotion).length ? { emotion } : {}) }];
        })
        .slice(0, 10);
}
