import groups from "./drama-lab-style-options.json";

/** Production L styleOptions/dramaStyleMerge semantics. Never rewrite the stored selection. */
export function resolveDramaLabStylePrompt(value: string | undefined): { zh: string; en: string } {
    const style = value?.trim() || "";
    const preset = groups.flatMap((group) => group.options).find((option) => option.value === style);
    return preset ? { zh: preset.prompt, en: preset.promptEn } : { zh: style, en: style };
}

export function dramaLabStyleContext(value: string | undefined) {
    const { zh, en } = resolveDramaLabStylePrompt(value);
    return { stylePromptZh: zh, stylePromptEn: en };
}

/** Replace only the declared frame variables in one pass; user text is never evaluated. */
export function renderDramaLabFrameTemplate(template: string, project: { style: string; ratio: string }) {
    const variables = { ...dramaLabStyleContext(project.style), aspectRatio: project.ratio };
    return template.replace(/\{\{(stylePromptZh|stylePromptEn|aspectRatio)\}\}/g, (_, key: keyof typeof variables) => variables[key]);
}
