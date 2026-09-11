import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { addDramaLabStoryOption, DramaLabStoryOptionError, listDramaLabStoryOptions, removeDramaLabStoryOption } from "@/lib/server/drama-lab-story-options-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        return NextResponse.json({ code: 0, data: await listDramaLabStoryOptions(user.id), msg: "OK" });
    } catch (error) {
        return NextResponse.json({ code: 500, data: null, msg: error instanceof Error ? error.message : "剧本选项加载失败" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBody<{ kind?: unknown; value?: unknown }>(request, 16 * 1024);
        const option = await addDramaLabStoryOption(user.id, body.kind, body.value);
        return NextResponse.json({ code: 0, data: option, msg: "自定义选项已保存" }, { status: 201 });
    } catch (error) {
        const status = error instanceof DramaLabStoryOptionError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "自定义选项保存失败" }, { status });
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBody<{ kind?: unknown; value?: unknown }>(request, 16 * 1024);
        const removed = await removeDramaLabStoryOption(user.id, body.kind, body.value);
        return NextResponse.json({ code: 0, data: { removed }, msg: "自定义选项已删除" });
    } catch (error) {
        const status = error instanceof DramaLabStoryOptionError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "自定义选项删除失败" }, { status });
    }
}
