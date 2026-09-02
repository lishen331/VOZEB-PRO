import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { startRunningHubWorkflowTest } from "@/lib/server/runninghub-workflow-test-service";
import { RunningHubWorkflowError } from "@/lib/server/runninghub-workflow-service";
import { readRequestBodyBytes } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ workflowKey: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "upstream.manage")) return schoolApiError(403, "当前管理员没有上游配置职责权限");
    const parsed = await readTestBody(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!parsed.data.input || typeof parsed.data.input !== "object" || Array.isArray(parsed.data.input)) return schoolApiError(400, "测试输入无效");
    try {
        const result = await startRunningHubWorkflowTest({
            workflowKey: (await context.params).workflowKey,
            adminId: user.id,
            input: parsed.data.input as Record<string, unknown>,
            references: Array.isArray(parsed.data.references) ? (parsed.data.references as never[]) : [],
        });
        await safeRecordAuditLog({
            action: "admin.runninghub.workflow.test.start",
            actor: auditActorFromRequest(request, user),
            target: { type: "runninghub_workflow", id: result.workflowKey },
            metadata: { runId: result.runId, version: result.workflowVersion, taskId: result.taskId },
        });
        return schoolApiOk(result);
    } catch (error) {
        if (error instanceof RunningHubWorkflowError) return schoolApiError(error.status, error.message);
        return schoolApiFailure(error, "RunningHub 工作流测试提交失败");
    }
}

async function readTestBody(request: Request): Promise<{ ok: true; data: { input?: unknown; references?: unknown[] } } | { ok: false; status: number; message: string }> {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
        const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 1024 * 1024);
        return parsed.ok ? { ok: true, data: { input: parsed.data.input, references: Array.isArray(parsed.data.references) ? parsed.data.references : [] } } : parsed;
    }
    try {
        const bytes = await readRequestBodyBytes(request, 4 * 1024 * 1024);
        const form = await new Request(request.url, { method: request.method, headers: { "content-type": contentType }, body: bytes }).formData();
        const input = JSON.parse(String(form.get("input") || "{}")) as unknown;
        const references = JSON.parse(String(form.get("references") || "[]")) as unknown;
        const fileKeys = JSON.parse(String(form.get("fileKeys") || "[]")) as unknown;
        const keys = Array.isArray(fileKeys) ? fileKeys.filter((key): key is string => typeof key === "string") : [];
        const files = form
            .getAll("file")
            .filter((item): item is File => typeof File !== "undefined" && item instanceof File)
            .map((file, index) => ({ type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio", inputKey: keys[index], file, fileName: file.name }));
        return { ok: true, data: { input, references: [...(Array.isArray(references) ? references : []), ...files] } };
    } catch {
        return { ok: false, status: 400, message: "测试 multipart 参数无效" };
    }
}
