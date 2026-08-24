import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, sd2AssetType, serverError, textValue } from "../_lib";

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

export async function POST(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        const name = textValue(body.name, 255, true);
        const type = sd2AssetType(body.type);
        const downloadUrl = textValue(body.downloadUrl, 2_000);
        const fileSize = body.fileSize === undefined ? 0 : Number(body.fileSize);
        if (!name || !type || !Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > Number.MAX_SAFE_INTEGER) return badRequest("Invalid SD2 asset");
        if (downloadUrl) {
            try {
                const parsed = new URL(downloadUrl);
                if (!/^https?:$/.test(parsed.protocol)) return badRequest("Download URL must use HTTP or HTTPS");
            } catch {
                return badRequest("Invalid download URL");
            }
        }

        const id = `sd2_${randomUUID()}`;
        const result = await postgresQuery(
            `INSERT INTO drama_lab_sd2_assets (id, user_id, name, type, file_size, download_url, enabled)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id, name, type, file_size, file_path, download_url, mime_type, enabled, created_at, updated_at`,
            [id, auth.user.id, name, type, fileSize, downloadUrl || null],
        );
        return NextResponse.json({ code: 0, data: serializeAsset(result.rows[0] as Record<string, unknown>) }, { status: 201 });
    } catch (error) {
        console.error("Failed to create drama lab SD2 asset", error);
        return serverError();
    }
}
