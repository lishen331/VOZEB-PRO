import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, promptCategory, serverError, stringArrayValue, textValue } from "../_lib";

export async function GET(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const search = textValue(searchParams.get("search"), 120) || "";
    const categoryValue = searchParams.get("category");
    const category = categoryValue ? promptCategory(categoryValue) : undefined;
    if (categoryValue && !category) return badRequest("Invalid prompt category");

    try {
        const result = await postgresQuery(
            `SELECT id, name, category, template, variables, created_at, updated_at
             FROM drama_lab_prompt_templates
             WHERE user_id = $1 AND deleted_at IS NULL
               AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR template ILIKE '%' || $2 || '%')
               AND ($3::text IS NULL OR category = $3)
             ORDER BY updated_at DESC
             LIMIT 200`,
            [auth.user.id, search, category || null],
        );
        return NextResponse.json({ code: 0, data: result.rows });
    } catch (error) {
        console.error("Failed to list drama lab prompt templates", error);
        return serverError();
    }
}

export async function POST(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const name = textValue(body.name, 200, true);
        const category = promptCategory(body.category);
        const template = textValue(body.template, 100_000, true);
        const providedVariables = stringArrayValue(body.variables);
        const variables = providedVariables === undefined ? (template ? Array.from(template.matchAll(/\{([^{}]+)\}/g), (match) => match[1].trim()).filter(Boolean) : []) : providedVariables;
        if (!name || !category || !template || variables === null) return badRequest("Invalid prompt template");

        const id = `tpl_${randomUUID()}`;
        const result = await postgresQuery(
            `INSERT INTO drama_lab_prompt_templates (id, user_id, name, category, template, variables)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             RETURNING id, name, category, template, variables, created_at, updated_at`,
            [id, auth.user.id, name, category, template, JSON.stringify(variables)],
        );
        return NextResponse.json({ code: 0, data: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error("Failed to create drama lab prompt template", error);
        return serverError();
    }
}
