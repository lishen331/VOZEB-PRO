import { NextResponse } from "next/server";

import { createLocalMediaResponse } from "@/lib/server/local-media-response";
import { loginPageMediaFile } from "@/lib/server/login-page-media";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ fileName: string }> }) {
    const { fileName } = await context.params;
    const asset = loginPageMediaFile(fileName);
    if (!asset) return NextResponse.json({ error: "登录页物料不存在" }, { status: 404 });
    const response = await createLocalMediaResponse(request, asset.filePath, asset.mimeType, { "Cache-Control": "public, max-age=300", "Cross-Origin-Resource-Policy": "same-origin" });
    return response || NextResponse.json({ error: "登录页物料不存在" }, { status: 404 });
}
