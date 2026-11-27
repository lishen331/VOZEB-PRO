import { OUTPAINTING_HISTORY_LIMIT, OUTPAINTING_TITLE, outpaintingGeometry, outpaintingLesson, readOutpaintingSelection, readOutpaintingSnapshot, type OutpaintingRecord } from "@/lib/practice-outpainting";
import { supportsOutpaintingOutput } from "@/lib/server/practice-image-capabilities";
import { outpaintingSourceSize, prepareOutpainting } from "@/lib/server/practice-outpainting-service";
import { writePersistentMediaDataUrl, writeReferenceImageDataUrl } from "@/lib/server/reference-asset-store";
import { readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import { creativeUploadMaxBytes } from "@/lib/creative-upload";
import { toSystemGenerationChannel } from "@/lib/server/generation-channel";
import { randomUUID } from "node:crypto";
import { expressionLesson, EXPRESSION_HISTORY_LIMIT, readExpressionSelection, type ExpressionPracticeRecord } from "@/lib/practice-expression-learning";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getAuthSettings } from "@/lib/auth/store";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { practiceCanvasVirtualModel, resolvePracticeGenerationCandidates } from "@/lib/server/runninghub-workflow-runtime";
import { fetchInternalApi, resolveInternalOrigin } from "@/lib/server/internal-origin";
import { trustedPracticeTaskHeaders } from "@/lib/server/generation-execution-policy";
import { getPracticeImageToolConfig, LOCAL_EDIT_HISTORY_LIMIT, LOCAL_EDIT_PROMPT_PREFIX, type LocalEditPracticeRecord } from "@/lib/practice-image-tools";
import { createStoredGenerationTask, getStoredGenerationTaskByRequest, queryStoredGenerationTasks } from "@/lib/server/generation-task-store";
import type { ImageTask } from "@/lib/server/image-task-store";
import { buildPracticeReversePromptInstruction } from "@/lib/practice-reverse-prompt";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired } from "@/lib/server/local-media-registry";
import { createSignedReferenceAssetUrl } from "@/lib/server/reference-asset-access";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { toSafeGenerationErrorMessage } from "@/lib/server/generation-errors";

import { readReversePromptHistoryInput } from "@/lib/practice-reverse-prompt-history";
import { attachReversePromptHistory, getReversePromptHistory, reversePromptHistoryEnabled } from "@/lib/server/practice-reverse-prompt-history-store";

type ToolRequest = {
    action?: unknown;
    toolId?: unknown;
    sourceUrl?: unknown;
    maskUrl?: unknown;
    prompt?: unknown;
    clientRequestId?: unknown;
    options?: unknown;
    expression?: unknown;
    reverseHistory?: unknown;
    reverseHistoryId?: unknown;
    outpainting?: unknown;
};

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse("请先登录", 401);
    let access: Awaited<ReturnType<typeof requirePracticeAccess>>;
    try {
        access = await requirePracticeAccess(user);
    } catch (cause) {
        return practiceAccessErrorResponse(cause);
    }
    try {
        if (new URL(request.url).searchParams.get("history") === "ai-outpainting") {
            const tasks = await queryStoredGenerationTasks<ImageTask>("image", { userId: user.id, outpaintingSchoolId: access.schoolId, statuses: ["success"], limit: OUTPAINTING_HISTORY_LIMIT });
            return NextResponse.json({ records: tasks.map(publicOutpaintingRecord).filter(Boolean) }, { headers: { "Cache-Control": "private, no-store" } });
        }
        if (new URL(request.url).searchParams.get("history") === "expression-reference") {
            const tasks = await queryStoredGenerationTasks<ImageTask>("image", { userId: user.id, expressionSchoolId: access.schoolId, limit: EXPRESSION_HISTORY_LIMIT });
            return NextResponse.json({ records: tasks.map(publicExpressionRecord).filter(Boolean) }, { headers: { "Cache-Control": "private, no-store" } });
        }
        const tasks = await queryStoredGenerationTasks<ImageTask>("image", { userId: user.id, statuses: ["success"], localEditSchoolId: access.schoolId, limit: LOCAL_EDIT_HISTORY_LIMIT });
        const records = tasks.flatMap((task) => {
            const sourceUrl = managedPracticeAssetPath(task.references?.[0]?.url, "reference-assets");
            const maskUrl = managedPracticeAssetPath(task.mask?.url, "reference-assets");
            const media = task.result?.results?.[0] || task.result;
            const resultUrl = managedPracticeAssetPath(media?.serverUrl || media?.dataUrl, "generation-log-assets");
            if (!sourceUrl || !maskUrl || !resultUrl || !media) return [];
            const record: LocalEditPracticeRecord = {
                id: task.id,
                createdAt: task.createdAt,
                model: task.config.logicalModel || task.config.model,
                prompt: task.prompt.startsWith(LOCAL_EDIT_PROMPT_PREFIX) ? task.prompt.slice(LOCAL_EDIT_PROMPT_PREFIX.length) : task.prompt,
                sourceUrl,
                maskUrl,
                image: { url: resultUrl, storageKey: "", width: media.width || 0, height: media.height || 0, bytes: media.bytes || 0, mimeType: media.mimeType || "image/png" },
            };
            return [record];
        });
        return NextResponse.json({ records }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return errorResponse("练习历史读取失败，请稍后重试", 503);
    }
}

function publicExpressionRecord(task: ImageTask): ExpressionPracticeRecord | null {
    const selection = readExpressionSelection(task.practiceExpression);
    const sourceUrl = managedPracticeAssetPath(task.references?.[0]?.url, "reference-assets");
    if (!selection || !sourceUrl || !task.prompt) return null;
    const media = task.result?.results?.[0] || task.result;
    const url = managedPracticeAssetPath(media?.serverUrl || media?.dataUrl, "generation-log-assets");
    return {
        id: task.id,
        createdAt: task.createdAt,
        selection,
        sourceUrl,
        prompt: task.prompt,
        status: task.status,
        model: task.config.logicalModel || task.config.model || undefined,
        ...(task.status === "success" && url && media ? { image: { url, storageKey: "", width: media.width || 0, height: media.height || 0, bytes: media.bytes || 0, mimeType: media.mimeType || "image/png" } } : {}),
        ...(task.error ? { error: toSafeGenerationErrorMessage(task.error, "本次练习未生成图片") } : {}),
    };
}

function managedPracticeAssetPath(value: string | undefined, route: "reference-assets" | "generation-log-assets") {
    if (!value) return "";
    try {
        const url = new URL(value, "https://local.invalid");
        const prefix = `/api/${route}/`;
        if (!/^https?:$/.test(url.protocol) || !url.pathname.startsWith(prefix)) return "";
        const parts = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
        if (parts.length < 2 || !/^(permanent|temporary)$/.test(parts[0]) || parts.some((part) => !part || part === "." || part === ".." || /[/\\\u0000-\u001f]/.test(part))) return "";
        return prefix + parts.map(encodeURIComponent).join("/");
    } catch {
        return "";
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse("请先登录", 401);

    const parsed = await readJsonBodyResult<ToolRequest>(request, 128 * 1024);
    if (!parsed.ok) return errorResponse(parsed.message, parsed.status);
    const body = parsed.data;
    if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("请求内容格式错误", 400);
    // Do not silently ignore privilege/routing overrides. The model and execution profile are server-owned.
    if (["model", "channelId", "provider", "executionProfile", "config"].some((key) => key in body)) return errorResponse("模型与执行环境由练习平台管理，不能由请求指定", 400);

    const tool = getPracticeImageToolConfig(typeof body.toolId === "string" ? body.toolId : "");
    if (!tool || tool.kind === "local-image") return errorResponse("练习工具类型无效", 400);
    if (tool.id === "ai-outpainting") return submitOutpainting(request, body, user);
    const trial = body.action === "try-generate";
    if (body.action !== undefined && (!trial || tool.id !== "reverse-prompt" || Object.keys(body).some((key) => !["action", "toolId", "prompt", "clientRequestId", "reverseHistoryId"].includes(key))))
        return errorResponse("试生成只支持输入文本提示词", 400);
    const source = trial ? null : await ownReferenceUrl(body.sourceUrl, request.url, user.id);
    if (!trial && !source) return errorResponse("请上传有效的练习图片", 400);
    const mask = body.maskUrl === undefined ? undefined : await ownReferenceUrl(body.maskUrl, request.url, user.id);
    if (body.maskUrl !== undefined && !mask) return errorResponse("编辑蒙版无效，请重新绘制", 400);
    if (tool.id === "local-edit" && !mask) return errorResponse("请先绘制需要修改的蒙版区域", 400);
    const publicOrigin = resolvePublicRequestOrigin(request);
    const sourceUrl = source ? createSignedReferenceAssetUrl(source.storageKey, publicOrigin, user.id) : undefined;
    const maskUrl = mask ? createSignedReferenceAssetUrl(mask.storageKey, publicOrigin, user.id) : undefined;
    if ((!trial && !sourceUrl) || (mask && !maskUrl)) return errorResponse("无法为练习图片创建安全读取凭证，请重新上传", 503);
    const expression = tool.id === "expression-reference" ? readExpressionSelection(body.expression) : null;
    if (tool.id === "expression-reference" && (!expression || mask)) return errorResponse("请先选择要修改的人物脸部和表情", 400);
    const prompt = expression ? expressionLesson(expression).prompt : typeof body.prompt === "string" ? body.prompt.trim().slice(0, 20_000) : "";
    if ((trial || tool.id !== "reverse-prompt") && !prompt) return errorResponse(trial ? "请输入生图提示词" : "请填写本次编辑说明", 400);
    const clientRequestId = typeof body.clientRequestId === "string" && /^[\w-]{8,160}$/.test(body.clientRequestId) ? body.clientRequestId : "";
    if (!clientRequestId) return errorResponse("练习请求标识无效，请重试", 400);

    let practiceAccess: Awaited<ReturnType<typeof requirePracticeAccess>>;
    try {
        practiceAccess = await requirePracticeAccess(user);
    } catch (error) {
        return practiceAccessErrorResponse(error);
    }

    const scope = { userId: user.id, schoolId: practiceAccess.schoolId };
    const reverseHistory = body.reverseHistory === undefined ? null : readReversePromptHistoryInput(body.reverseHistory);
    if (body.reverseHistory !== undefined && (!reverseHistory || tool.id !== "reverse-prompt" || trial)) return errorResponse("反推练习设置无效", 400);
    const reverseHistoryId = typeof body.reverseHistoryId === "string" && /^[\w-]{1,160}$/.test(body.reverseHistoryId) ? body.reverseHistoryId : "";
    if (body.reverseHistoryId !== undefined && (!trial || !reverseHistoryId)) return errorResponse("反推历史标识无效", 400);
    let sourceKey = source?.storageKey;
    try {
        if (reverseHistoryId && reversePromptHistoryEnabled() && !(await getReversePromptHistory(scope, reverseHistoryId))) return errorResponse("找不到该反推练习", 404);
        if (reverseHistory && source && reversePromptHistoryEnabled() && (!sourceKey?.startsWith("permanent/") || source.registration.scope !== "reference")) {
            const bytes = await readRegisteredMediaBytes(source.registration, creativeUploadMaxBytes("image"));
            const durable = await writePersistentMediaDataUrl(`data:${source.registration.mimeType};base64,${bytes.toString("base64")}`, "image", { ownerUserId: user.id, source: "practice-reverse-prompt" });
            sourceKey = durable.token;
        }
    } catch {
        return errorResponse("无法保存练习素材或检查历史，请稍后重试", 503);
    }

    const capability = !trial && tool.kind === "ai-text" ? "text" : "image";
    const settings = await getAuthSettings();
    const practiceImageTool = trial ? "reverse-prompt-trial" : capability === "text" ? "reverse-prompt" : expression ? "expression-reference" : "local-edit";
    const configuredModel = practiceCanvasVirtualModel(capability);
    const taskContext = {
        surface: "canvas" as const,
        executionProfile: "open-source-practice" as const,
        schoolId: practiceAccess.schoolId,
        practiceImageTool,
        ...(capability === "text" ? { requiresImageInput: true } : {}),
        clientRequestId,
    } as const;
    const candidates = resolvePracticeGenerationCandidates(settings, capability, configuredModel, taskContext);
    if (!candidates.length) {
        const error = "当前无限练习模型池没有可用的对应能力模型，请检查练习模型配置";
        if (!expression || !sourceUrl) return errorResponse(error, 503);
        try {
            const now = Date.now();
            const task = await createStoredGenerationTask<ImageTask>(
                "image",
                {
                    ...taskContext,
                    id: randomUUID(),
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    createdAt: now,
                    updatedAt: now,
                    kind: "edit",
                    source: "practice",
                    title: tool.title,
                    status: "error",
                    error,
                    config: { baseUrl: "", apiKey: "", apiFormat: "openai", model: "" },
                    prompt,
                    practiceExpression: expression,
                    references: [{ type: "image", dataUrl: "", url: sourceUrl }],
                },
                GENERATION_TASK_RETENTION_MS,
            );
            return NextResponse.json({ error, record: publicExpressionRecord(task) }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
        } catch {
            return errorResponse(error, 503);
        }
    }
    const endpoint = capability === "text" ? "/api/text-tasks" : "/api/image-tasks";
    const payload =
        capability === "text"
            ? {
                  config: { model: configuredModel },
                  messages: [
                      {
                          role: "user",
                          content: [
                              { type: "text", text: buildPracticeReversePromptInstruction(prompt) },
                              { type: "image_url", image_url: { url: sourceUrl } },
                          ],
                      },
                  ],
                  context: taskContext,
              }
            : {
                  kind: trial ? "generation" : "edit",
                  ...(expression ? { practiceExpression: expression } : {}),
                  config: { model: configuredModel, size: "auto", quality: "auto" },
                  prompt: tool.id === "local-edit" ? `${LOCAL_EDIT_PROMPT_PREFIX}${prompt}` : prompt,
                  references: trial ? [] : [{ type: "image", url: sourceUrl }],
                  ...(maskUrl ? { mask: { type: "image", url: maskUrl } } : {}),
                  source: "practice",
                  title: trial ? "反推提示词 · 试生成" : tool.title,
                  context: taskContext,
              };
    const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(user.id, practiceAccess.schoolId, clientRequestId) });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    try {
        const upstream = await fetchInternalApi(new URL(endpoint, resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(payload) });
        const result = (await upstream.json().catch(() => ({}))) as { task?: { id?: unknown; model?: unknown }; error?: unknown };
        if (!upstream.ok || typeof result.task?.id !== "string") return errorResponse(toSafeGenerationErrorMessage(typeof result.error === "string" ? result.error : "练习任务提交失败", "练习任务提交失败"), upstream.status || 502);
        const historyLink = reverseHistory && sourceKey ? { sourceKey, ...reverseHistory } : reverseHistoryId ? { historyId: reverseHistoryId } : null;
        let historyWarning: string | undefined;
        if (historyLink && reversePromptHistoryEnabled()) {
            try {
                await attachReversePromptHistory(scope, result.task.id, historyLink);
            } catch (error) {
                console.warn("Reverse prompt history attachment failed", { taskId: result.task.id, error: error instanceof Error ? error.name : "unknown" });
                historyWarning = "任务已提交，但未能关联到历史记录";
            }
        }
        return NextResponse.json({ task: { id: result.task.id, type: capability, model: typeof result.task.model === "string" ? result.task.model : candidates[0]?.logicalModelId || configuredModel }, historyWarning });
    } catch {
        return errorResponse("练习任务提交失败，请稍后重试", 502);
    }
}

function publicOutpaintingRecord(task: ImageTask): OutpaintingRecord | null {
    const snapshot = readOutpaintingSnapshot(task.practiceOutpainting);
    const source = task.practiceOutpainting?.sourceUrl;
    const sourceUrl = managedPracticeAssetPath(source, "reference-assets") || managedPracticeAssetPath(source, "generation-log-assets");
    const media = task.result?.results?.[0] || task.result;
    const url = managedPracticeAssetPath(media?.serverUrl || media?.dataUrl, "generation-log-assets");
    if (!snapshot || !sourceUrl || !url || !media || !task.prompt) return null;
    return {
        ...snapshot,
        id: task.id,
        createdAt: task.createdAt,
        sourceUrl,
        prompt: task.prompt,
        model: task.config.logicalModel || task.config.model,
        image: { url, width: media.width || 0, height: media.height || 0, bytes: media.bytes || 0, mimeType: media.mimeType || "image/png" },
    };
}

async function submitOutpainting(request: Request, body: ToolRequest, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
    const selection = readOutpaintingSelection(body.outpainting);
    const inputId = typeof body.clientRequestId === "string" && /^[\w-]{8,140}$/.test(body.clientRequestId) ? body.clientRequestId : "";
    if (!selection || !inputId || Object.keys(body).some((key) => !["toolId", "sourceUrl", "outpainting", "clientRequestId"].includes(key))) return errorResponse("扩图范围或请求参数无效", 400);
    const clientRequestId = `outpainting-${inputId}`;
    let access: Awaited<ReturnType<typeof requirePracticeAccess>>;
    try {
        access = await requirePracticeAccess(user);
    } catch (error) {
        return practiceAccessErrorResponse(error);
    }
    let sourceUrl = "";
    let scope: "reference" | "generation" = "reference";
    try {
        const requested = new URL(typeof body.sourceUrl === "string" ? body.sourceUrl : "", request.url);
        if (requested.origin === new URL(request.url).origin && !requested.search && !requested.hash) {
            sourceUrl = managedPracticeAssetPath(requested.href, "reference-assets");
            if (!sourceUrl) {
                scope = "generation";
                sourceUrl = managedPracticeAssetPath(requested.href, "generation-log-assets");
            }
        }
    } catch {
        /* Invalid input. */
    }
    const prefix = scope === "reference" ? "/api/reference-assets/" : "/api/generation-log-assets/";
    if (!sourceUrl.startsWith(`${prefix}permanent/`)) return errorResponse("请上传或选择有效的练习图片", 400);
    const key = sourceUrl.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    const registration = await getLocalMediaRegistration(key);
    if (!registration || registration.ownerUserId !== user.id || registration.type !== "image" || registration.scope !== scope || isLocalMediaRegistrationExpired(registration)) return errorResponse("练习原图不可用或不属于当前账号", 400);
    const existing = await getStoredGenerationTaskByRequest<ImageTask>("image", user.id, clientRequestId, undefined, access.schoolId);
    if (existing) {
        const previous = existing.practiceOutpainting;
        if (previous?.sourceUrl !== sourceUrl || JSON.stringify(readOutpaintingSelection(previous.selection)) !== JSON.stringify(selection)) return errorResponse("同一扩图请求的设置已变化", 409);
        return NextResponse.json({ task: { id: existing.id, type: "image", model: existing.config.logicalModel || existing.config.model } });
    }
    const settings = await getAuthSettings();
    const model = practiceCanvasVirtualModel("image");
    const context = { surface: "canvas", executionProfile: "open-source-practice", schoolId: access.schoolId, clientRequestId, practiceImageTool: "ai-outpainting" } as const;
    const candidates = resolvePracticeGenerationCandidates(settings, "image", model, context);
    let width: number, height: number, dataUrl: string;
    try {
        const bytes = await readRegisteredMediaBytes(registration, creativeUploadMaxBytes("image"));
        dataUrl = `data:${registration.mimeType};base64,${bytes.toString("base64")}`;
        ({ width, height } = await outpaintingSourceSize(dataUrl));
    } catch {
        return errorResponse("无法读取或处理练习原图，请使用有效的静态图片", 400);
    }
    const geometry = outpaintingGeometry(width, height, selection);
    if (!geometry) return errorResponse("扩图框在当前分辨率下无效，请调整边距", 400);
    const size = `${geometry.width}x${geometry.height}`;
    if (!candidates.some((candidate) => !candidate.overflow && supportsOutpaintingOutput(toSystemGenerationChannel(candidate), size, selection.resolution, selection.ratio))) {
        return errorResponse("无限练习图片池没有支持蒙版和所选比例、分辨率的扩图模型", 503);
    }
    try {
        const prepared = await prepareOutpainting(dataUrl, geometry);
        const media = await Promise.all([prepared.image, prepared.mask].map((dataUrl) => writeReferenceImageDataUrl(dataUrl, { ownerUserId: user.id, source: "practice" })));
        const managed = (token: string) => `/api/reference-assets/${token.split("/").map(encodeURIComponent).join("/")}`;
        const headers = new Headers({ "Content-Type": "application/json", ...trustedPracticeTaskHeaders(user.id, access.schoolId, clientRequestId) });
        const cookie = request.headers.get("cookie");
        if (cookie) headers.set("cookie", cookie);
        const payload = {
            kind: "edit",
            source: "practice",
            title: OUTPAINTING_TITLE,
            context,
            config: { model, size, resolution: selection.resolution, quality: "auto" },
            prompt: outpaintingLesson(selection, width, height).prompt,
            references: [{ type: "image/png", url: managed(media[0].token) }],
            mask: { type: "image/png", url: managed(media[1].token) },
            practiceOutpainting: { selection, width, height, sourceUrl },
        };
        const response = await fetchInternalApi(new URL("/api/image-tasks", resolveInternalOrigin(new URL(request.url).origin)), { method: "POST", headers, body: JSON.stringify(payload) });
        const result = (await response.json().catch(() => ({}))) as { task?: { id?: string; model?: string }; error?: string };
        if (!response.ok || !result.task?.id) return errorResponse(toSafeGenerationErrorMessage(result.error || "扩图任务提交失败", "扩图任务提交失败"), response.ok ? 502 : response.status);
        return NextResponse.json({ task: { id: result.task.id, type: "image", model: result.task.model || model } });
    } catch {
        return errorResponse("扩图任务提交失败，请稍后重试", 502);
    }
}

async function ownReferenceUrl(value: unknown, requestUrl: string, ownerUserId: string): Promise<{ storageKey: string; registration: NonNullable<Awaited<ReturnType<typeof getLocalMediaRegistration>>> } | null> {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const base = new URL(requestUrl);
        const url = new URL(value, base);
        if (url.origin !== base.origin || !url.pathname.startsWith("/api/reference-assets/")) return null;
        if (url.search || url.hash || url.pathname.includes("..")) return null;
        const storageKey = url.pathname.slice("/api/reference-assets/".length).split("/").map(decodeURIComponent).join("/");
        if (!/^(?:temporary|permanent)\//.test(storageKey)) return null;
        const registration = await getLocalMediaRegistration(storageKey);
        if (!registration || registration.ownerUserId !== ownerUserId || (registration.scope !== "reference" && registration.scope !== "generation") || registration.type !== "image" || isLocalMediaRegistrationExpired(registration)) return null;
        return { storageKey, registration };
    } catch {
        return null;
    }
}

function practiceAccessErrorResponse(error: unknown) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 403;
    return errorResponse(error instanceof Error ? error.message : "当前账号没有无限练习权限", status);
}

function errorResponse(error: string, status: number) {
    return NextResponse.json({ error }, { status });
}
