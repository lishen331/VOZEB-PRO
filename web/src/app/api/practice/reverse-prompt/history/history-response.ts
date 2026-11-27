import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { getReversePromptHistory, listReversePromptHistory, readReversePromptHistoryCursor, reversePromptHistoryEnabled } from "@/lib/server/practice-reverse-prompt-history-store";

export async function respondToReversePromptHistory(request: Request, id?: string) {
    const user = await getCurrentUser(request);
    const headers = { "Cache-Control": "private, no-store" };
    const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers });
    if (!user) return error("请先登录", 401);
    let schoolId: string;
    try {
        ({ schoolId } = await requirePracticeAccess(user));
    } catch (cause) {
        const status = cause && typeof cause === "object" && "status" in cause && typeof cause.status === "number" ? cause.status : 503;
        return error(status === 403 ? "当前账号没有无限练习权限" : "暂时无法确认练习权限", status);
    }
    try {
        if (!reversePromptHistoryEnabled()) return error("当前环境未启用练习历史存储", 503);
        const scope = { userId: user.id, schoolId };
        if (id !== undefined) {
            const record = /^[\w-]{1,160}$/.test(id) ? await getReversePromptHistory(scope, id) : null;
            return record ? NextResponse.json({ record }, { headers }) : error("找不到该反推练习", 404);
        }
        const raw = new URL(request.url).searchParams.get("cursor");
        const cursor = raw ? readReversePromptHistoryCursor(raw) : null;
        if (raw && !cursor) return error("历史分页参数无效", 400);
        return NextResponse.json(await listReversePromptHistory(scope, cursor), { headers });
    } catch {
        return error("练习历史读取失败，请稍后重试", 503);
    }
}
