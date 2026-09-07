import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { deletePrompt, updatePrompt, type PromptInput } from "@/lib/prompts/store";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("my-prompts");
        const { id } = await context.params;
        const body = await readJsonBody<PromptInput>(request);
        const prompt = await updatePrompt(id, body, { scope: "user", ownerUserId: currentUser.id });
        return NextResponse.json({ prompt });
    } catch (error) {
        if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ error: error.message }, { status: 403 });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Update user prompt failed", error);
        return NextResponse.json({ error: "更新提示词失败" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    try {
        await requireFeatureModuleEnabled("my-prompts");
        const { id } = await context.params;
        await deletePrompt(id, { scope: "user", ownerUserId: currentUser.id });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ error: error.message }, { status: 403 });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Delete user prompt failed", error);
        return NextResponse.json({ error: "删除提示词失败" }, { status: 500 });
    }
}
