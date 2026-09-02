import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { authorizeDramaLabAdmin, legacyReadOnly, serverError, textValue } from "../_lib";

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

export async function POST() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    return legacyReadOnly();
}
