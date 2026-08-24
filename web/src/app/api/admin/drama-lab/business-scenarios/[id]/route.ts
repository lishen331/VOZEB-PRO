import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, notFound, objectValue, serverError, textValue, validAspectRatio, validResolution } from "../../_lib";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        const name = textValue(body.name, 200, true);
        const aspectRatio = validAspectRatio(body.aspectRatio);
        const resolution = validResolution(body.resolution);
        const settings = objectValue(body.settings);
        if (!id || !name || !aspectRatio || !resolution || !settings) return badRequest("Invalid business scenario");

        const result = await postgresQuery(
            `UPDATE drama_lab_business_scenarios
             SET name = $1, aspect_ratio = $2, resolution = $3, settings = $4::jsonb, updated_at = NOW()
             WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL
             RETURNING id, name, aspect_ratio, resolution, settings, created_at, updated_at`,
            [name, aspectRatio, resolution, JSON.stringify(settings), id, auth.user.id],
        );
        if (!result.rows[0]) return notFound("Business scenario not found");
        return NextResponse.json({ code: 0, data: result.rows[0] });
    } catch (error) {
        console.error("Failed to update drama lab business scenario", error);
        return serverError();
    }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const result = await postgresQuery(
            `UPDATE drama_lab_business_scenarios
             SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
             RETURNING id`,
            [id, auth.user.id],
        );
        if (!result.rows[0]) return notFound("Business scenario not found");
        return NextResponse.json({ code: 0, msg: "Business scenario deleted" });
    } catch (error) {
        console.error("Failed to delete drama lab business scenario", error);
        return serverError();
    }
}
