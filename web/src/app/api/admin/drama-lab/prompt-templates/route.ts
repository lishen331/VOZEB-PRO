import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { DRAMA_LAB_PROMPT_DEFINITIONS } from "@/lib/drama-lab-prompt-templates";
import { authorizeDramaLabAdmin, badRequest, legacyReadOnly, promptCategory, serverError, textValue } from "../_lib";

type PromptTemplateRow = {
    id: string;
    template_key: string | null;
    name: string;
    category: string;
    template: string;
    variables: string[];
    created_at: string;
    updated_at: string;
};

export async function GET(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const search = textValue(searchParams.get("search"), 120) || "";
    const categoryValue = searchParams.get("category");
    const category = categoryValue ? promptCategory(categoryValue) : undefined;
    if (categoryValue && !category) return badRequest("Invalid prompt category");

    try {
        const result = await postgresQuery<PromptTemplateRow>(
            `SELECT id, template_key, name, category, template, variables, created_at, updated_at
             FROM drama_lab_prompt_templates
             WHERE template_key IS NOT NULL AND deleted_at IS NULL
             ORDER BY updated_at DESC
             LIMIT 200`,
            [],
        );
        const overrides = new Map(result.rows.filter((item) => item.template_key).map((item) => [item.template_key!, item]));
        const builtIns = DRAMA_LAB_PROMPT_DEFINITIONS.map((definition) => {
            const override = overrides.get(definition.key);
            const customized = Boolean(override?.template?.trim());
            return {
                id: definition.key,
                template_key: definition.key,
                name: definition.name,
                category: definition.category,
                description: definition.description,
                template: customized ? override!.template : definition.template,
                variables: definition.variables,
                is_builtin: true,
                is_customized: customized,
                created_at: override?.created_at,
                updated_at: override?.updated_at,
            };
        });
        const items = builtIns.filter((item) => {
            const matchesSearch = !search || item.name.includes(search) || item.template.includes(search);
            return matchesSearch && (!category || item.category === category);
        });
        return NextResponse.json({ code: 0, data: items });
    } catch (error) {
        console.error("Failed to list drama lab prompt templates", error);
        return serverError();
    }
}

export async function POST(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    void request;
    return legacyReadOnly("创作工坊只支持编辑或恢复九套系统模板，不支持新增未绑定模板");
}
