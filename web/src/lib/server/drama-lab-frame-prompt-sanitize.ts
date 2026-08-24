/** Deterministic post-processing inherited from LocalMiniDrama's frame path. */
export type DramaFrameSanitizeStep = {
    step: "normalize_appearance" | "unlisted_character" | "orphan_position" | "scene_appearance" | "modern_prop_boilerplate" | "cleanup_punctuation";
    changed: boolean;
    hitCount: number;
    removedChars: number;
};

export type DramaFrameSanitizeReport = {
    allowedNames: string[];
    changed: boolean;
    originalLength: number;
    finalLength: number;
    totalRemovedChars: number;
    changedSteps: DramaFrameSanitizeStep["step"][];
    steps: DramaFrameSanitizeStep[];
};

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function step(report: DramaFrameSanitizeReport, name: DramaFrameSanitizeStep["step"], before: string, after: string, hits: unknown[]) {
    const entry = { step: name, changed: before !== after, hitCount: hits.length, removedChars: Math.max(0, before.length - after.length) };
    report.steps.push(entry);
    if (entry.changed) report.changedSteps.push(name);
}

function normalizeAppearance(prompt: string, allowedNames: string[]) {
    let output = prompt;
    let hits = 0;
    for (const name of allowedNames) {
        if (!name) continue;
        const escaped = escapeRegExp(name);
        output = output.replace(new RegExp(`${escaped}[（(]([^）)]*)[）)]`, "g"), (match, inner: string) => {
            if (/参考图|reference\s*image/i.test(inner)) return match;
            hits += 1;
            return `${name}（参考图中的人物形象）`;
        });
    }
    return { output, hits };
}

function stripUnlisted(prompt: string, allowedNames: string[], allNames: string[]) {
    const allowed = new Set(allowedNames);
    let output = prompt;
    let hits = 0;
    for (const name of new Set([...allNames, ...allowedNames])) {
        if (!name || allowed.has(name)) continue;
        const escaped = escapeRegExp(name);
        const before = output;
        output = output.replace(new RegExp(`[，,]?${escaped}（[^）]*）`, "g"), "");
        output = output.replace(new RegExp(`[，,]?${escaped}(?:位于|站在|坐在|表情|眼神|面向|背对)[^，,。]+`, "g"), "");
        if (output !== before) hits += 1;
    }
    return { output, hits };
}

function stripSceneAppearance(prompt: string) {
    const fragments = [/面容[一-龥a-zA-Z]{0,20}/g, /眉眼[一-龥a-zA-Z]{0,20}/g, /面部轮廓[一-龥a-zA-Z]{0,20}/g, /眼神[一-龥]{0,12}/g, /长发[一-龥]{0,16}/g, /短发[一-龥]{0,16}/g, /发色[一-龥]{0,12}/g];
    let hits = 0;
    const output = prompt.replace(/(场景为[^，,。]+|环境[^，,。]+|背景[^，,。]{0,80})/g, (segment) => {
        let cleaned = segment;
        for (const fragment of fragments)
            cleaned = cleaned.replace(new RegExp(fragment.source, fragment.flags), () => {
                hits += 1;
                return "";
            });
        return cleaned.replace(/[，,]{2,}/g, "，").replace(/^[，,\s]+|[，,\s]+$/g, "");
    });
    return { output, hits };
}

function stripBoilerplate(prompt: string) {
    let output = prompt;
    let hits = 0;
    const patterns = [
        /智能手机(?:\/平板)?(?:为|是)?(?:真实|正常)[\d.\-–—]+英寸[^，,。]*/g,
        /书籍和遥控器均为真实家居小尺寸/g,
        /遥控器均为真实家居小尺寸/g,
        /A5\/A4(?:真实|家居)?尺寸/g,
        /画面高度占比(?:严格)?[\d.%\-–—]+(?:以内)?/g,
        /平放于茶几(?:表面|上)[^，,。]*/g,
        /茶几高度约[\d]+cm/g,
    ];
    for (const pattern of patterns)
        output = output.replace(new RegExp(pattern.source, pattern.flags), (match) => {
            hits += 1;
            return "";
        });
    return { output, hits };
}

export function sanitizeDramaLabFramePrompt(prompt: string, allowedNames: string[], allNames: string[]) {
    const original = prompt.trim();
    const report: DramaFrameSanitizeReport = { allowedNames, changed: false, originalLength: original.length, finalLength: original.length, totalRemovedChars: 0, changedSteps: [], steps: [] };
    let output = original;
    const normalized = normalizeAppearance(output, allowedNames);
    step(report, "normalize_appearance", output, normalized.output, Array(normalized.hits));
    output = normalized.output;
    const unlisted = stripUnlisted(output, allowedNames, allNames);
    step(report, "unlisted_character", output, unlisted.output, Array(unlisted.hits));
    output = unlisted.output;
    const orphan = output.replace(/[，,](位于画面[^，,]+)/g, (full, clause: string, offset: number, source: string) => (/人物形象）|reference image\)/i.test(source.slice(Math.max(0, offset - 100), offset)) ? full : clause ? "" : full));
    step(report, "orphan_position", output, orphan, []);
    output = orphan;
    const scene = stripSceneAppearance(output);
    step(report, "scene_appearance", output, scene.output, Array(scene.hits));
    output = scene.output;
    const boilerplate = stripBoilerplate(output);
    step(report, "modern_prop_boilerplate", output, boilerplate.output, Array(boilerplate.hits));
    output = boilerplate.output;
    const punctuation = output
        .replace(/[，,]{2,}/g, "，")
        .replace(/\s{2,}/g, " ")
        .replace(/^[，,\s]+|[，,\s]+$/g, "")
        .trim();
    step(report, "cleanup_punctuation", output, punctuation, []);
    output = punctuation;
    report.finalLength = output.length;
    report.totalRemovedChars = Math.max(0, report.originalLength - report.finalLength);
    report.changed = output !== original;
    return { prompt: output, report };
}
