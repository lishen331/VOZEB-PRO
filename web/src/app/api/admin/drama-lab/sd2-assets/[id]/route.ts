import { unlink } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, notFound, sd2AssetType, sd2StoragePath, serverError, textValue } from "../../_lib";

type Params = { params: Promise<{ id: string }> };

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

export async function PUT(request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        const name = body.name === undefined ? undefined : textValue(body.name, 255, true);
        const type = body.type === undefined ? undefined : sd2AssetType(body.type);
        const enabled = body.enabled === undefined ? undefined : body.enabled;
        const downloadUrl = body.downloadUrl === undefined ? undefined : textValue(body.downloadUrl, 2_000);
        if (!id || (body.name !== undefined && !name) || (body.type !== undefined && !type) || (enabled !== undefined && typeof enabled !== "boolean")) {
            return badRequest("Invalid SD2 asset");
        }
        if (downloadUrl) {
            try {
                const parsed = new URL(downloadUrl);
                if (!/^https?:$/.test(parsed.protocol)) return badRequest("Download URL must use HTTP or HTTPS");
            } catch {
                return badRequest("Invalid download URL");
            }
        }

        const current = await postgresQuery("SELECT id, name, type, file_size, file_path, download_url, mime_type, enabled, created_at, updated_at FROM drama_lab_sd2_assets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, auth.user.id]);
        if (!current.rows[0]) return notFound("SD2 asset not found");
        const row = current.rows[0] as Record<string, unknown>;
        const result = await postgresQuery(
            `UPDATE drama_lab_sd2_assets
             SET name = $1, type = $2, enabled = $3, download_url = $4, updated_at = NOW()
             WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL
             RETURNING id, name, type, file_size, file_path, download_url, mime_type, enabled, created_at, updated_at`,
            [name || row.name, type || row.type, enabled === undefined ? row.enabled : enabled, downloadUrl === undefined ? row.download_url : downloadUrl || null, id, auth.user.id],
        );
        return NextResponse.json({ code: 0, data: serializeAsset(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
        console.error("Failed to update drama lab SD2 asset", error);
        return serverError();
    }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const current = await postgresQuery("SELECT file_path FROM drama_lab_sd2_assets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, auth.user.id]);
        if (!current.rows[0]) return notFound("SD2 asset not found");
        const filePath = (current.rows[0] as { file_path?: unknown }).file_path;
        await postgresQuery("UPDATE drama_lab_sd2_assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [id, auth.user.id]);
        if (typeof filePath === "string" && filePath) {
            try {
                await unlink(sd2StoragePath(filePath).target);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Failed to remove SD2 asset file", error);
            }
        }
        return NextResponse.json({ code: 0, msg: "SD2 asset deleted" });
    } catch (error) {
        console.error("Failed to delete drama lab SD2 asset", error);
        return serverError();
    }
}
