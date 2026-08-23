import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, objectValue, serverError, textValue, validAspectRatio, validResolution } from "../_lib";

export async function GET(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    const search = textValue(request.nextUrl.searchParams.get("search"), 120) || "";
    try {
        const result = await postgresQuery(
            `SELECT id, name, aspect_ratio, resolution, settings, created_at, updated_at
             FROM drama_lab_business_scenarios
             WHERE user_id = $1 AND deleted_at IS NULL
               AND ($2 = '' OR name ILIKE '%' || $2 || '%')
             ORDER BY updated_at DESC
             LIMIT 200`,
            [auth.user.id, search],
        );
        return NextResponse.json({ code: 0, data: result.rows });
    } catch (error) {
        console.error("Failed to list drama lab business scenarios", error);
        return serverError();
    }
}

export async function POST(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
        const name = textValue(body.name, 200, true);
        const aspectRatio = validAspectRatio(body.aspectRatio);
        const resolution = validResolution(body.resolution);
        const settings = objectValue(body.settings);
        if (!name || !aspectRatio || !resolution || !settings) return badRequest("Invalid business scenario");

        const id = `scenario_${randomUUID()}`;
        const result = await postgresQuery(
            `INSERT INTO drama_lab_business_scenarios (id, user_id, name, aspect_ratio, resolution, settings)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             RETURNING id, name, aspect_ratio, resolution, settings, created_at, updated_at`,
            [id, auth.user.id, name, aspectRatio, resolution, JSON.stringify(settings)],
        );
        return NextResponse.json({ code: 0, data: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error("Failed to create drama lab business scenario", error);
        return serverError();
    }
}
