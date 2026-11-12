import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import type { LogicalModelCapability } from "@/lib/auth/store";
import { listPracticeCanvasPoolModels, practiceCanvasVirtualModel } from "@/lib/server/runninghub-workflow-runtime";
import { resolvePracticeModelTestAccess } from "@/lib/server/user-navigation-permissions";

export const dynamic = "force-dynamic";

const CAPABILITIES = ["image", "video", "text"] as const;

/**
 * 练习画布的模型下拉数据。普通用户只拿到对应能力的一个虚拟名，下拉不可切换；
 * 持有"练习模型测试"权限的用户拿到练习池里的真实上游模型。
 * 正式画布不调用本接口。
 */
export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const type = new URL(request.url).searchParams.get("type") || "";
    if (!CAPABILITIES.includes(type as (typeof CAPABILITIES)[number])) return NextResponse.json({ error: "模型类型无效" }, { status: 400 });
    const capability = type as LogicalModelCapability;
    const practiceModelTest = await resolvePracticeModelTestAccess(user, { executionProfile: "open-source-practice", surface: "canvas" });
    if (!practiceModelTest) {
        const virtual = practiceCanvasVirtualModel(capability);
        return NextResponse.json({ mode: "fixed", models: virtual ? [{ id: virtual, name: virtual }] : [] });
    }
    const settings = await getAuthSettings();
    return NextResponse.json({ mode: "selectable", models: listPracticeCanvasPoolModels(settings, capability) });
}
