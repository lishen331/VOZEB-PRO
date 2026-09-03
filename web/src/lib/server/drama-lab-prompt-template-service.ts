import { canonicalDramaLabPromptKey, dramaLabPromptDefinition, type DramaLabPromptDefinition, type DramaLabPromptKey } from "@/lib/drama-lab-prompt-templates";
import { getDatabaseProvider, postgresQuery } from "@/lib/server/database";

type PromptTemplateRow = {
    id: string;
    template_key: string;
    template: string;
};

export type DramaLabResolvedPrompt = DramaLabPromptDefinition & {
    template: string;
    customized: boolean;
};

export async function resolveDramaLabPrompt(key: DramaLabPromptKey): Promise<DramaLabResolvedPrompt> {
    const definition = dramaLabPromptDefinition(key);
    if (getDatabaseProvider() !== "postgres") return { ...definition, customized: false };
    const canonicalKey = canonicalDramaLabPromptKey(key);

    const result = await postgresQuery<PromptTemplateRow>(
        `SELECT template_key, template
         FROM drama_lab_prompt_templates
         WHERE template_key = $1 AND deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [canonicalKey],
    );
    const template = result.rows[0]?.template?.trim();
    return { ...definition, template: template || definition.template, customized: Boolean(template) };
}

export function withDramaLabPromptContract(template: string, contract: string) {
    return `${template.trim()}\n\n【系统固定输出契约，不可由模板覆盖】\n${contract.trim()}`;
}
