import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, notFound, promptCategory, serverError, stringArrayValue, textValue } from "../../_lib";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const name = textValue(body.name, 200, true);
        const category = promptCategory(body.category);
        const template = textValue(body.template, 100_000, true);
        const providedVariables = stringArrayValue(body.variables);
        const variables = providedVariables === undefined ? (template ? Array.from(template.matchAll(/\{([^{}]+)\}/g), (match) => match[1].trim()).filter(Boolean) : []) : providedVariables;
        if (!id || !name || !category || !template || variables === null) return badRequest("Invalid prompt template");

        const result = await postgresQuery(
            `UPDATE drama_lab_prompt_templates
             SET name = $1, category = $2, template = $3, variables = $4::jsonb, updated_at = NOW()
             WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL
             RETURNING id, name, category, template, variables, created_at, updated_at`,
            [name, category, template, JSON.stringify(variables), id, auth.user.id],
        );
        if (!result.rows[0]) return notFound("Prompt template not found");
        return NextResponse.json({ code: 0, data: result.rows[0] });
    } catch (error) {
        console.error("Failed to update drama lab prompt template", error);
        return serverError();
    }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const result = await postgresQuery(
            `UPDATE drama_lab_prompt_templates
             SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
             RETURNING id`,
            [id, auth.user.id],
        );
        if (!result.rows[0]) return notFound("Prompt template not found");
        return NextResponse.json({ code: 0, msg: "Prompt template deleted" });
    } catch (error) {
        console.error("Failed to delete drama lab prompt template", error);
        return serverError();
    }
}
