import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { authorizeDramaLabAdmin, badRequest, legacyReadOnly, sd2AssetType, serverError, textValue } from "../_lib";

function serializeAsset(row: Record<string, unknown>) {
    const id = String(row.id);
    const filePath = typeof row.file_path === "string" && row.file_path ? row.file_path : null;
    const remoteUrl = typeof row.download_url === "string" && row.download_url ? row.download_url : null;
    return {
        id,
        name: String(row.name || ""),
        type: row.type,
        fileSize: Number(row.file_size || 0),
        mimeType: row.mime_type || null,
        enabled: Boolean(row.enabled),
        hasLocalFile: Boolean(filePath),
        downloadUrl: remoteUrl || (filePath ? `/api/admin/drama-lab/sd2-assets/${encodeURIComponent(id)}/download` : null),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function GET(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const search = textValue(searchParams.get("search"), 120) || "";
    const typeValue = searchParams.get("type");
    const type = typeValue ? sd2AssetType(typeValue) : undefined;
    const enabledValue = searchParams.get("enabled");
    if (typeValue && !type) return badRequest("Invalid SD2 asset type");
    if (enabledValue && enabledValue !== "true" && enabledValue !== "false") return badRequest("Invalid enabled filter");

    try {
        const result = await postgresQuery(
            `SELECT id, name, type, file_size, file_path, download_url, mime_type, enabled, created_at, updated_at
             FROM drama_lab_sd2_assets
             WHERE user_id = $1 AND deleted_at IS NULL
               AND ($2 = '' OR name ILIKE '%' || $2 || '%')
               AND ($3::text IS NULL OR type = $3)
               AND ($4::boolean IS NULL OR enabled = $4)
             ORDER BY updated_at DESC
             LIMIT 200`,
            [auth.user.id, search, type || null, enabledValue ? enabledValue === "true" : null],
        );
        return NextResponse.json({ code: 0, data: result.rows.map((row) => serializeAsset(row as Record<string, unknown>)) });
    } catch (error) {
        console.error("Failed to list drama lab SD2 assets", error);
        return serverError();
    }
}

export async function POST() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    return legacyReadOnly();
}
