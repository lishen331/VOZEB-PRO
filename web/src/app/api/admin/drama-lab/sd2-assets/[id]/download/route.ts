import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { authorizeDramaLabAdmin, fileNameForDownload, notFound, sd2StoragePath, serverError } from "../../../_lib";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const result = await postgresQuery(
            `SELECT name, file_path, mime_type FROM drama_lab_sd2_assets
             WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            [id, auth.user.id],
        );
        const row = result.rows[0] as { name?: unknown; file_path?: unknown; mime_type?: unknown } | undefined;
        if (!row || typeof row.file_path !== "string" || !row.file_path) return notFound("SD2 asset file not found");

        const bytes = await readFile(sd2StoragePath(row.file_path).target);
        return new NextResponse(bytes, {
            headers: {
                "Content-Type": typeof row.mime_type === "string" && row.mime_type ? row.mime_type : "application/octet-stream",
                "Content-Length": String(bytes.byteLength),
                "Content-Disposition": `attachment; filename="${fileNameForDownload(String(row.name || "sd2-asset"))}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return notFound("SD2 asset file not found");
        console.error("Failed to download drama lab SD2 asset", error);
        return serverError("SD2 asset download failed");
    }
}
