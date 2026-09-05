import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { canonicalDramaLabPromptKey, dramaLabPromptDefinition, isDramaLabPromptKey } from "@/lib/drama-lab-prompt-templates";
import { authorizeDramaLabAdmin, badRequest, serverError, textValue } from "../../_lib";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        if (isDramaLabPromptKey(id)) {
            const definition = dramaLabPromptDefinition(id);
            const templateKey = canonicalDramaLabPromptKey(id);
            const template = textValue(body.template, 100_000, true);
            if (!template) return badRequest("Prompt template cannot be empty");
            // The global partial unique index makes this UPSERT safe when two
            // administrators customize a built-in prompt concurrently.
            const result = await postgresQuery(
                `INSERT INTO drama_lab_prompt_templates (id, user_id, template_key, name, category, template, variables)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                 ON CONFLICT (template_key) WHERE deleted_at IS NULL AND template_key IS NOT NULL
                 DO UPDATE SET template = EXCLUDED.template, updated_at = NOW()
                 RETURNING id, template_key, name, category, template, variables, created_at, updated_at`,
                [`tpl_${randomUUID()}`, auth.user.id, templateKey, definition.name, definition.category, template, JSON.stringify(definition.variables)],
            );
            return NextResponse.json({ code: 0, data: { ...result.rows[0], id, is_builtin: true, is_customized: true } });
        }
        return badRequest("Short Drama Lab only supports its nine bound system templates");
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
                 WHERE template_key = $1 AND deleted_at IS NULL`,
                [canonicalDramaLabPromptKey(id)],
            );
            return NextResponse.json({ code: 0, msg: "Prompt template reset" });
        }
        return badRequest("Short Drama Lab only supports its nine bound system templates");
    } catch (error) {
        console.error("Failed to delete drama lab prompt template", error);
        return serverError();
    }
}
