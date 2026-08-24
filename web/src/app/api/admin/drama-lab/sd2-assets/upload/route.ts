import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readRequestBodyBytes } from "@/lib/server/request-body-limit";
import { authorizeDramaLabAdmin, badRequest, ensureSd2AssetDirectory, isSd2AssetFileName, SD2_ASSET_MAX_BYTES, sd2AssetType, sd2StorageKey, sd2StoragePath, serverError, textValue } from "../../_lib";

function serializeAsset(row: Record<string, unknown>) {
    const id = String(row.id);
    return {
        id,
        name: String(row.name || ""),
        type: row.type,
        fileSize: Number(row.file_size || 0),
        mimeType: row.mime_type || null,
        enabled: Boolean(row.enabled),
        hasLocalFile: Boolean(row.file_path),
        downloadUrl: `/api/admin/drama-lab/sd2-assets/${encodeURIComponent(id)}/download`,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function POST(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    let storageKey = "";
    try {
        const contentType = request.headers.get("content-type") || "";
        const bytes = await readRequestBodyBytes(request, SD2_ASSET_MAX_BYTES + 1024 * 1024);
        const formData = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        const file = formData.get("file");
        const type = sd2AssetType(formData.get("type"));
        if (!(file instanceof File) || !file.size || !type) return badRequest("A model file and asset type are required");
        if (!isSd2AssetFileName(file.name)) return badRequest("Unsupported SD2 asset file type");
        if (file.size > SD2_ASSET_MAX_BYTES) return NextResponse.json({ code: 413, msg: "SD2 asset is too large" }, { status: 413 });

        const displayName = textValue(formData.get("name"), 255) || file.name.replace(/[\r\n\\/]/g, "_").slice(0, 255) || "SD2 asset";
        const id = `sd2_${randomUUID()}`;
        storageKey = sd2StorageKey(auth.user.id, id, file.name);
        const target = await ensureSd2AssetDirectory(storageKey);
        await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });

        const result = await postgresQuery(
            `INSERT INTO drama_lab_sd2_assets (id, user_id, name, type, file_size, file_path, mime_type, enabled)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING id, name, type, file_size, file_path, download_url, mime_type, enabled, created_at, updated_at`,
            [id, auth.user.id, displayName, type, file.size, storageKey, file.type || "application/octet-stream"],
        );
        return NextResponse.json({ code: 0, data: serializeAsset(result.rows[0] as Record<string, unknown>) }, { status: 201 });
    } catch (error) {
        if (storageKey) {
            try {
                await unlink(sd2StoragePath(storageKey).target);
            } catch {
                // Best-effort cleanup after a failed database insert.
            }
        }
        if (error instanceof SyntaxError) return badRequest("Invalid multipart request");
        console.error("Failed to upload drama lab SD2 asset", error);
        return serverError("SD2 asset upload failed");
    }
}
