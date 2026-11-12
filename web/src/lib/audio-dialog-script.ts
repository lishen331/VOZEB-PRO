/*
 * 多人对话脚本：画布输入框和音频任务共用同一套解析与校验，保证前端提示和后端校验一致。
 * 一行为一句，格式「名字：台词」，名字 1～8 个字，中英文冒号都可以。
 * 不符合格式的行（普通段落、「注意：明天」这类单句）不会被当成台词。
 */

export type DialogLine = { role: string; text: string };
export type DialogRole = { voice: string; instruction?: string; emotion?: string };

const LINE_PATTERN = /^\s*([^\s：:]{1,8})\s*[：:]\s*(\S.*)$/;

export const DIALOG_LIMITS = { minRoles: 2, maxRoles: 10, maxLines: 100, maxCharsPerLine: 500, gapMs: 300 };

/** 解析对话脚本；不符合「名字：台词」的行直接忽略。 */
export function parseDialogScript(text: string): DialogLine[] {
    return (text || "")
        .split("\n")
        .map((line) => line.match(LINE_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => ({ role: match[1].trim(), text: match[2].trim().slice(0, DIALOG_LIMITS.maxCharsPerLine) }))
        .filter((line) => line.text.length > 0);
}

/** 脚本里出现过的角色，按首次出现顺序。 */
export function dialogRoles(lines: DialogLine[]) {
    return [...new Set(lines.map((line) => line.role))];
}

/** 文本是否「看起来像多人对话」：至少两个不同角色，用于输入框上方的切换提示。 */
export function detectDialogScript(text: string) {
    const lines = parseDialogScript(text);
    const roles = dialogRoles(lines);
    return { lines, roles, suggested: roles.length >= DIALOG_LIMITS.minRoles };
}

/** 提交前的整体校验：角色数、句数都在限制内，且每个角色都配了音色。返回 null 表示通过。 */
export function validateDialog(lines: DialogLine[], roles: Record<string, DialogRole | undefined>) {
    const names = dialogRoles(lines);
    if (names.length < DIALOG_LIMITS.minRoles) return "多人对话至少要 2 个角色，每行写成「名字：台词」";
    if (names.length > DIALOG_LIMITS.maxRoles) return `多人对话最多 ${DIALOG_LIMITS.maxRoles} 个角色`;
    if (lines.length > DIALOG_LIMITS.maxLines) return `多人对话最多 ${DIALOG_LIMITS.maxLines} 句`;
    const missing = names.find((name) => !roles[name]?.voice?.trim());
    if (missing) return `角色「${missing}」还没有选择音色`;
    return null;
}
