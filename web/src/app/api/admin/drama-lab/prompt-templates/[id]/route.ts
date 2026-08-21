import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { dramaLabPromptDefinition, isDramaLabPromptKey } from "@/lib/drama-lab-prompt-templates";
import { authorizeDramaLabAdmin, badRequest, notFound, promptCategory, serverError, stringArrayValue, textValue } from "../../_lib";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        if (isDramaLabPromptKey(id)) {
            const definition = dramaLabPromptDefinition(id);
            const template = textValue(body.template, 100_000, true);
            if (!template) return badRequest("Prompt template cannot be empty");
            const current = await postgresQuery<{ id: string }>(
                `SELECT id FROM drama_lab_prompt_templates
                 WHERE user_id = $1 AND template_key = $2 AND deleted_at IS NULL
                 LIMIT 1`,
                [auth.user.id, id],
            );
            const result = current.rows[0]
                ? await postgresQuery(
                      `UPDATE drama_lab_prompt_templates
                       SET template = $1, updated_at = NOW()
                       WHERE id = $2 AND user_id = $3
                       RETURNING id, template_key, name, category, template, variables, created_at, updated_at`,
                      [template, current.rows[0].id, auth.user.id],
                  )
                : await postgresQuery(
                      `INSERT INTO drama_lab_prompt_templates (id, user_id, template_key, name, category, template, variables)
                       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                       RETURNING id, template_key, name, category, template, variables, created_at, updated_at`,
                      [`tpl_${randomUUID()}`, auth.user.id, id, definition.name, definition.category, template, JSON.stringify(definition.variables)],
                  );
            return NextResponse.json({ code: 0, data: { ...result.rows[0], id, is_builtin: true, is_customized: true } });
        }
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
        if (isDramaLabPromptKey(id)) {
            await postgresQuery(
                `DELETE FROM drama_lab_prompt_templates
                 WHERE user_id = $1 AND template_key = $2 AND deleted_at IS NULL`,
                [auth.user.id, id],
            );
            return NextResponse.json({ code: 0, msg: "Prompt template reset" });
        }
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
